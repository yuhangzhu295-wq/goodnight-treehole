import { createApiClient } from '@goodnight/api-sdk';
export const tokenKey = 'goodnight-admin-token';
const baseUrl = import.meta.env.VITE_API_BASE_URL ?? '';
export const adminApi = createApiClient({
  baseUrl,
  getToken: () => localStorage.getItem(tokenKey),
});

/**
 * Fetches a token-protected file and saves it under the filename the server chose.
 *
 * The API requires an Authorization header on every admin route, so a plain anchor or
 * `window.open` cannot be used: the browser would send no token and the request would be
 * rejected. The bytes are fetched through the same authenticated client and handed to the
 * user as a blob download instead.
 */
export async function downloadAdminFile(url: string) {
  const token = localStorage.getItem(tokenKey);
  const response = await fetch(`${baseUrl}${url}`, {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) throw new Error(`下载失败（HTTP ${response.status}）`);
  const disposition = response.headers.get('content-disposition') ?? '';
  const filename = disposition.match(/filename="?([^";]+)"?/)?.[1] ?? 'export.json';
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
  return filename;
}
