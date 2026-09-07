import { createClient } from '@supabase/supabase-js';

export function supabaseForRequest(env, accessToken) {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
    throw new Error('Supabase runtime configuration is missing.');
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function sessionToken(request) {
  const entry = (request.headers.get('cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith('ph_session='));
  return entry ? decodeURIComponent(entry.slice('ph_session='.length)) : null;
}
