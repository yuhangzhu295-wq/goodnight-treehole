/**
 * Health probe for the local development stack: WSL, PostgreSQL, Redis, and the API.
 *
 * Written because "the port is listening" is not health. Every check below performs the operation the
 * product performs:
 *   - PostgreSQL: a real query through Prisma, the same client the API uses;
 *   - Redis: a real PING on a real connection;
 *   - the API: a request to a route that READS THE DATABASE, so a 200 proves the API can reach it
 *     (a route that only touches memory would pass while the database was gone);
 *   - WSL: its state is read WITHOUT starting it, so "stopped" is reported as stopped instead of
 *     being silently papered over by the probe itself.
 *
 * Output is one JSON object on stdout. Exit code 0 = all healthy, 1 = something is down.
 * The database password is never printed.
 *
 * Usage: node scripts/dev/stack-probe.mjs [--api-base http://127.0.0.1:3000]
 */
import { execFileSync } from 'node:child_process';
import net from 'node:net';

const args = process.argv.slice(2);
const apiBase = args.includes('--api-base') ? args[args.indexOf('--api-base') + 1] : 'http://127.0.0.1:3000';
// `ensure-stack` needs to know whether the database is up BEFORE it starts the API, so the API check
// can be left out of that first pass.
const skipApi = args.includes('--skip-api');

/** Runs a command and returns stdout, or '' if it fails. Never throws, and never leaks stderr. */
function run(cmd, cmdArgs) {
  try {
    // `wsl.exe` prints a localised "localhost proxy detected" warning on stderr in some setups.
    // Letting it through makes PowerShell's ErrorActionPreference abort the calling script on a
    // message that is not an error.
    return execFileSync(cmd, cmdArgs, { encoding: 'utf8', timeout: 20_000, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
}

/**
 * WSL state, read without starting the distro.
 *
 * `wsl -l -v` reports a stopped distro as stopped. Anything that executes inside the distro would
 * start it, which is exactly the trap that made a short-lived probe succeed while the long-running
 * API could not reach the database.
 */
function wslState() {
  const raw = run('wsl.exe', ['-l', '-v']).replace(/\0/g, '');
  if (!raw) return { state: 'unknown', distro: null };
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/(\*)?\s*(Ubuntu[\w.-]*)\s+(Running|Stopped|Installing|Converting)/i);
    if (match) return { state: match[3].toLowerCase(), distro: match[2] };
  }
  return { state: 'unknown', distro: null };
}

/** The distro's IPv4 address. Only meaningful while it is running. */
function wslIp() {
  const raw = run('wsl.exe', ['-e', 'bash', '-lc', 'hostname -I']).replace(/\0/g, '');
  const first = raw.trim().split(/\s+/)[0];
  return /^\d+\.\d+\.\d+\.\d+$/.test(first ?? '') ? first : null;
}

async function checkPostgres(url) {
  if (!url) return { ok: false, detail: 'DATABASE_URL not provided' };
  let client;
  try {
    const { PrismaClient } = await import('@prisma/client');
    client = new PrismaClient({ datasources: { db: { url } } });
    const rows = await client.$queryRawUnsafe('select 1 as ok');
    return { ok: Array.isArray(rows) && rows.length === 1, detail: 'select 1' };
  } catch (error) {
    return { ok: false, detail: firstLine(error) };
  } finally {
    await client?.$disconnect().catch(() => undefined);
  }
}

/**
 * A real Redis PING over a real connection, with no package dependency.
 *
 * ioredis is a dependency of `apps/api`, not of the workspace root, so importing it here fails under
 * pnpm's isolated node_modules. Speaking RESP directly keeps the probe runnable from anywhere and is
 * still a genuine round trip: it fails on a closed port, a refused connection, or a wrong server.
 */
async function checkRedis(url) {
  if (!url) return { ok: false, detail: 'REDIS_URL not provided' };
  const { hostname, port } = new URL(url);
  return await new Promise((resolve) => {
    const socket = net.connect({ host: hostname, port: Number(port || 6379) });
    let reply = '';
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(5_000, () => done({ ok: false, detail: 'timeout waiting for PONG' }));
    socket.on('error', (error) => done({ ok: false, detail: firstLine(error) }));
    socket.on('data', (chunk) => {
      reply += chunk.toString('utf8');
      if (reply.includes('+PONG')) done({ ok: true, detail: 'PING -> PONG' });
      else if (reply.startsWith('-')) done({ ok: false, detail: reply.trim().slice(0, 160) });
    });
    socket.on('connect', () => socket.write('*1\r\n$4\r\nPING\r\n'));
  });
}

/**
 * The API check reads a database-backed route on purpose. `/api/health` is a liveness probe that
 * does not touch PostgreSQL, so it stays green while every real request fails - which is exactly the
 * state this probe exists to catch.
 */
async function checkApi() {
  try {
    const response = await fetch(`${apiBase}/api/v1/feedback/faqs`, { signal: AbortSignal.timeout(8_000) });
    const body = await response.text();
    const ok = response.status === 200 && body.includes('"items"');
    return { ok, detail: `GET /api/v1/feedback/faqs -> ${response.status}` };
  } catch (error) {
    return { ok: false, detail: firstLine(error) };
  }
}

function firstLine(error) {
  return String(error?.message ?? error).split('\n').map((l) => l.trim()).filter(Boolean)[0]?.slice(0, 160) ?? 'unknown error';
}

const wsl = wslState();
const ip = wsl.state === 'running' ? wslIp() : null;

// The probe takes the connection strings from the environment; if they are absent it derives them
// from the running distro's address, which is what a caller expects when it just asks "is it up".
const databaseUrl = process.env.DATABASE_URL ?? (ip ? `postgresql://goodnight:goodnight@${ip}:5432/goodnight_treehole?schema=public` : null);
const redisUrl = process.env.REDIS_URL ?? (ip ? `redis://${ip}:6379` : null);

const [postgres, redis, api] = await Promise.all([
  wsl.state === 'running' ? checkPostgres(databaseUrl) : Promise.resolve({ ok: false, detail: 'skipped: WSL is not running' }),
  wsl.state === 'running' ? checkRedis(redisUrl) : Promise.resolve({ ok: false, detail: 'skipped: WSL is not running' }),
  skipApi ? Promise.resolve({ ok: true, detail: 'skipped (--skip-api)' }) : checkApi(),
]);

const report = {
  at: new Date().toISOString(),
  wsl: { state: wsl.state, distro: wsl.distro, ip },
  postgres,
  redis,
  api,
  ok: wsl.state === 'running' && postgres.ok && redis.ok && api.ok,
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
