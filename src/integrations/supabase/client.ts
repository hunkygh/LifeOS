console.log("VITE_SUPABASE_URL:", import.meta.env.VITE_SUPABASE_URL)
console.log("VITE_SUPABASE_ANON_KEY:", import.meta.env.VITE_SUPABASE_ANON_KEY)


// client.ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const isLocalhost =
  typeof window !== "undefined" &&
  ["localhost", "127.0.0.1"].includes(window.location.hostname);

const localSupabaseUrl = import.meta.env.VITE_LOCAL_SUPABASE_URL;
const localSupabaseAnonKey = import.meta.env.VITE_LOCAL_SUPABASE_ANON_KEY;
const cloudSupabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const cloudSupabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// On localhost, force the browser client to use the local Supabase gateway.
const SUPABASE_URL =
  (isLocalhost ? localSupabaseUrl : undefined) ||
  cloudSupabaseUrl ||
  localSupabaseUrl;
const SUPABASE_ANON_KEY =
  (isLocalhost ? localSupabaseAnonKey : undefined) ||
  cloudSupabaseAnonKey ||
  localSupabaseAnonKey;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    '[supabase/client] Missing Supabase URL or anon key!',
    { SUPABASE_URL, SUPABASE_ANON_KEY }
  );
}

console.log('[supabase/client] Localhost mode:', isLocalhost);
console.log('[supabase/client] Using Supabase URL:', SUPABASE_URL);
console.log('[supabase/client] Using Supabase anon key:', SUPABASE_ANON_KEY);

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
