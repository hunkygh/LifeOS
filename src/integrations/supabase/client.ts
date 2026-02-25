// client.ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const cloudUrl = import.meta.env.VITE_SUPABASE_URL;
const cloudAnon = import.meta.env.VITE_SUPABASE_ANON_KEY;
const fallbackCloudUrl = 'https://ytimlybgpgepvkbellnc.supabase.co';
const fallbackCloudAnon = 'sb_publishable_ga4zeohCkqMQs3okeZVpAA_Y2lYknql';

const SUPABASE_URL = cloudUrl || fallbackCloudUrl;
const SUPABASE_ANON_KEY = cloudAnon || fallbackCloudAnon;

console.log('[supabase/client] VITE_SUPABASE_URL:', cloudUrl);
console.log('[supabase/client] VITE_SUPABASE_ANON_KEY:', cloudAnon);
console.log('[supabase/client] Using Supabase URL:', SUPABASE_URL);
console.log('[supabase/client] Using Supabase anon key:', SUPABASE_ANON_KEY);

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
