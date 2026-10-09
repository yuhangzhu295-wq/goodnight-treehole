import { createApiClient } from '@goodnight/api-sdk';

/**
 * The C-end identity.
 *
 * The API no longer accepts a bare user id: it requires a server-issued signed credential, because a
 * caller-supplied id made knowing any user id equivalent to being that user. This module obtains the
 * credential once and persists it, so the app keeps the same identity across reloads.
 *
 * There is no login flow in this product, so the credential is bootstrapped anonymously: the server
 * picks the identity and signs it. The client never chooses which identity it gets, which is what
 * makes claiming somebody else's identity impossible.
 */

export const IDENTITY_CREDENTIAL_KEY = 'goodnight-identity-credential';
export const IDENTITY_USER_KEY = 'goodnight-identity-user-id';

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? '';
const useDemoIdentity = import.meta.env.VITE_USE_DEMO_IDENTITY === 'true';

let credential: string | null = read(IDENTITY_CREDENTIAL_KEY);
let userId: string | null = read(IDENTITY_USER_KEY);
let inflight: Promise<string | null> | null = null;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // A private-mode browser with storage disabled still works for the current session.
  }
}

export function getIdentityCredential(): string | null {
  return credential;
}

export function getIdentityUserId(): string | null {
  return userId;
}

/** Resolves to the credential, bootstrapping one on first use. */
export function ensureIdentity(): Promise<string | null> {
  if (credential) return Promise.resolve(credential);
  if (inflight) return inflight;
  inflight = bootstrap().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function bootstrap(): Promise<string | null> {
  const client = createApiClient({ baseUrl });
  type Issued = { item: { userId: string; credential: string } };

  // The offline demo build asks for the seeded demo identity. It is refused unless the server has
  // explicitly enabled it, in which case we fall through to a fresh anonymous identity.
  if (useDemoIdentity) {
    try {
      const demo = await client.post<Issued>('/api/v1/auth/demo');
      return adopt(demo);
    } catch {
      // fall through
    }
  }

  try {
    const anonymous = await client.post<Issued>('/api/v1/auth/anonymous');
    return adopt(anonymous);
  } catch {
    return null;
  }
}

function adopt(response: { item: { userId: string; credential: string } }): string {
  credential = response.item.credential;
  userId = response.item.userId;
  write(IDENTITY_CREDENTIAL_KEY, credential);
  write(IDENTITY_USER_KEY, userId);
  return credential;
}

/** Drops the stored identity so the next request bootstraps a new one. Used by tests and sign-out. */
export function resetIdentity() {
  credential = null;
  userId = null;
  try {
    localStorage.removeItem(IDENTITY_CREDENTIAL_KEY);
    localStorage.removeItem(IDENTITY_USER_KEY);
  } catch {
    // ignore
  }
}
