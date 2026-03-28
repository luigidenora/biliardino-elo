import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error('[supabase] VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY sono richiesti quando VITE_DB=supabase');
}

export const supabase = createClient(url, key);
