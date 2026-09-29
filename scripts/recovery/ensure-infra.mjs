#!/usr/bin/env node
/**
 * Brings the recovery infrastructure online and waits until Windows can reach it.
 *
 * Why this exists: this workstation has no Docker Desktop and no administrator
 * rights, so postgres/redis/minio run on the Docker Engine inside the WSL2 Ubuntu
 * distro. Two behaviours make that fragile:
 *
 *   1. WSL2 terminates the VM when it looks idle, which stops the containers.
 *      `vmIdleTimeout` in %USERPROFILE%\.wslconfig was tested and had no effect on
 *      WSL 2.6.3, so a detached `sleep` process inside the distro is used instead -
 *      an idle timeout never fires while a process is alive. Writing a systemd unit
 *      would be cleaner but needs sudo, which requires a password we do not have.
 *   2. Windows only reaches the containers through WSL2 localhost forwarding, which
 *      takes a few seconds to come up after the VM starts.
 *
 * The containers themselves carry `restart: unless-stopped` (see
 * docker-compose.recovery.yml), so starting the distro is normally enough.
 *
 * Usage: node scripts/recovery/ensure-infra.mjs
 * Exit code 0 means all three services answered on their Windows-side ports.
 */
import { spawnSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const distro = process.env.GOODNIGHT_WSL_DISTRO ?? 'Ubuntu';
const ports = [
  { name: 'postgres', port: 15432 },
  { name: 'redis', port: 16379 },
  { name: 'minio', port: 19000 },
];

const remote = `
set -e
if ! pgrep -f "sleep 864000" >/dev/null 2>&1; then
  setsid nohup sleep 864000 >/dev/null 2>&1 < /dev/null &
fi
cd ${JSON.stringify(repoRoot.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`))}
docker compose -f docker-compose.yml -f docker-compose.recovery.yml up -d postgres redis minio >/dev/null
`;

const started = spawnSync('wsl.exe', ['-d', distro, '--', 'bash', '-lc', remote], {
  encoding: 'utf8',
  windowsHide: true,
});
if (started.status !== 0) {
  console.error('[ensure-infra] failed to start WSL services');
  console.error(started.stdout, started.stderr);
  process.exit(1);
}

function probe(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(2000);
    socket.on('connect', () => done(true));
    socket.on('timeout', () => done(false));
    socket.on('error', () => done(false));
  });
}

const deadline = Date.now() + 90_000;
let pending = ports;
while (Date.now() < deadline) {
  const results = await Promise.all(pending.map((p) => probe(p.port)));
  pending = pending.filter((_, index) => !results[index]);
  if (pending.length === 0) break;
  await new Promise((r) => setTimeout(r, 2000));
}

if (pending.length > 0) {
  console.error(`[ensure-infra] not reachable after 90s: ${pending.map((p) => `${p.name}:${p.port}`).join(', ')}`);
  process.exit(1);
}
for (const p of ports) console.log(`[ensure-infra] ${p.name} reachable on 127.0.0.1:${p.port}`);
