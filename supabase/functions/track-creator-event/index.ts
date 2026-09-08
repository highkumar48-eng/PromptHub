const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const windows = new Map<string, { count: number; started: number }>();
const profileCache = new Map<string, { id: string; expires: number }>();
const withinLimit = (key: string) => {
  const now = Date.now();
  const current = windows.get(key);
  if (!current || now - current.started > 60_000) {
    windows.set(key, { count: 1, started: now });
    return true;
  }
  current.count += 1;
  return current.count <= 20;
};

const cachedProfileId = async (url: string, key: string, handle: string) => {
  const now = Date.now();
  const cached = profileCache.get(handle);
  if (cached && cached.expires > now) return cached.id;

  const profileResponse = await fetch(`${url}/rest/v1/creator_profiles?select=id&handle=eq.${encodeURIComponent(handle)}&is_active=eq.true`, {
    headers: { apikey: key },
  });
  const profiles = await profileResponse.json();
  if (!profileResponse.ok || !profiles[0]) return '';

  if (profileCache.size > 1000) {
    const oldest = profileCache.keys().next().value;
    if (oldest) profileCache.delete(oldest);
  }
  profileCache.set(handle, { id: profiles[0].id, expires: now + 300_000 });
  return profiles[0].id;
};

const sha256 = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
};

const secretKey = () => {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  return keys ? JSON.parse(keys).default : '';
};

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders });
  try {
    const { handle, event } = await request.json();
    if (typeof handle !== 'string' || !/^[a-z0-9][a-z0-9-]{2,29}$/.test(handle) || !['visit', 'copy'].includes(event)) {
      return Response.json({ error: 'Invalid event' }, { status: 400, headers: corsHeaders });
    }
    const sourceIp = (request.headers.get('x-forwarded-for') || request.headers.get('cf-connecting-ip') || 'unknown').split(',')[0].trim();
    const rateKey = await sha256(`${sourceIp}:${handle}`);
    if (!withinLimit(rateKey)) return Response.json({ error: 'Too many requests' }, { status: 429, headers: corsHeaders });

    const url = Deno.env.get('SUPABASE_URL')!;
    const key = secretKey();
    if (!key) throw new Error('Tracking service is not configured');
    const creatorId = await cachedProfileId(url, key, handle);
    if (!creatorId) return Response.json({ tracked: false }, { headers: corsHeaders });

    const date = new Date().toISOString().slice(0, 10);
    const fingerprint = await sha256(`${key}:${date}:${sourceIp}:${request.headers.get('user-agent') || ''}`);
    const response = await fetch(`${url}/rest/v1/rpc/track_creator_event`, {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_creator_id: creatorId, p_visitor_hash: fingerprint, p_event: event }),
    });
    if (!response.ok) throw new Error('Could not record event');
    return new Response(await response.text(), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return Response.json({ error: 'Tracking unavailable' }, { status: 500, headers: corsHeaders });
  }
});
