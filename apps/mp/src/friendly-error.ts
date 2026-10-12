/**
 * Network failures arrive as the platform's own English text — "Failed to fetch" on Android's
 * WebView, "Load failed" on iOS, "Network request failed" under Capacitor — and 57 call sites
 * display `cause.message` directly, so that text reached the interface verbatim.
 *
 * Kept as a zero-import leaf so it can be unit-tested without loading Capacitor or the API client.
 */
const NETWORK_FAILURE = /failed to fetch|load failed|network request failed|fetch failed|networkerror/i;

export const NETWORK_FAILURE_MESSAGE = '网络连接不上，请检查网络后重试';
export const UNKNOWN_FAILURE_MESSAGE = '请求没有完成，请稍后重试';

export function friendlyError(cause: unknown): Error {
  if (cause instanceof Error) {
    return NETWORK_FAILURE.test(cause.message ?? '') ? new Error(NETWORK_FAILURE_MESSAGE) : cause;
  }
  return new Error(UNKNOWN_FAILURE_MESSAGE);
}
