import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const version = 'v1';
const fixtureRoot = path.join(root, 'fixtures', 'visual', version);
const runtimeRoot = path.join(root, 'artifacts', 'visual-fixtures', version, 'runtime');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const runId = process.env.VISUAL_FIXTURE_RUN_ID ?? `run-${new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')}`;
const outputRoot = path.join(root, 'artifacts', 'visual-fixtures', version, 'runs', runId);

const env = {
  ...process.env,
  VISUAL_FIXTURE_MODE: '1', VISUAL_FIXTURE_VERSION: version, RUNTIME_INSTANCE_ID: 'visual-fixture-v1', API_PORT: '3001',
  AI_LOCAL_MODEL_ENABLED: 'false', OLLAMA_ENABLED: 'false', AI_ALLOW_OLLAMA_FALLBACK: 'false',
  VISUAL_FIXTURE_AI_MODE: 'stub', VISUAL_FIXTURE_AI_BASE_URL: 'http://127.0.0.1:11435',
  DATABASE_URL: 'postgresql://goodnight_fixture@127.0.0.1:55433/goodnight_treehole_visual_v1?schema=public',
  GOODNIGHT_UPLOADS_DIR: path.join(runtimeRoot, 'uploads'), OLLAMA_BASE_URL: 'http://127.0.0.1:11435',
  API_BASE_URL: 'http://127.0.0.1:3001', FRONT_BASE_URL: 'http://127.0.0.1:5175', ADMIN_BASE_URL: 'http://127.0.0.1:5176',
  VISUAL_FIXTURE_MANIFEST: path.join(fixtureRoot, 'manifest.json'), VISUAL_FIXTURE_STRICT: '1', VISUAL_ARTIFACT_ROOT: outputRoot,
};

function run(args: string[]) {
  const quote = (value: string) => /[\s&|<>()^!"]/u.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  const invocation = process.platform === 'win32'
    ? { command: process.env.ComSpec ?? 'cmd.exe', args: ['/d', '/c', [pnpm, ...args].map(quote).join(' ')] }
    : { command: pnpm, args };
  const result = spawnSync(invocation.command, invocation.args, { cwd: root, env, encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error([result.error?.message, result.stdout, result.stderr].filter(Boolean).join('\n').slice(-6000));
}

async function main() {
  const manifest = JSON.parse(await fs.readFile(path.join(fixtureRoot, 'manifest.json'), 'utf8')) as { id?: string; version?: string; fixtureOnly?: boolean };
  if (!manifest.fixtureOnly || manifest.id !== 'visual-v1' || manifest.version !== version) throw new Error('Fixture manifest identity is invalid.');
  await fs.mkdir(outputRoot, { recursive: true });
  run(['exec', 'tsx', 'scripts/visual-fixture-verify.ts']);
  const baseline = await fs.readFile(path.join(runtimeRoot, 'verification-evidence.json'));
  const source = await fs.readFile(path.join(fixtureRoot, 'seed.ts'));
  await fs.writeFile(path.join(outputRoot, 'run-identity.json'), JSON.stringify({ fixture: manifest.id, version, runId, startedAt: new Date().toISOString(), seedSha256: crypto.createHash('sha256').update(source).digest('hex'), preRunVerificationSha256: crypto.createHash('sha256').update(baseline).digest('hex'), endpoints: { api: env.API_BASE_URL, front: env.FRONT_BASE_URL, admin: env.ADMIN_BASE_URL } }, null, 2));
  let visualFailure: unknown;
  try {
    run(['exec', 'tsx', 'scripts/final-responsive-visual.ts', '--fixture-manifest', env.VISUAL_FIXTURE_MANIFEST, '--fixture-strict', '--api-base', env.API_BASE_URL, '--front-base', env.FRONT_BASE_URL, '--admin-base', env.ADMIN_BASE_URL, '--artifact-root', outputRoot]);
  } catch (error) {
    // A real pixel failure must keep the command non-zero, but its fixture
    // boundary still needs a post-run integrity check before we hand back the
    // evidence. This never turns a visual failure into a pass.
    visualFailure = error;
  }
  run(['exec', 'tsx', 'scripts/visual-fixture-verify.ts']);
  if (visualFailure) throw visualFailure;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
