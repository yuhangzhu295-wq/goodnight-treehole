/**
 * Network failures arrive as the platform's own English text — "Failed to fetch" on Android's
 * WebView, "Load failed" on iOS, "Network request failed" under Capacitor — and 57 call sites
 * display `cause.message` directly, so that text reached the interface verbatim.
 *
 * Kept as a zero-import leaf so it can be unit-tested without loading Capacitor or the API client.
 */
const NETWORK_FAILURE = /failed to fetch|load failed|network request failed|fetch failed|networkerror/i;

/**
 * Nest's unhandled-exception body. It reaches the client as the plain English string
 * "Internal server error", which the same 57 call sites then display verbatim — seen on the
 * ActionCenter and 写给未来的我 when the API lost its database connection.
 */
const SERVER_FAILURE = /^internal server error$/i;

export const NETWORK_FAILURE_MESSAGE = '网络连接不上，请检查网络后重试';
export const SERVER_FAILURE_MESSAGE = '服务暂时不可用，请稍后重试';
export const UNKNOWN_FAILURE_MESSAGE = '请求没有完成，请稍后重试';

export function friendlyError(cause: unknown): Error {
  if (cause instanceof Error) {
    const raw = cause.message ?? '';
    if (NETWORK_FAILURE.test(raw)) return new Error(NETWORK_FAILURE_MESSAGE);
    if (SERVER_FAILURE.test(raw.trim())) return new Error(SERVER_FAILURE_MESSAGE);
    return cause;
  }
  return new Error(UNKNOWN_FAILURE_MESSAGE);
}
