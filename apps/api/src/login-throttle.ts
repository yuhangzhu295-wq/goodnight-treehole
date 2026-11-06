/**
 * Server-side login throttling for the admin console.
 *
 * The console used to rely on a captcha field that nothing ever validated, so the only
 * protection against password guessing was whatever the browser did. This is a real,
 * in-process limiter: a sliding window of failures per (IP, username) pair, plus a per-IP
 * window so a single source cannot spray many usernames.
 *
 * It is deliberately small and dependency-free. State is in memory, which is correct for
 * this single-process deployment; a multi-instance deployment would need Redis, and that is
 * recorded as a known limitation rather than silently assumed away.
 */

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_MAX_ATTEMPTS_PER_IDENTITY = 5;
export const LOGIN_MAX_ATTEMPTS_PER_IP = 20;

type Bucket = { failures: number[]; blockedUntil?: number };

const identities = new Map<string, Bucket>();
const addresses = new Map<string, Bucket>();

function prune(bucket: Bucket, now: number) {
  bucket.failures = bucket.failures.filter((at) => now - at < LOGIN_WINDOW_MS);
  if (bucket.blockedUntil && bucket.blockedUntil <= now) bucket.blockedUntil = undefined;
  return bucket;
}

function bucketFor(store: Map<string, Bucket>, key: string, now: number) {
  const bucket = prune(store.get(key) ?? { failures: [] }, now);
  store.set(key, bucket);
  return bucket;
}

export function loginRetryAfterSeconds(ip: string, username: string) {
  const now = Date.now();
  const identity = bucketFor(identities, `${ip}|${username.toLowerCase()}`, now);
  const address = bucketFor(addresses, ip, now);
  const until = Math.max(identity.blockedUntil ?? 0, address.blockedUntil ?? 0);
  if (!until || until <= now) return 0;
  return Math.ceil((until - now) / 1000);
}

export function recordLoginFailure(ip: string, username: string) {
  const now = Date.now();
  const identity = bucketFor(identities, `${ip}|${username.toLowerCase()}`, now);
  identity.failures.push(now);
  if (identity.failures.length >= LOGIN_MAX_ATTEMPTS_PER_IDENTITY) identity.blockedUntil = now + LOGIN_WINDOW_MS;

  const address = bucketFor(addresses, ip, now);
  address.failures.push(now);
  if (address.failures.length >= LOGIN_MAX_ATTEMPTS_PER_IP) address.blockedUntil = now + LOGIN_WINDOW_MS;
}

export function recordLoginSuccess(ip: string, username: string) {
  identities.delete(`${ip}|${username.toLowerCase()}`);
  addresses.delete(ip);
}

/** Test hook: the suites must not inherit throttling state from each other. */
export function resetLoginThrottle() {
  identities.clear();
  addresses.clear();
}
