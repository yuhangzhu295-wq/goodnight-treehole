import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

/**
 * The C-end identity.
 *
 * The API no longer accepts a bare user id: it requires a session credential the server issued and
 * stored, because a caller-supplied id made knowing any user id equivalent to being that user. This
 * module obtains that credential once and persists it, so the app keeps the same identity across
 * reloads and restarts.
 *
 * There is no login flow in this product, so the credential is bootstrapped anonymously: the server
 * picks the identity and stores the session. The client never chooses which identity it gets, which
 * is what makes claiming somebody else's identity impossible.
 *
 * Storage: on a native build the credential goes through Capacitor Preferences, which is app-private
 * storage (Android SharedPreferences, iOS UserDefaults) rather than the browser's localStorage, and
 * is not reachable from other apps. It is NOT hardware-backed encryption - see
 * docs/architecture/IDENTITY_CREDENTIAL_STORAGE.md for what that does and does not protect against.
 */

export const IDENTITY_CREDENTIAL_KEY = 'goodnight-identity-credential';
export const IDENTITY_USER_KEY = 'goodnight-identity-user-id';

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? '';
const useDemoIdentity = import.meta.env.VITE_USE_DEMO_IDENTITY === 'true';
const isNative = Capacitor.isNativePlatform();

let credential: string | null = null;
let userId: string | null = null;
let inflight: Promise<string | null> | null = null;

async function read(key: string): Promise<string | null> {
  try {
    if (isNative) return (await Preferences.get({ key })).value;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

async function write(key: string, value: string): Promise<void> {
  try {
    if (isNative) await Preferences.set({ key, value });
    else localStorage.setItem(key, value);
  } catch {
    // Storage being unavailable must not break the session in memory.
  }
}

export function getIdentityCredential(): string | null {
  return credential;
}

export function getIdentityUserId(): string | null {
  return userId;
}

/** Resolves to the credential, loading the stored one or bootstrapping a new identity. */
export function ensureIdentity(): Promise<string | null> {
  if (credential) return Promise.resolve(credential);
  if (inflight) return inflight;
  inflight = load().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function load(): Promise<string | null> {
  const stored = await read(IDENTITY_CREDENTIAL_KEY);
  if (stored) {
    credential = stored;
    userId = await read(IDENTITY_USER_KEY);
    return credential;
  }
  return await bootstrap();
}

async function bootstrap(): Promise<string | null> {
  type Issued = { item: { userId: string; credential: string } };
  const post = async (path: string) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as Issued;
  };

  // The offline demo build asks for the seeded demo session. It is refused unless the server has
  // explicitly enabled it, in which case we fall through to a fresh anonymous identity.
  if (useDemoIdentity) {
    try {
      return await adopt(await post('/api/v1/auth/demo'));
    } catch {
      // fall through
    }
  }

  try {
    return await adopt(await post('/api/v1/auth/anonymous'));
  } catch {
    return null;
  }
}

async function adopt(response: { item: { userId: string; credential: string } }): Promise<string> {
  credential = response.item.credential;
  userId = response.item.userId;
  await write(IDENTITY_CREDENTIAL_KEY, credential);
  await write(IDENTITY_USER_KEY, userId);
  return credential;
}

/** Drops the stored identity so the next request bootstraps a new one. */
export async function resetIdentity() {
  credential = null;
  userId = null;
  try {
    if (isNative) {
      await Preferences.remove({ key: IDENTITY_CREDENTIAL_KEY });
      await Preferences.remove({ key: IDENTITY_USER_KEY });
    } else {
      localStorage.removeItem(IDENTITY_CREDENTIAL_KEY);
      localStorage.removeItem(IDENTITY_USER_KEY);
    }
  } catch {
    // ignore
  }
}
