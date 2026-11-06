export interface ApiClientOptions {
  baseUrl?: string;
  getToken?: () => string | null | undefined;
  /**
   * The C-end identity credential, sent as `x-goodnight-user-id`.
   *
   * It is a server-issued signed credential, not a user id: the API verifies the signature and
   * derives the caller's identity from it, so a client cannot claim an identity it was not given.
   */
  getIdentity?: () => string | null | undefined;
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public payload?: unknown) {
    super(message);
  }
}

export function createApiClient(options: ApiClientOptions = {}) {
  const baseUrl = options.baseUrl ?? '';
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = options.getToken?.();
    const identity = options.getIdentity?.();
    const headers = new Headers(init.headers);
    if (!headers.has('content-type') && init.body) headers.set('content-type', 'application/json');
    if (token) headers.set('authorization', `Bearer ${token}`);
    if (identity) headers.set('x-goodnight-user-id', identity);
    const res = await fetch(`${baseUrl}${path}`, { ...init, headers });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new ApiError(res.status, data?.message ?? res.statusText, data);
    return data as T;
  }
  return {
    get: <T>(path: string) => request<T>(path),
    post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
    patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
    put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
    delete: <T>(path: string, body?: unknown) =>
      request<T>(path, { method: 'DELETE', body: body === undefined ? undefined : JSON.stringify(body) }),
    /** For callers that build their own requests, such as multipart uploads. */
    identityHeaders: (): Record<string, string> => {
      const identity = options.getIdentity?.();
      const token = options.getToken?.();
      const headers: Record<string, string> = {};
      if (identity) headers['x-goodnight-user-id'] = identity;
      if (token) headers.authorization = `Bearer ${token}`;
      return headers;
    },
  };
}
