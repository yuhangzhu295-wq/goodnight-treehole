import { createApiClient } from '@goodnight/api-sdk';
export const tokenKey = 'goodnight-admin-token';
export const adminApi = createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
  getToken: () => localStorage.getItem(tokenKey),
});
