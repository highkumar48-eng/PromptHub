import { render } from '../generated/templates.js';
import { database } from './database.js';
import { normalizeKeyword, validatePrompt, monetizationProgress, calculateLedger } from './domain.js';
import { parseCSV, convertCSVToPrompts } from './csv.js';

const demo = { id: 'demo', handle: 'demo', name: 'PromptHub Demo' };
const demoPrompts = [{ id: 'demo-saree', creator_id: 'demo', keyword: 'saree', title: 'Shadowed Saree Elegance', body: 'Create an editorial portrait of an adult woman wearing an elegant silk saree, standing beside a softly lit window. Use warm natural light, detailed fabric textures, a subtle background and a balanced vertical composition. Preserve realistic proportions. Shot on an 85mm portrait lens with shallow depth of field.', status: 'published' }];
const publicHeaders = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com" };
const redirect = location => new Response(null, { status: 303, headers: { Location: location, 'Cache-Control': 'no-store' } });
const page = (name, locals, status = 200) => new Response(render('v1/' + name, locals), { status, headers: publicHeaders });
const fail = (message, status, locals = {}) => page('error', { user: null, creator: null, localPreview: false, title: 'PromptHub', message, ...locals }, status);
const unique = e => /UNIQUE constraint|unique constraint/i.test(String(e));
const cookieValue = (request, name) => (request.headers.get('cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith(name + '='))?.slice(name.length + 1) || '';
async function digest(value) {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(buffer)].map(x => x.toString(16).padStart(2, '0')).join('');
}
async function countPublicVisitor(db, request, creatorId, localPreview = false) {
  const date = new Date().toISOString().slice(0, 10);
  let token = cookieValue(request, 'phv');
  let setCookie = null;
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) { token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', ''); setCookie = `phv=${token}; Path=/; Max-Age=7776000; HttpOnly; ${localPreview ? '' : 'Secure; '}SameSite=Lax`; }
  const visitorHash = await digest(token);
  const insert = await db.run('INSERT OR IGNORE INTO creator_daily_visitors (creator_id,metric_date,visitor_hash) VALUES (?,?,?)', creatorId, date, visitorHash);
  if (insert.meta?.changes) await db.run('INSERT INTO creator_daily_metrics (creator_id,metric_date,unique_visitors) VALUES (?,?,1) ON CONFLICT(creator_id,metric_date) DO UPDATE SET unique_visitors=unique_visitors+1', creatorId, date);
  // Delete only raw pseudonymous hashes after 90 days. Daily aggregate totals are the permanent creator ledger.
  await db.run("DELETE FROM creator_daily_visitors WHERE metric_date < date('now','-90 days')");
  return setCookie;
}
async function creatorMonetization(db, creatorId) {
  const [current, previous, stored] = await Promise.all([
    db.one("SELECT COALESCE(SUM(unique_visitors),0) AS count FROM creator_daily_metrics WHERE creator_id=? AND metric_date >= date('now','start of month')", creatorId),
    db.one("SELECT COALESCE(SUM(unique_visitors),0) AS count FROM creator_daily_metrics WHERE creator_id=? AND metric_date >= date('now','start of month','-1 month') AND metric_date < date('now','start of month')", creatorId),
    db.one('SELECT status,creator_share_percent,activated_at,paused_reason FROM creator_monetization WHERE creator_id=?', creatorId),
  ]);
  return monetizationProgress({ currentMonthVisitors: Number(current.count), previousMonthVisitors: Number(previous.count), storedStatus: stored?.status, creatorSharePercent: stored?.creator_share_percent || 50 });
}
const isAdmin = (env, user) => Boolean(user) && (env.LOCAL_PREVIEW ? user.id === 'local_seedy' : String(env.ADMIN_USER_IDS || '').split(',').map(x => x.trim()).includes(user.id));
const inrToPaise = value => {
  const normalized = String(value ?? '').trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error('Enter a valid INR amount with up to two decimal places.');
  const [whole, fraction = ''] = normalized.split('.'); return Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
};

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
  const admin = isAdmin(env, user);
  let creator = null;
  const base = () => ({ title: 'PromptHub', user, creator, isAdmin: admin, localPreview: !!env.LOCAL_PREVIEW });
  try {
    const db = database(env);
    if (pathname.startsWith('/dashboard') || pathname === '/join') {
      if (!user) return request.method === 'GET' ? redirect('/signin-with-chatgpt?return_to=' + encodeURIComponent(pathname)) : fail('Sign in to continue.', 401);
      creator = await db.one('SELECT * FROM creators WHERE user_id = ?', user.id);
    }
    if (request.method === 'POST') {
      if (!user || (!pathname.startsWith('/dashboard') && !pathname.startsWith('/admin'))) return fail('Sign in to continue.', 401);
      if (request.headers.get('origin') !== url.origin || request.headers.get('sec-fetch-site') === 'cross-site') return fail('Please submit this form from your PromptHub page.', 403);
      const form = await readForm(request);
      if (pathname.startsWith('/admin')) {
        if (!admin) return fail('Admin access is required.', 403, base());
        if (pathname === '/admin/ledger') {
          try {
            if (!/^\d{4}-\d{2}$/.test(String(form.month || ''))) throw new Error('Choose a valid accounting month.');
            const target = await db.one('SELECT id FROM creators WHERE id=?', form.creatorId || '');
            if (!target) return fail('Creator not found.', 404, base());
            const grossRevenuePaise = inrToPaise(form.grossRevenue), invalidTrafficPaise = inrToPaise(form.invalidTraffic || '0'), taxDeductionsPaise = inrToPaise(form.taxDeductions || '0'), directCostsPaise = inrToPaise(form.directCosts || '0');
            const stored = await db.one('SELECT creator_share_percent FROM creator_monetization WHERE creator_id=?', target.id);
            const share = stored?.creator_share_percent || 50;
            const ledger = calculateLedger({ grossRevenuePaise, invalidTrafficPaise, taxDeductionsPaise, directCostsPaise, creatorSharePercent: share });
            const now = new Date().toISOString(), note = String(form.note || '').trim().slice(0, 500);
            await db.run('INSERT INTO creator_monthly_ledger (id,creator_id,month,currency,gross_revenue_paise,invalid_traffic_paise,tax_deductions_paise,direct_costs_paise,net_distributable_paise,creator_share_paise,platform_share_paise,status,note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(creator_id,month) DO UPDATE SET gross_revenue_paise=excluded.gross_revenue_paise,invalid_traffic_paise=excluded.invalid_traffic_paise,tax_deductions_paise=excluded.tax_deductions_paise,direct_costs_paise=excluded.direct_costs_paise,net_distributable_paise=excluded.net_distributable_paise,creator_share_paise=excluded.creator_share_paise,platform_share_paise=excluded.platform_share_paise,note=excluded.note,updated_at=excluded.updated_at WHERE creator_monthly_ledger.status=\'calculated\'', crypto.randomUUID(), target.id, form.month, 'INR', grossRevenuePaise, invalidTrafficPaise, taxDeductionsPaise, directCostsPaise, ledger.netDistributablePaise, ledger.creatorSharePaise, ledger.platformSharePaise, 'calculated', note, now, now);
            return redirect('/admin?month=' + encodeURIComponent(form.month) + '&notice=ledger-saved');
          } catch (e) { return fail(e.message || 'Could not calculate the ledger.', 400, base()); }
        }
        const ledgerId = form.id || '';
        if (pathname === '/admin/approve') {
          await db.run("UPDATE creator_monthly_ledger SET status='approved',approved_at=?,updated_at=? WHERE id=? AND status='calculated'", new Date().toISOString(), new Date().toISOString(), ledgerId);
          return redirect('/admin?notice=approved');
        }
        if (pathname === '/admin/mark-paid') {
          const reference = String(form.paymentReference || '').trim();
          if (!reference || reference.length > 100) return fail('Add the UPI payment reference (up to 100 characters).', 400, base());
          await db.run("UPDATE creator_monthly_ledger SET status='paid',payment_reference=?,paid_at=?,updated_at=? WHERE id=? AND status='approved'", reference, new Date().toISOString(), new Date().toISOString(), ledgerId);
          return redirect('/admin?notice=paid');
        }
        return fail('Admin page not found.', 404, base());
      }
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
    if (pathname === '/admin') {
      if (!user) return redirect('/signin-with-chatgpt?return_to=/admin');
      if (!admin) return fail('Admin access is required. Add your ChatGPT user ID to ADMIN_USER_IDS before using the production admin dashboard.', 403, base());
      const month = /^\d{4}-\d{2}$/.test(url.searchParams.get('month') || '') ? url.searchParams.get('month') : new Date().toISOString().slice(0, 7);
      const [creators, ledgers] = await Promise.all([
        db.all("SELECT c.id,c.handle,c.name,COALESCE(SUM(CASE WHEN m.metric_date>=date('now','start of month','-1 month') AND m.metric_date<date('now','start of month') THEN m.unique_visitors ELSE 0 END),0) AS previous_month_visitors,COALESCE(SUM(CASE WHEN m.metric_date>=date('now','start of month') THEN m.unique_visitors ELSE 0 END),0) AS current_month_visitors FROM creators c LEFT JOIN creator_daily_metrics m ON m.creator_id=c.id GROUP BY c.id ORDER BY previous_month_visitors DESC",),
        db.all('SELECT l.*,c.handle,c.name FROM creator_monthly_ledger l JOIN creators c ON c.id=l.creator_id WHERE l.month=? ORDER BY l.status,c.name', month),
      ]);
      const notices = { 'ledger-saved':'Ledger saved as calculated. Review it before approval.', approved:'Payout approved. Send the UPI transfer, then mark it paid.', paid:'Payout marked as paid.' };
      return page('admin', { ...base(), creators, ledgers, month, notice: notices[url.searchParams.get('notice')] || '' });
    }
    if (pathname === '/') return page('home', base());
    if (pathname === '/join') return creator ? redirect('/dashboard') : page('join', { ...base(), form: {}, error: '' });
    if (pathname.startsWith('/dashboard') && !creator) return redirect('/join');
    if (pathname === '/dashboard') {
      const [items, monetization] = await Promise.all([
        db.all('SELECT id,keyword,title,status,updated_at FROM prompts WHERE creator_id=? ORDER BY updated_at DESC', creator.id),
        creatorMonetization(db, creator.id),
      ]);
      const notices = { welcome: 'Your page is ready. Add your first prompt.', saved: 'Prompt saved.', imported: 'Imported as drafts. Review each prompt before publishing.', unpublished: 'Prompt moved to drafts. Viewers can no longer find it.' };
      return page('dashboard', { ...base(), items, monetization, notice: notices[url.searchParams.get('notice')] || '', personalLink: url.origin + '/c/' + creator.handle });
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
    if (pathname === '/dashboard/earnings') return page('earnings', { ...base(), monetization: await creatorMonetization(db, creator.id) });
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
      const visitorCookie = item && handle !== 'demo' ? await countPublicVisitor(db, request, owner.id, !!env.LOCAL_PREVIEW) : null;
      const response = page('viewer', { ...base(), owner, q, item, searched: !!q, isDemo: handle === 'demo' }, q && !item ? 404 : 200);
      if (visitorCookie) response.headers.append('Set-Cookie', visitorCookie);
      return response;
    }
    return fail('Page not found.', 404, base());
  } catch (error) {
    console.error('PromptHub request failed', error?.name || 'Error');
    return fail('Prompts could not load right now. Your data has not been replaced. Please try again shortly.', 503, base());
  }
}
