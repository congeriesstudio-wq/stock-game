import { Capacitor } from '@capacitor/core';
import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin';

const KEY = 'ticker-arena.session';

export type StoredSession = { accessToken: string; refreshToken?: string };

// Native (Android Keystore-backed) secure storage; browsers fall back to localStorage.
const native = () => Capacitor.isNativePlatform();

export async function saveSession(session: StoredSession): Promise<void> {
  const value = JSON.stringify(session);
  if (native()) await SecureStoragePlugin.set({ key: KEY, value });
  else localStorage.setItem(KEY, value);
}

export async function loadSession(): Promise<StoredSession | null> {
  try {
    const raw = native() ? (await SecureStoragePlugin.get({ key: KEY })).value : localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  try {
    if (native()) await SecureStoragePlugin.remove({ key: KEY });
    else localStorage.removeItem(KEY);
  } catch { /* nothing stored */ }
}
