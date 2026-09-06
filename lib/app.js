import { render } from '../generated/templates.js';
import { database } from './database.js';
import { normalizeKeyword, validatePrompt } from './domain.js';
import { parseCSV, convertCSVToPrompts } from './csv.js';

const demo = { id: 'demo', handle: 'demo', name: 'PromptHub Demo' };
const demoPrompts = [{ id: 'demo-saree', creator_id: 'demo', keyword: 'saree', title: 'Shadowed Saree Elegance', body: 'Create an editorial portrait of an adult woman wearing an elegant silk saree, standing beside a softly lit window. Use warm natural light, detailed fabric textures, a subtle background and a balanced vertical composition. Preserve realistic proportions. Shot on an 85mm portrait lens with shallow depth of field.', status: 'published' }];
const publicHeaders = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com" };
const redirect = location => new Response(null, { status: 303, headers: { Location: location, 'Cache-Control': 'no-store' } });
const page = (name, locals, status = 200) => new Response(render('v1/' + name, locals), { status, headers: publicHeaders });
const fail = (message, status, locals = {}) => page('error', { user: null, creator: null, localPreview: false, title: 'PromptHub', message, ...locals }, status);
const unique = e => /UNIQUE constraint|unique constraint/i.test(String(e));

async function readForm(request) {
  if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) throw new Error('Please submit this form from PromptHub.');
  const reader = request.body?.getReader(); let size = 0; const chunks = [];
  if (reader) while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 1048576) { await reader.cancel(); throw new Error('Import is too large. Use a CSV smaller than 1 MB.'); } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return Object.fromEntries(new URLSearchParams(new TextDecoder().decode(bytes)));
}
export async function handleRequest(request, env) {
  const url = new URL(request.url), pathname = url.pathname;
  // Identity headers are supplied by the Sites dispatcher. Local Vite strips client-supplied identity headers.
  const userId = request.headers.get('oai-authenticated-user-id');
  const user = userId ? { id: userId } : null;
  let creator = null;
  const base = () => ({ title: 'PromptHub', user, creator, localPreview: !!env.LOCAL_PREVIEW });
  try {
    const db = database(env);
    if (pathname.startsWith('/dashboard') || pathname === '/join') {
      if (!user) return request.method === 'GET' ? redirect('/signin-with-chatgpt?return_to=' + encodeURIComponent(pathname)) : fail('Sign in to continue.', 401);
      creator = await db.one('SELECT * FROM creators WHERE user_id = ?', user.id);
    }
    if (request.method === 'POST') {
      if (!user || !pathname.startsWith('/dashboard')) return fail('Sign in to continue.', 401);
      if (request.headers.get('origin') !== url.origin || request.headers.get('sec-fetch-site') === 'cross-site') return fail('Please submit this form from your PromptHub page.', 403);
      const form = await readForm(request);
      if (pathname === '/dashboard/profile') {
        if (creator) return redirect('/dashboard');
        const handle = String(form.handle ?? '').trim().toLowerCase(), name = String(form.name ?? '').trim();
        if (!/^[a-z][a-z0-9_]{2,29}$/.test(handle) || ['demo','admin','support','prompthub','dashboard','api','www'].includes(handle)) return page('join', { ...base(), form, error: 'Choose a handle of 3–30 lowercase letters, numbers or underscores, starting with a letter. This handle may be reserved.' }, 400);
        if (!name || name.length > 60) return page('join', { ...base(), form, error: 'Add a display name of 1–60 characters.' }, 400);
        try { await db.run('INSERT INTO creators (id,user_id,handle,name,created_at) VALUES (?,?,?,?,?)', crypto.randomUUID(), user.id, handle, name, new Date().toISOString()); }
        catch (e) { if (unique(e)) return page('join', { ...base(), form, error: 'That handle is taken. Please choose another.' }, 409); throw e; }
        return redirect('/dashboard?notice=welcome');
      }
      if (!creator) return redirect('/join');
      if (pathname === '/dashboard/prompts') {
        const editing = form.id ? await db.one('SELECT * FROM prompts WHERE id = ? AND creator_id = ?', form.id, creator.id) : null;
        if (form.id && !editing) return fail('Prompt not found in your account.', 404, base());
        let data;
        try { data = validatePrompt(form); }
        catch (e) { return page('editor', { ...base(), item: form, error: e.message }, 400); }
        const now = new Date().toISOString();
        try {
          if (editing) await db.run('UPDATE prompts SET keyword=?, title=?, body=?, status=?, updated_at=? WHERE id=? AND creator_id=?', data.keyword, data.title, data.body, data.status, now, editing.id, creator.id);
          else {
            const count = await db.one('SELECT COUNT(*) AS count FROM prompts WHERE creator_id = ?', creator.id);
            if (count.count >= 500) return page('editor', { ...base(), item: form, error: 'This first version supports 500 prompts per creator.' }, 400);
            await db.run('INSERT INTO prompts (id,creator_id,keyword,title,body,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)', crypto.randomUUID(), creator.id, data.keyword, data.title, data.body, data.status, now, now);
          }
        } catch (e) { if (unique(e)) return page('editor', { ...base(), item: form, error: 'You already use this keyword. Edit that prompt or choose a different keyword.' }, 409); throw e; }
        return redirect('/dashboard?notice=saved');
      }
      if (pathname === '/dashboard/unpublish') {
        const item = await db.one('SELECT id FROM prompts WHERE id=? AND creator_id=?', form.id || '', creator.id);
        if (!item) return fail('Prompt not found in your account.', 404, base());
        await db.run('UPDATE prompts SET status=?, updated_at=? WHERE id=? AND creator_id=?', 'draft', new Date().toISOString(), item.id, creator.id);
        return redirect('/dashboard?notice=unpublished');
      }
      if (pathname === '/dashboard/import') {
        try {
          const csv = String(form.csv || '').replace(/^\uFEFF/, '');
          const headers = (parseCSV(csv)[0] || []).map(x => x.trim().toLowerCase());
          if (!['keyword','title','prompt'].every(x => headers.includes(x))) throw new Error('CSV needs these exact column names: keyword, title, prompt.');
          const rows = convertCSVToPrompts(csv);
          if (!rows.length || rows.length > 100) throw new Error('Import 1–100 prompts at a time.');
          const existing = await db.all('SELECT keyword FROM prompts WHERE creator_id=?', creator.id);
          if (existing.length + rows.length > 500) throw new Error('This first version supports 500 prompts per creator.');
          const keys = new Set(existing.map(p => p.keyword));
          const items = rows.map((row, index) => {
            let item;
            try { item = validatePrompt({ keyword: row.Keyword, title: row.PromptTitle, body: row.PromptText, status: 'draft' }); }
            catch (e) { throw new Error('Row ' + (index + 2) + ': ' + e.message); }
            if (keys.has(item.keyword)) throw new Error('Duplicate keyword: ' + item.keyword + '. Nothing was imported.');
            keys.add(item.keyword); return item;
          });
          const now = new Date().toISOString();
          await db.batch(items.map(p => ['INSERT INTO prompts (id,creator_id,keyword,title,body,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)', [crypto.randomUUID(), creator.id, p.keyword, p.title, p.body, 'draft', now, now]]));
          return redirect('/dashboard?notice=imported');
        } catch (e) {
          const message = unique(e) ? 'A keyword already exists. Nothing was imported.' : e.message;
          return page('import', { ...base(), error: message, csv: form.csv || '' }, 400);
        }
      }
      return fail('Page not found.', 404, base());
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return fail('Method not allowed.', 405, base());
    if (pathname === '/health') return Response.json({ status: 'ok' });
    if (pathname === '/') return page('home', base());
    if (pathname === '/join') return creator ? redirect('/dashboard') : page('join', { ...base(), form: {}, error: '' });
    if (pathname.startsWith('/dashboard') && !creator) return redirect('/join');
    if (pathname === '/dashboard') {
      const items = await db.all('SELECT id,keyword,title,status,updated_at FROM prompts WHERE creator_id=? ORDER BY updated_at DESC', creator.id);
      const notices = { welcome: 'Your page is ready. Add your first prompt.', saved: 'Prompt saved.', imported: 'Imported as drafts. Review each prompt before publishing.', unpublished: 'Prompt moved to drafts. Viewers can no longer find it.' };
      return page('dashboard', { ...base(), items, notice: notices[url.searchParams.get('notice')] || '', personalLink: url.origin + '/c/' + creator.handle });
    }
    if (pathname === '/dashboard/new') return page('editor', { ...base(), item: { status: 'draft' }, error: '' });
    if (pathname.startsWith('/dashboard/edit/')) {
      const item = await db.one('SELECT * FROM prompts WHERE id=? AND creator_id=?', pathname.split('/').pop(), creator.id);
      return item ? page('editor', { ...base(), item, error: '' }) : fail('Prompt not found in your account.', 404, base());
    }
    if (pathname === '/dashboard/import') return page('import', { ...base(), error: '', csv: '' });
    if (pathname === '/dashboard/export') {
      const rows = await db.all('SELECT keyword,title,body,status FROM prompts WHERE creator_id=? ORDER BY keyword', creator.id);
      const cell = value => '"' + String(value).replaceAll('"','""') + '"';
      // JSON avoids spreadsheet formula execution and preserves exact prompt text for backups.
      return new Response(JSON.stringify({ format: 'prompthub-backup-v1', creator: { handle: creator.handle, name: creator.name }, prompts: rows }, null, 2), { headers: { 'Content-Type':'application/json', 'Content-Disposition':'attachment; filename="prompthub-backup.json"', 'Cache-Control':'private, no-store' } });
    }
    if (pathname === '/dashboard/earnings') return page('earnings', base());
    if (pathname === '/privacy-policy' || pathname === '/about') return page('info', { ...base(), privacy: pathname === '/privacy-policy' });
    // Old personal URLs remain useful as an explicitly labelled demo, never a database-error fallback.
    if (pathname === '/browse') return redirect('/c/demo/browse');
    if (pathname === '/search') return redirect('/c/demo?q=' + encodeURIComponent(url.searchParams.get('q') || ''));
    const match = pathname.match(/^\/c\/([a-z][a-z0-9_]{2,29})(?:\/(browse|prompt)(?:\/([^/]+))?)?$/);
    if (match) {
      const [, handle, action, rawKeyword] = match;
      const owner = handle === 'demo' ? demo : await db.one('SELECT id,handle,name FROM creators WHERE handle=?', handle);
      if (!owner) return fail('This creator page does not exist. Check the link from their bio.', 404, base());
      const q = normalizeKeyword(action === 'prompt' ? decodeURIComponent(rawKeyword || '') : url.searchParams.get('q') || '');
      if (q.length > 50) return page('viewer', { ...base(), owner, q: '', item: null, searched: true, isDemo: handle === 'demo' }, 404);
      if (action === 'browse') {
        const items = handle === 'demo' ? demoPrompts : await db.all('SELECT keyword,title FROM prompts WHERE creator_id=? AND status=? ORDER BY updated_at DESC LIMIT 500', owner.id, 'published');
        return page('browse', { ...base(), owner, items, isDemo: handle === 'demo' });
      }
      const item = !q ? null : handle === 'demo' ? demoPrompts.find(p => p.keyword === q) : await db.one('SELECT keyword,title,body FROM prompts WHERE creator_id=? AND keyword=? AND status=?', owner.id, q, 'published');
      return page('viewer', { ...base(), owner, q, item, searched: !!q, isDemo: handle === 'demo' }, q && !item ? 404 : 200);
    }
    return fail('Page not found.', 404, base());
  } catch (error) {
    console.error('PromptHub request failed', error?.name || 'Error');
    return fail('Prompts could not load right now. Your data has not been replaced. Please try again shortly.', 503, base());
  }
}
