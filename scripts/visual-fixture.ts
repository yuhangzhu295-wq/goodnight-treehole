import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const root = process.cwd();
const version = 'v1';
const fixtureRoot = path.join(root, 'fixtures', 'visual', version);
const artifactRoot = path.join(root, 'artifacts', 'visual-fixtures', version);
const runtimeRoot = path.join(artifactRoot, 'runtime');
const uploadsRoot = path.join(runtimeRoot, 'uploads');
const postgresRoot = path.join(runtimeRoot, 'postgres');
const stateFile = path.join(runtimeRoot, 'processes.json');
const manifestFile = path.join(fixtureRoot, 'manifest.json');
const fixtureDatabaseUrl = 'postgresql://goodnight_fixture@127.0.0.1:55433/goodnight_treehole_visual_v1?schema=public';
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const pgBin = process.env.VISUAL_FIXTURE_PG_BIN ?? 'C:\\Program Files\\PostgreSQL\\18\\bin';

type Manifest = { id: string; version: string; fixtureOnly: boolean; runtimeInstanceId: string; database: { host: string; port: number; name: string; schema: string }; services: { api: string; front: string; admin: string; aiStub: string } };
type ProcessEntry = { name: string; pid: number; command: string[]; startedAt: string };

function failure(message: string): never { throw new Error(`[visual-fixture ${version}] ${message}`); }
function executable(name: string) { return path.join(pgBin, process.platform === 'win32' ? `${name}.exe` : name); }
function commandLine(command: string, args: string[]) {
  const quote = (value: string) => /[\s&|<>()^!"]/u.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  return [command, ...args].map(quote).join(' ');
}
function commandInvocation(command: string, args: string[]) {
  return process.platform === 'win32'
    ? { command: process.env.ComSpec ?? 'cmd.exe', args: ['/d', '/c', commandLine(command, args)] }
    : { command, args };
}
function fixtureEnv() {
  return {
    ...process.env,
    VISUAL_FIXTURE_MODE: '1',
    VISUAL_FIXTURE_VERSION: version,
    RUNTIME_INSTANCE_ID: 'visual-fixture-v1',
    DATABASE_URL: fixtureDatabaseUrl,
    GOODNIGHT_UPLOADS_DIR: uploadsRoot,
    API_PORT: '3001',
    AI_LOCAL_MODEL_ENABLED: 'false',
    OLLAMA_ENABLED: 'false',
    AI_ALLOW_OLLAMA_FALLBACK: 'false',
    VISUAL_FIXTURE_AI_MODE: 'stub',
    VISUAL_FIXTURE_AI_BASE_URL: 'http://127.0.0.1:11435',
    OLLAMA_BASE_URL: 'http://127.0.0.1:11435',
    FIXTURE_AI_STUB_PORT: '11435',
    VITE_API_BASE_URL: 'http://127.0.0.1:3001',
  };
}

async function readManifest() {
  const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8')) as Manifest;
  if (!manifest.fixtureOnly || manifest.id !== 'visual-v1' || manifest.version !== version || manifest.runtimeInstanceId !== 'visual-fixture-v1') failure('fixture manifest identity is invalid.');
  if (manifest.database.port !== 55433 || manifest.database.name !== 'goodnight_treehole_visual_v1' || manifest.services.api !== 'http://127.0.0.1:3001' || manifest.services.front !== 'http://127.0.0.1:5175' || manifest.services.admin !== 'http://127.0.0.1:5176' || manifest.services.aiStub !== 'http://127.0.0.1:11435') failure('fixture manifest endpoints are not the approved isolated targets.');
  return manifest;
}

function assertPaths() {
  if (path.resolve(uploadsRoot) === path.join(root, 'data', 'uploads')) failure('fixture uploads resolve to live uploads.');
  if (!path.resolve(postgresRoot).startsWith(`${path.resolve(artifactRoot)}${path.sep}`)) failure('fixture PostgreSQL root escaped the fixture artifact root.');
  const target = new URL(fixtureDatabaseUrl);
  if (target.port !== '55433' || target.pathname !== '/goodnight_treehole_visual_v1' || target.searchParams.get('schema') !== 'public') failure('fixture database URL is invalid.');
}

function run(command: string, args: string[], env = fixtureEnv()) {
  const invocation = commandInvocation(command, args);
  const result = spawnSync(invocation.command, invocation.args, { cwd: root, env, encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) {
    const details = [result.error?.message, result.stdout, result.stderr].filter(Boolean).join('\n').slice(-4000);
    throw new Error(`${command} ${args.join(' ')} failed.\n${details}`);
  }
  return result.stdout;
}

async function portOpen(port: number) {
  return await new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    const complete = (value: boolean) => { socket.removeAllListeners(); socket.destroy(); resolve(value); };
    socket.once('connect', () => complete(true));
    socket.once('error', () => complete(false));
    socket.setTimeout(800, () => complete(false));
  });
}

async function ensurePortFree(port: number, label: string) {
  if (await portOpen(port)) failure(`${label} port ${port} is already occupied; refusing to attach to an unknown process.`);
}

async function waitForHttp(url: string, label: string) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    try { const response = await fetch(url); if (response.ok) return; } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  failure(`timed out waiting for ${label}: ${url}`);
}

async function digestTree(directory: string) {
  const entries: Array<{ path: string; bytes: number; sha256: string }> = [];
  async function visit(current: string) {
    const children = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const child of children) {
      const full = path.join(current, child.name);
      if (child.isDirectory()) await visit(full);
      else if (child.isFile()) {
        const contents = await fs.readFile(full);
        entries.push({ path: path.relative(directory, full).replace(/\\/g, '/'), bytes: contents.length, sha256: crypto.createHash('sha256').update(contents).digest('hex') });
      }
    }
  }
  await visit(directory);
  entries.sort((left, right) => left.path.localeCompare(right.path));
  return { entries, sha256: crypto.createHash('sha256').update(JSON.stringify(entries)).digest('hex') };
}

async function recordLiveUploadsBaseline() {
  const control = await digestTree(path.join(root, 'data', 'uploads'));
  await fs.mkdir(runtimeRoot, { recursive: true });
  await fs.writeFile(path.join(runtimeRoot, 'live-uploads-baseline.json'), JSON.stringify({ capturedAt: new Date().toISOString(), source: 'read-only control; live PostgreSQL is intentionally not contacted', ...control }, null, 2));
}

async function ensureCluster() {
  for (const name of ['initdb', 'pg_ctl', 'postgres', 'createdb', 'psql']) if (!fsSync.existsSync(executable(name))) failure(`PostgreSQL tool not found: ${executable(name)}`);
  await fs.mkdir(runtimeRoot, { recursive: true });
  const pgVersion = path.join(postgresRoot, 'PG_VERSION');
  if (!fsSync.existsSync(pgVersion)) {
    if (fsSync.existsSync(postgresRoot)) await fs.rm(postgresRoot, { recursive: true, force: true });
    run(executable('initdb'), ['-D', postgresRoot, '-U', 'goodnight_fixture', '--auth=trust', '--encoding=UTF8', '--no-locale']);
  }
  const status = spawnSync(executable('pg_ctl'), ['status', '-D', postgresRoot], { cwd: root, env: fixtureEnv(), encoding: 'utf8', windowsHide: true });
  if (status.status !== 0) {
    await ensurePortFree(55433, 'fixture PostgreSQL');
    // pg_ctl may retain the Windows console handle after it has launched the
    // postmaster, which makes spawnSync wait forever. Start the isolated
    // postmaster directly and detach it; readiness is proved below with psql.
    const log = fsSync.openSync(path.join(runtimeRoot, 'postgres.log'), 'a');
    const server = spawn(executable('postgres'), ['-D', postgresRoot, '-p', '55433', '-h', '127.0.0.1'], { cwd: root, env: fixtureEnv(), detached: true, windowsHide: true, stdio: ['ignore', log, log] });
    server.unref();
  }
  const deadline = Date.now() + 30_000;
  let ready = false;
  while (Date.now() < deadline) {
    const probe = spawnSync(executable('psql'), ['-h', '127.0.0.1', '-p', '55433', '-U', 'goodnight_fixture', '-d', 'postgres', '-tAc', 'SELECT 1'], { cwd: root, env: fixtureEnv(), encoding: 'utf8', windowsHide: true });
    if (probe.status === 0 && probe.stdout.trim() === '1') { ready = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  if (!ready) failure('fixture PostgreSQL did not become ready within 30 seconds.');
  const probe = spawnSync(executable('psql'), ['-h', '127.0.0.1', '-p', '55433', '-U', 'goodnight_fixture', '-d', 'postgres', '-tAc', "SELECT 1 FROM pg_database WHERE datname = 'goodnight_treehole_visual_v1'"], { cwd: root, env: fixtureEnv(), encoding: 'utf8', windowsHide: true });
  if (probe.status !== 0) failure(`unable to query fixture PostgreSQL: ${probe.stderr}`);
  if (probe.stdout.trim() !== '1') run(executable('createdb'), ['-h', '127.0.0.1', '-p', '55433', '-U', 'goodnight_fixture', 'goodnight_treehole_visual_v1']);
}

async function bootstrap() {
  assertPaths();
  await readManifest();
  if (await fs.stat(stateFile).then(() => true).catch(() => false)) failure('fixture service state exists; run visual:fixture:stop before resetting the fixture database.');
  await recordLiveUploadsBaseline();
  await ensureCluster();
  run(pnpm, ['exec', 'prisma', 'db', 'push', '--schema', 'prisma/schema.prisma', '--skip-generate', '--force-reset']);
  run(pnpm, ['exec', 'tsx', 'scripts/visual-fixture-seed.ts']);
  run(pnpm, ['exec', 'tsx', 'scripts/visual-fixture-verify.ts']);
  console.log(`Fixture ${version} bootstrapped on PostgreSQL 55433. Live database 55432 and data/uploads were not targeted.`);
}

function startProcess(name: string, command: string, args: string[], logFile: string, cwd = root): ProcessEntry {
  const log = fsSync.openSync(logFile, 'w');
  const child = spawn(command, args, { cwd, env: fixtureEnv(), detached: true, windowsHide: true, stdio: ['ignore', log, log] });
  child.unref();
  if (!child.pid) failure(`could not start fixture ${name}.`);
  return { name, pid: child.pid, command: [command, ...args], startedAt: new Date().toISOString() };
}

async function start() {
  await bootstrap();
  for (const [port, name] of [[11435, 'fixture AI stub'], [3001, 'fixture API'], [5175, 'fixture front'], [5176, 'fixture admin']] as const) await ensurePortFree(port, name);
  await fs.mkdir(runtimeRoot, { recursive: true });
  const processes: ProcessEntry[] = [];
  const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const viteCli = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!fsSync.existsSync(tsxCli) || !fsSync.existsSync(viteCli)) failure('Fixture runtime dependencies tsx/vite are not installed.');
  try {
    processes.push(startProcess('ai-stub', process.execPath, [tsxCli, path.join(root, 'scripts', 'visual-fixture-ai-stub.ts')], path.join(runtimeRoot, 'ai-stub.log')));
    await waitForHttp('http://127.0.0.1:11435/api/tags', 'fixture AI stub');
    processes.push(startProcess('api', process.execPath, [tsxCli, 'src/main.ts'], path.join(runtimeRoot, 'api.log'), path.join(root, 'apps', 'api')));
    await waitForHttp('http://127.0.0.1:3001/api/health', 'fixture API');
    const health = await (await fetch('http://127.0.0.1:3001/api/health')).json() as any;
    if (health?.fixture?.enabled !== true || health?.fixture?.version !== version || health?.fingerprint?.runtimeInstanceId !== 'visual-fixture-v1') failure('fixture API health identity did not match the manifest.');
    processes.push(startProcess('front', process.execPath, [viteCli, '--host', '127.0.0.1', '--port', '5175', '--strictPort'], path.join(runtimeRoot, 'front.log'), path.join(root, 'apps', 'mp')));
    processes.push(startProcess('admin', process.execPath, [viteCli, '--host', '127.0.0.1', '--port', '5176', '--strictPort'], path.join(runtimeRoot, 'admin.log'), path.join(root, 'apps', 'admin')));
    await Promise.all([waitForHttp('http://127.0.0.1:5175/pages/square/index', 'fixture front'), waitForHttp('http://127.0.0.1:5176/login', 'fixture admin')]);
    await fs.writeFile(stateFile, JSON.stringify({ fixture: 'visual-v1', startedAt: new Date().toISOString(), processes }, null, 2));
    run(pnpm, ['exec', 'tsx', 'scripts/visual-fixture-verify.ts']);
    console.log('Fixture stack is ready: API 3001, front 5175, admin 5176, PostgreSQL 55433, fixture AI stub 11435.');
  } catch (error) {
    for (const process of processes.reverse()) spawnSync('taskkill', ['/pid', String(process.pid), '/t', '/f'], { windowsHide: true });
    throw error;
  }
}

async function stop() {
  const state = JSON.parse(await fs.readFile(stateFile, 'utf8').catch(() => '{"processes":[]}')) as { fixture?: string; processes?: ProcessEntry[] };
  if (state.fixture && state.fixture !== 'visual-v1') failure('refusing to stop an unrecognized process state file.');
  for (const entry of [...(state.processes ?? [])].reverse()) {
    if (!['ai-stub', 'api', 'front', 'admin'].includes(entry.name) || !entry.command?.some((part) => part.includes(root))) failure(`refusing to stop unrecognized process entry ${entry.name}.`);
    spawnSync('taskkill', ['/pid', String(entry.pid), '/t', '/f'], { windowsHide: true });
  }
  await fs.rm(stateFile, { force: true });
  console.log('Stopped only the processes recorded for visual-fixture v1. PostgreSQL 55433 remains isolated and available for the next reset.');
}

async function status() {
  const manifest = await readManifest();
  const health = await fetch(manifest.services.api + '/api/health').then(async (response) => response.ok ? response.json() : undefined).catch(() => undefined) as any;
  const state = await fs.readFile(stateFile, 'utf8').then((value) => JSON.parse(value)).catch(() => undefined);
  console.log(JSON.stringify({ manifest: manifest.id, state, health }, null, 2));
  if (!health?.fixture?.enabled || health?.fingerprint?.runtimeInstanceId !== manifest.runtimeInstanceId) process.exitCode = 1;
}

async function verify() {
  assertPaths();
  await readManifest();
  run(pnpm, ['exec', 'tsx', 'scripts/visual-fixture-verify.ts']);
}

const action = process.argv[2] ?? 'status';
const actions: Record<string, () => Promise<void>> = { bootstrap, reset: bootstrap, start, stop, status, verify };
if (!actions[action]) failure(`unknown action ${action}; expected bootstrap, reset, start, stop, status, or verify.`);
actions[action]().catch((error) => { console.error(error); process.exitCode = 1; });
