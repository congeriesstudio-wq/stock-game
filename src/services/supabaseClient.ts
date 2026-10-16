import { createClient } from '@supabase/supabase-js';
import { secureStorage } from './tokenStorage.js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// When the Supabase env vars are absent the app runs in demo mode against the built-in mock adapter.
export const isLive = Boolean(url && key);

export const supabase = createClient(url || 'http://localhost', key || 'public-anon-key', {
  auth: { storage: secureStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});
