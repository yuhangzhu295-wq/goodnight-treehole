import { createApiClient } from '@goodnight/api-sdk';
const baseUrl = import.meta.env.VITE_API_BASE_URL ?? '';
export const api = createApiClient({ baseUrl });

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
  const response = await fetch(`${baseUrl}/api/v1/media/upload`, { method: 'POST', body: form });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.message ?? '图片上传失败');
  return payload.item as UploadedMedia;
}

export async function deleteMedia(assetId: string) {
  const response = await fetch(`${baseUrl}/api/v1/media/${assetId}`, { method: 'DELETE' });
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
