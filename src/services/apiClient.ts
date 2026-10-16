import { loadSession } from './tokenStorage.js';

// Empty on web (same-origin relative /api). Required for Android, where relative URLs hit the WebView origin.
export const API_BASE_URL = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '').replace(/\/+$/, '');

export const apiUrl = (path: string) => `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = await loadSession();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (session?.accessToken) headers.set('Authorization', 'Bearer ' + session.accessToken);
  const response = await fetch(apiUrl(path), { ...init, headers });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
  return body as T;
}
