import { createClient } from '@supabase/supabase-js';

// Prefer Vite env when present; otherwise use project defaults so a static
// build/serve works without a local .env (publishable key is safe for clients).
const DEFAULT_SUPABASE_URL = 'https://ifvnelxqfivarqdudkwc.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'sb_publishable_HgiXv3phZEHSB_wOsMUIbQ_3ysfHo0A';

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
