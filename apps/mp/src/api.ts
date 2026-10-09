import { createApiClient } from '@goodnight/api-sdk';
import { ensureIdentity, getIdentityCredential } from './identity';

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? '';

const client = createApiClient({ baseUrl, getIdentity: getIdentityCredential });

/**
 * Every call waits for the identity first.
 *
 * The credential is loaded asynchronously from platform storage, so a request issued before that
 * finishes would carry no credential and be refused. Awaiting here removes that race rather than
 * relying on view-mount ordering.
 */
async function withIdentity<T>(call: () => Promise<T>): Promise<T> {
  await ensureIdentity();
  return await call();
}

export const api = {
  get: <T>(path: string) => withIdentity(() => client.get<T>(path)),
  post: <T>(path: string, body?: unknown) => withIdentity(() => client.post<T>(path, body)),
  patch: <T>(path: string, body?: unknown) => withIdentity(() => client.patch<T>(path, body)),
  put: <T>(path: string, body?: unknown) => withIdentity(() => client.put<T>(path, body)),
  delete: <T>(path: string, body?: unknown) => withIdentity(() => client.delete<T>(path, body)),
};

export type UploadedMedia = {
  id: string;
  url: string;
  mimeType: string;
  size: number;
  width: number;
  height: number;
};

export async function uploadMedia(file: File, usageType = 'mood'): Promise<UploadedMedia> {
  const form = new FormData();
  form.append('file', file);
  form.append('usageType', usageType);
  const credential = await ensureIdentity();
  const response = await fetch(`${baseUrl}/api/v1/media/upload`, {
    method: 'POST',
    body: form,
    headers: credential ? { 'x-goodnight-user-id': credential } : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.message ?? '图片上传失败');
  return payload.item as UploadedMedia;
}

export async function deleteMedia(assetId: string) {
  const credential = await ensureIdentity();
  const response = await fetch(`${baseUrl}/api/v1/media/${assetId}`, {
    method: 'DELETE',
    headers: credential ? { 'x-goodnight-user-id': credential } : undefined,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.message ?? '图片删除失败');
  }
}

export function resolveApiUrl(url: string) {
  if (/^(?:https?:|blob:|data:)/i.test(url)) return url;
  if (!baseUrl) return url;
  return `${baseUrl.replace(/\/$/, '')}/${url.replace(/^\//, '')}`;
}
