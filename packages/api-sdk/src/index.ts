export interface ApiClientOptions {
  baseUrl?: string;
  getToken?: () => string | null | undefined;
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
    const headers = new Headers(init.headers);
    if (!headers.has('content-type') && init.body) headers.set('content-type', 'application/json');
    if (token) headers.set('authorization', `Bearer ${token}`);
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
  };
}
