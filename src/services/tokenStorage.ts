import { Capacitor } from '@capacitor/core';
import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin';

// Async key/value storage used for the Supabase auth session.
// Android: Keystore-backed secure storage. Browsers: localStorage.
const native = () => Capacitor.isNativePlatform();

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      return native() ? (await SecureStoragePlugin.get({ key })).value : localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    if (native()) await SecureStoragePlugin.set({ key, value });
    else localStorage.setItem(key, value);
  },
  async removeItem(key: string): Promise<void> {
    try {
      if (native()) await SecureStoragePlugin.remove({ key });
      else localStorage.removeItem(key);
    } catch { /* nothing stored */ }
  },
};
