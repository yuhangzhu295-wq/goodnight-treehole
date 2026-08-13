import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Runtime wiring shared by the API entry point and persistence layer.
 *
 * The normal application deliberately keeps its existing defaults.  Visual
 * fixture mode is opt-in and fail-closed: a typo must stop the fixture before
 * it can reach the normal database or uploads directory.
 */
export const visualFixtureMode = process.env.VISUAL_FIXTURE_MODE === '1';
export const visualFixtureVersion = 'v1';
export const visualFixtureDatabaseName = 'goodnight_treehole_visual_v1';
export const visualFixtureDatabasePort = '55433';
export const visualFixtureApiPort = '3001';
export const visualFixtureRuntimeInstanceId = 'visual-fixture-v1';
export const visualFixtureAiStubBaseUrl = 'http://127.0.0.1:11435';

/**
 * Runtime safety policy for the emergency local-model shutdown.
 *
 * This project deliberately has no opt-in switch for live local inference.
 * Legacy Ollama compatibility code is retained for historic data and the
 * versioned visual stub only, but it may never reach a developer's local
 * model runtime. The only permitted compatibility endpoint is the isolated
 * fixture stub on 11435.
 */
export const localInferenceAllowed = false;

function normalizedUrl(value?: string) {
  return String(value ?? '').trim().replace(/\/$/, '');
}

export function visualFixtureAiStubAllowed() {
  return visualFixtureMode
    && process.env.VISUAL_FIXTURE_AI_MODE === 'stub'
    && normalizedUrl(process.env.VISUAL_FIXTURE_AI_BASE_URL) === visualFixtureAiStubBaseUrl
    && normalizedUrl(process.env.OLLAMA_BASE_URL) === visualFixtureAiStubBaseUrl
    && process.env.AI_LOCAL_MODEL_ENABLED === 'false'
    && process.env.OLLAMA_ENABLED === 'false'
    && process.env.AI_ALLOW_OLLAMA_FALLBACK === 'false';
}

export function permittedFixtureAiStubBaseUrl() {
  return visualFixtureAiStubAllowed() ? visualFixtureAiStubBaseUrl : 'disabled://local-model';
}

export function assertNoLegacyLocalModelEndpoint(value: string | undefined, label: string) {
  if (!value) return;
  let endpoint: URL;
  try { endpoint = new URL(value); } catch { return; }
  const host = endpoint.hostname.toLowerCase();
  if (host === '127.0.0.1' || host === 'localhost' || host === '::1') {
    throw new Error(`[ai-provider-policy] ${label} may not target a local endpoint.`);
  }
}

// API package scripts run from apps/api, while direct test runners commonly
// run from the repository root. Resolve from this source file so the safety
// boundary is identical in both cases.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const liveUploadsDirectory = path.resolve(root, 'data', 'uploads');

function fail(message: string): never {
  throw new Error(`[visual-fixture isolation] ${message}`);
}

function isWithin(parent: string, candidate: string) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export function visualFixtureIdentity() {
  return visualFixtureMode
    ? { enabled: true, version: visualFixtureVersion, runtimeInstanceId: visualFixtureRuntimeInstanceId }
    : { enabled: false };
}

export function resolveUploadsDirectory() {
  const value = process.env.GOODNIGHT_UPLOADS_DIR ?? 'data/uploads';
  const resolved = path.resolve(root, value);
  if (!visualFixtureMode) return resolved;

  const fixtureUploads = path.resolve(root, 'artifacts', 'visual-fixtures', visualFixtureVersion, 'runtime', 'uploads');
  if (resolved === liveUploadsDirectory || !isWithin(fixtureUploads, resolved)) {
    fail(`GOODNIGHT_UPLOADS_DIR must stay inside ${fixtureUploads}; received ${resolved}.`);
  }
  return resolved;
}

export function assertVisualFixtureRuntime() {
  if (!visualFixtureMode) return;

  if (process.env.VISUAL_FIXTURE_VERSION !== visualFixtureVersion) {
    fail(`VISUAL_FIXTURE_VERSION must be ${visualFixtureVersion}.`);
  }
  if (String(process.env.RUNTIME_INSTANCE_ID ?? '') !== visualFixtureRuntimeInstanceId) {
    fail(`RUNTIME_INSTANCE_ID must be ${visualFixtureRuntimeInstanceId}.`);
  }
  if (String(process.env.API_PORT ?? '') !== visualFixtureApiPort) {
    fail(`API_PORT must be ${visualFixtureApiPort}.`);
  }
  if (!visualFixtureAiStubAllowed()) {
    fail(`fixture AI must be the approved stub at ${visualFixtureAiStubBaseUrl}; local inference remains disabled.`);
  }

  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) fail('DATABASE_URL is required in fixture mode.');
  let database: URL;
  try { database = new URL(rawUrl); } catch { fail('DATABASE_URL is not a valid URL.'); }
  if (database.protocol !== 'postgresql:' || database.hostname !== '127.0.0.1' || database.port !== visualFixtureDatabasePort) {
    fail(`DATABASE_URL must target PostgreSQL on 127.0.0.1:${visualFixtureDatabasePort}.`);
  }
  if (database.pathname.replace(/^\//, '') !== visualFixtureDatabaseName) {
    fail(`DATABASE_URL must target ${visualFixtureDatabaseName}.`);
  }
  if (database.searchParams.get('schema') !== 'public') {
    fail('DATABASE_URL must use the fixture public schema.');
  }
  resolveUploadsDirectory();
}
