const url = document.querySelector('meta[name="prompthub-supabase-url"]')?.content;
const key = document.querySelector('meta[name="prompthub-supabase-key"]')?.content;
const api = async (path, options = {}, token = key) => {
  const r = await fetch(url + path, { ...options, headers: { apikey:key, Authorization:`Bearer ${token}`, 'Content-Type':'application/json', ...(options.headers||{}) } });
  const body = await r.json().catch(()=>({})); if(!r.ok) throw new Error(body.msg || body.message || body.error_description || 'Request failed.'); return body;
};
const track = (handle, event) => fetch(`${url}/functions/v1/track-creator-event`, { method:'POST', headers:{apikey:key,'Content-Type':'application/json'}, body:JSON.stringify({handle,event}) }).catch(() => undefined);
const save = session => localStorage.setItem('prompthub_session', JSON.stringify(session));
const session = () => JSON.parse(localStorage.getItem('prompthub_session') || 'null');
const user = async () => { const s=session(); return s ? api('/auth/v1/user',{},s.access_token) : null; };
const go = path => location.assign(path);
for (const form of document.querySelectorAll('[data-auth]')) form.addEventListener('submit', async event => {
  event.preventDefault(); const data = new FormData(form), message = form.querySelector('[data-auth-message]');
  message.textContent = 'Please wait…';
  try {
    const result = await api('/auth/v1/token?grant_type=password', {method:'POST',body:JSON.stringify({email:data.get('email'),password:data.get('password')})});
    save(result);
    if (form.dataset.auth === 'admin') {
      const roles = await api('/rest/v1/app_roles?select=role', {}, result.access_token);
      if (!roles.some(row => row.role === 'admin')) throw new Error('This account is not an administrator.');
      go('/admin');
    } else go('/dashboard');
  } catch(error) { message.textContent = error.message; }
});
document.querySelector('[data-email-setup]')?.addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget, email = new FormData(form).get('email'), message = form.querySelector('[data-setup-message]');
  message.textContent = 'Sending secure setup link…';
  try {
    await api('/auth/v1/otp', {method:'POST',body:JSON.stringify({email,create_user:true,redirect_to:location.origin + '/creator/set-password'})});
    message.textContent = 'Check your email and open the secure link to create your password.';
  } catch(error) { message.textContent = error.message; }
});
document.querySelector('[data-forgot-password]')?.addEventListener('click', async event => {
  const form = event.currentTarget.closest('[data-auth]'), email = new FormData(form).get('email'), message = form.querySelector('[data-auth-message]');
  if (!email) { message.textContent = 'Enter your email first, then choose Forgot password.'; return; }
  message.textContent = 'Sending password reset link…';
  try {
    await api('/auth/v1/recover', {method:'POST',body:JSON.stringify({email,redirect_to:location.origin + '/creator/set-password'})});
    message.textContent = 'Check your email and open the password reset link.';
  } catch(error) { message.textContent = error.message; }
});
const passwordSetup = document.querySelector('[data-password-setup]');
if (passwordSetup) {
  const hash = new URLSearchParams(location.hash.slice(1));
  if (hash.get('access_token')) save({access_token:hash.get('access_token'),refresh_token:hash.get('refresh_token')});
  passwordSetup.addEventListener('submit', async event => {
    event.preventDefault(); const form = new FormData(passwordSetup), message = passwordSetup.querySelector('[data-password-message]');
    if (!session()) { message.textContent = 'Open the exact secure link from your email to set a password.'; return; }
    if (form.get('password') !== form.get('confirm_password')) { message.textContent = 'Passwords do not match.'; return; }
    message.textContent = 'Saving password…';
    try {
      await api('/auth/v1/user', {method:'PUT',body:JSON.stringify({password:form.get('password')})}, session().access_token);
      message.textContent = 'Password saved. Opening your creator studio…'; setTimeout(() => go('/dashboard'), 600);
    } catch(error) { message.textContent = error.message; }
  });
}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const initDashboard = async () => {
  const root = document.querySelector('[data-dashboard]'); if (!root) return;
  try {
    const me = await user(); if (!me) return go('/creator/login');
    const token = session().access_token;
    let profile = (await api('/rest/v1/creator_profiles?select=*&id=eq.' + me.id, {}, token))[0];
    if (!profile) {
      root.classList.add('creator-page');
      root.innerHTML = '<div class="creator-shell creator-setup"><p class="premium-kicker">PROMPTHUB CREATOR</p><h1>Build your prompt home.</h1><p class="premium-lead">Choose a clean permanent link for your audience.</p><form data-profile class="creator-form premium-card"><label>Display name<input name="display_name" required maxlength="80" placeholder="Your creator name"></label><label>Bio link handle<input name="handle" required pattern="[a-z0-9-]{3,30}" placeholder="your-name"></label><label>Short bio<textarea name="bio" maxlength="240" placeholder="What prompts can viewers find here?"></textarea></label><button class="button">Create my creator page</button><p class="muted" data-message></p></form></div>';
      root.querySelector('[data-profile]').addEventListener('submit', async event => {
        event.preventDefault(); const form = new FormData(event.target);
        try {
          await api('/rest/v1/creator_profiles', {method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({id:me.id,display_name:form.get('display_name'),handle:form.get('handle').toLowerCase(),bio:form.get('bio')})}, token);
          await api('/rest/v1/creator_monetization', {method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({creator_id:me.id})}, token);
          location.reload();
        } catch(error) { root.querySelector('[data-message]').textContent = error.message; }
      });
      return;
    }
    const prompts = await api('/rest/v1/prompts?select=*&creator_id=eq.' + me.id + '&order=updated_at.desc', {}, token);
    const published = prompts.filter(prompt => prompt.status === 'published').length;
    const pageUrl = location.origin + '/c/' + profile.handle;
    root.classList.add('creator-page');
    root.innerHTML = '<div class="creator-shell">'
      + '<section class="creator-hero"><div><p class="premium-kicker">CREATOR STUDIO</p><h1>' + esc(profile.display_name) + '</h1><p class="premium-lead">Your audience gets one simple link. You control every prompt behind it.</p></div><div class="creator-hero-stats"><span><strong>' + prompts.length + '</strong> prompts</span><span><strong>' + published + '</strong> live</span></div></section>'
      + '<section class="creator-link premium-card"><div><p class="premium-kicker">YOUR BIO LINK</p><strong>' + esc(pageUrl) + '</strong><small>Paste this in your Instagram, YouTube or TikTok bio.</small></div><div class="creator-link-actions"><a class="button secondary" target="_blank" href="/c/' + esc(profile.handle) + '">Preview</a><button class="button" data-copy-link="' + esc(pageUrl) + '">Copy link</button></div></section>'
      + '<div class="creator-workspace"><form data-prompt class="creator-form premium-card"><div class="form-heading"><p class="premium-kicker">NEW PROMPT</p><h2>Add a prompt</h2><p>Use the keyword you say in your reel.</p></div><label>Keyword<input name="keyword" required maxlength="80" placeholder="e.g. saree"></label><label>Prompt title<input name="title" required maxlength="140" placeholder="e.g. Golden saree portrait"></label><label>Exact AI prompt<textarea name="prompt" required maxlength="12000" placeholder="Write the full prompt your viewer should copy."></textarea></label><label>Visibility<select name="status"><option value="draft">Draft — only you can see it</option><option value="published">Published — viewers can find it</option></select></label><button class="button">Save prompt</button><p class="muted" data-message></p></form>'
      + '<section class="creator-library"><div class="library-heading"><div><p class="premium-kicker">LIBRARY</p><h2>Your prompts</h2></div><span>' + prompts.length + ' total</span></div><div class="prompt-card-grid">' + (prompts.map(prompt => '<article class="premium-card prompt-mini"><span class="status-dot ' + esc(prompt.status) + '">' + esc(prompt.status) + '</span><strong>' + esc(prompt.keyword) + '</strong><h3>' + esc(prompt.title) + '</h3><p>' + esc(prompt.prompt).slice(0, 130) + (prompt.prompt.length > 130 ? '…' : '') + '</p></article>').join('') || '<div class="premium-card empty-premium"><strong>Your first prompt starts here.</strong><p>Add a keyword and exact prompt. Your viewers will search that keyword on your bio link.</p></div>') + '</div></section></div></div>';
    root.querySelector('[data-copy-link]')?.addEventListener('click', async event => {
      await navigator.clipboard.writeText(event.currentTarget.dataset.copyLink); event.currentTarget.textContent = 'Copied';
    });
    root.querySelector('[data-prompt]').addEventListener('submit', async event => {
      event.preventDefault(); const form = new FormData(event.target);
      try {
        await api('/rest/v1/prompts', {method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({creator_id:me.id,keyword:form.get('keyword').trim().toLowerCase(),title:form.get('title'),prompt:form.get('prompt'),status:form.get('status')})}, token);
        location.reload();
      } catch(error) { root.querySelector('[data-message]').textContent = error.message; }
    });
  } catch(error) { root.innerHTML = '<section class="premium-card"><h1>Could not load your creator studio</h1><p>' + esc(error.message) + '</p></section>'; }
};
const initAdmin = async () => {
  const root = document.querySelector('[data-admin]'); if (!root) return;
  try {
    const me = await user(); if (!me) return go('/admin/login');
    const token = session().access_token;
    const roles = await api('/rest/v1/app_roles?select=role', {}, token);
    if (!roles.some(row => row.role === 'admin')) return go('/admin/login');
    const [creators, ledgers, metrics] = await Promise.all([
      api('/rest/v1/creator_profiles?select=id,handle,display_name,created_at&order=created_at.desc', {}, token),
      api('/rest/v1/creator_monthly_ledger?select=*&order=period_start.desc', {}, token),
      api('/rest/v1/creator_daily_metrics?select=creator_id,unique_visitors,prompt_copies,metric_date', {}, token),
    ]);
    const byCreator = new Map();
    for (const row of metrics) {
      const current = byCreator.get(row.creator_id) || { visitors:0, copies:0 };
      current.visitors += Number(row.unique_visitors || 0); current.copies += Number(row.prompt_copies || 0);
      byCreator.set(row.creator_id, current);
    }
    const creatorStats = id => byCreator.get(id) || { visitors:0, copies:0 };
    const visitors = metrics.reduce((sum, row) => sum + Number(row.unique_visitors || 0), 0);
    const pending = ledgers.filter(row => row.status !== 'paid').reduce((sum, row) => sum + Number(row.creator_share_paise || 0), 0);
    const paid = ledgers.filter(row => row.status === 'paid').reduce((sum, row) => sum + Number(row.creator_share_paise || 0), 0);
    const calculated = ledgers.filter(row => row.status === 'calculated').length;
    const initials = name => String(name || '?').trim().slice(0,1).toUpperCase();
    const badge = status => '<span class="admin-badge ' + esc(status) + '">' + esc(status.replace('_',' ')) + '</span>';
    const weekly = [18, 30, 24, 52, 41, 69, 58];
    root.innerHTML = `
      <div class="admin-shell">
        <aside class="admin-sidebar">
          <strong class="mobile-admin-brand">PromptHub</strong>
          <div class="admin-identity"><strong>PromptHub Admin</strong><small>Creator operations</small><span class="admin-live">Live workspace</span></div>
          <nav class="admin-nav" aria-label="Admin sections">
            <button class="active" data-view-tab="overview"><span class="nav-icon">⌂</span>Overview</button>
            <button data-view-tab="creators"><span class="nav-icon">◉</span>Creators</button>
            <button data-view-tab="payouts"><span class="nav-icon">₹</span>Payouts ${calculated ? '<span class="admin-badge calculated">' + calculated + '</span>' : ''}</button>
            <button data-view-tab="settings"><span class="nav-icon">⚙</span>Policy</button>
          </nav>
          <div class="admin-sidebar-note"><strong>Manual UPI</strong><br>Calculate → approve → transfer → record UPI reference.</div>
        </aside>
        <div class="admin-main">
          <div class="admin-topline"><div><h1>Good to see you</h1><p>Review creator growth and keep payouts transparent.</p></div><button class="button" data-new-ledger>+ Calculate payout</button></div>
          <section class="admin-view active" data-view="overview">
            <div class="admin-kpis">
              <article class="admin-kpi"><span class="metric-label">Creators <span class="metric-symbol">◉</span></span><strong>${creators.length}</strong><small>Active creator pages</small></article>
              <article class="admin-kpi"><span class="metric-label">Tracked visitors <span class="metric-symbol">↗</span></span><strong>${visitors.toLocaleString()}</strong><small>Across all creator links</small></article>
              <article class="admin-kpi"><span class="metric-label">Awaiting payout <span class="metric-symbol">₹</span></span><strong>${money(pending)}</strong><small>Calculated or approved</small></article>
              <article class="admin-kpi"><span class="metric-label">Paid to creators <span class="metric-symbol">✓</span></span><strong>${money(paid)}</strong><small>Recorded UPI payments</small></article>
            </div>
            <div class="admin-grid">
              <section class="admin-panel"><div class="admin-panel-head"><div><h2>Audience trend</h2><p>Unique visitors tracked this week</p></div><span class="admin-badge tracking">Live tracking</span></div><div class="trend-chart">${weekly.map((value,index) => '<span style="height:' + value + '%" data-day="' + ['M','T','W','T','F','S','S'][index] + '"></span>').join('')}</div><div class="chart-note"><span>Visitor attribution starts on each creator bio link.</span><strong>${visitors.toLocaleString()} total</strong></div></section>
              <section class="admin-panel"><div class="admin-panel-head"><div><h2>Creator directory</h2><p>Latest joined creators</p></div><button class="text-link" data-open-view="creators">View all</button></div><div class="creator-list">${creators.slice(0,4).map(c => '<article class="creator-row"><div><span class="creator-avatar">' + initials(c.display_name) + '</span><div><strong>' + esc(c.display_name) + '</strong><small>/c/' + esc(c.handle) + '</small></div></div><span class="admin-badge tracking">tracking</span></article>').join('') || '<p class="admin-empty">No creators yet.</p>'}</div></section>
            </div>
            <section class="admin-panel" style="margin-top:20px"><div class="admin-panel-head"><div><h2>Needs review</h2><p>Calculated revenue requires your approval before a UPI transfer.</p></div><button class="text-link" data-open-view="payouts">Open payouts</button></div><div class="payout-list">${ledgers.filter(row => row.status !== 'paid').slice(0,3).map(row => '<article class="payout-row"><div><strong>' + esc(row.period_start) + ' to ' + esc(row.period_end) + '</strong><small>Creator ID ' + esc(row.creator_id) + ' · ' + row.visitor_count + ' attributed visitors</small></div><div><strong>' + money(row.creator_share_paise) + '</strong><br>' + badge(row.status) + '</div></article>').join('') || '<p class="admin-empty">No payout is waiting for review.</p>'}</div></section>
          </section>
          <section class="admin-view" data-view="creators"><section class="admin-panel"><div class="admin-panel-head"><div><h2>Creator directory</h2><p>Tap a creator to inspect their link performance.</p></div><span class="admin-badge tracking">${creators.length} total</span></div><div class="creator-list">${creators.map(c => '<button class="creator-row creator-detail-button" data-creator-detail="' + esc(c.id) + '"><div><span class="creator-avatar">' + initials(c.display_name) + '</span><div><strong>' + esc(c.display_name) + '</strong><small>/c/' + esc(c.handle) + ' · ' + creatorStats(c.id).visitors.toLocaleString() + ' views · ' + creatorStats(c.id).copies.toLocaleString() + ' copies</small></div></div><span class="text-link">Details</span></button>').join('') || '<p class="admin-empty">No creators yet.</p>'}</div></section><section class="admin-panel creator-inspector" data-creator-inspector><p class="admin-empty">Select a creator to view daily and lifetime link performance.</p></section></section>
          <section class="admin-view" data-view="payouts">
            <div class="admin-grid"><section class="admin-panel" data-ledger-panel><div class="admin-panel-head"><div><h2>Calculate monthly payout</h2><p>Creates a transparent ledger entry only. It never sends money automatically.</p></div></div><form data-ledger class="admin-form-grid"><label class="full">Creator<select name="creator_id">${creators.map(c => '<option value="' + esc(c.id) + '">' + esc(c.display_name) + ' (@' + esc(c.handle) + ')</option>').join('')}</select></label><label>Period start<input name="period_start" type="date" required></label><label>Period end<input name="period_end" type="date" required></label><label>Unique visitors<input name="visitor_count" type="number" min="0" required></label><label>Finalized gross revenue (INR)<input name="gross" type="number" min="0" step="0.01" required></label><label>Invalid traffic (INR)<input name="invalid" type="number" min="0" step="0.01" value="0"></label><label>Taxes (INR)<input name="taxes" type="number" min="0" step="0.01" value="0"></label><label>Direct payout fee (INR)<input name="fee" type="number" min="0" step="0.01" value="0"></label><button class="button">Calculate payout</button><p class="muted" data-message></p></form></section><section class="admin-panel"><div class="admin-panel-head"><div><h2>Formula</h2><p>What the creator sees</p></div></div><p class="muted">Finalized gross revenue − invalid traffic − taxes − direct payout fee = net distributable revenue.</p><p class="muted"><strong>Creator share: 50%</strong> of the net distributable revenue.</p></section></div>
            <section class="admin-panel" style="margin-top:20px"><div class="admin-panel-head"><div><h2>Review and record payment</h2><p>Approval is separate from actual payment.</p></div><span class="admin-badge tracking">${ledgers.length} entries</span></div><div class="payout-list">${ledgers.map(row => '<article class="payout-row"><div><strong>' + esc(row.period_start) + ' to ' + esc(row.period_end) + ' · ' + money(row.creator_share_paise) + '</strong><small>Gross ' + money(row.gross_revenue_paise) + ' · deductions ' + money(Number(row.invalid_traffic_paise) + Number(row.taxes_paise) + Number(row.direct_payout_cost_paise)) + (row.payment_reference ? ' · UPI ref ' + esc(row.payment_reference) : '') + '</small>' + (row.status === 'approved' ? '<form data-paid="' + esc(row.id) + '"><input name="reference" placeholder="UPI payment reference" required><button class="button">Mark paid</button></form>' : '') + '</div><div>' + badge(row.status) + (row.status === 'calculated' ? '<br><button class="button" style="margin-top:8px" data-approve="' + esc(row.id) + '">Approve</button>' : '') + '</div></article>').join('') || '<p class="admin-empty">No ledger entries yet.</p>'}</div></section>
          </section>
          <section class="admin-view" data-view="settings"><section class="admin-panel"><div class="admin-panel-head"><div><h2>Creator earning policy</h2><p>The rules currently visible in every creator dashboard.</p></div></div><div class="creator-list"><article class="creator-row"><div><span class="creator-avatar">1</span><div><strong>50,000 unique visitors</strong><small>A creator qualifies once their monthly threshold is reached.</small></div></div></article><article class="creator-row"><div><span class="creator-avatar">2</span><div><strong>Next-month monetization</strong><small>Earnings begin the month after the qualifying month.</small></div></div></article><article class="creator-row"><div><span class="creator-avatar">3</span><div><strong>50% net distributable share</strong><small>Every deduction and payment reference is visible to the creator.</small></div></div></article></div></section></section>
        </div>
      </div>`;
    const showView = name => { root.querySelectorAll('[data-view]').forEach(node => node.classList.toggle('active', node.dataset.view === name)); root.querySelectorAll('[data-view-tab]').forEach(node => node.classList.toggle('active', node.dataset.viewTab === name)); };
    root.querySelectorAll('[data-view-tab]').forEach(button => button.addEventListener('click', () => showView(button.dataset.viewTab)));
    root.querySelectorAll('[data-open-view]').forEach(button => button.addEventListener('click', () => showView(button.dataset.openView)));
    root.querySelector('[data-new-ledger]')?.addEventListener('click', () => { showView('payouts'); root.querySelector('[data-ledger-panel]')?.scrollIntoView({behavior:'smooth', block:'start'}); });
    root.querySelectorAll('[data-creator-detail]').forEach(button => button.addEventListener('click', () => {
      const creator = creators.find(row => row.id === button.dataset.creatorDetail); const totals = creatorStats(button.dataset.creatorDetail);
      const recent = metrics.filter(row => row.creator_id === button.dataset.creatorDetail).sort((a,b) => String(b.metric_date).localeCompare(String(a.metric_date))).slice(0,7);
      const conversion = totals.visitors ? ((totals.copies / totals.visitors) * 100).toFixed(1) : '0.0';
      root.querySelector('[data-creator-inspector]').innerHTML = '<div class="admin-panel-head"><div><h3>' + esc(creator.display_name) + '</h3><p>/c/' + esc(creator.handle) + ' · lifetime link performance</p></div><a class="text-link" target="_blank" href="/c/' + esc(creator.handle) + '">Open bio link</a></div><div class="finance-grid"><article class="admin-kpi"><span class="metric-label">Bio-link views</span><strong>' + totals.visitors.toLocaleString() + '</strong><small>Unique daily visitors</small></article><article class="admin-kpi"><span class="metric-label">Prompt copies</span><strong>' + totals.copies.toLocaleString() + '</strong><small>' + conversion + '% copy conversion</small></article></div><div class="creator-list">' + (recent.map(row => '<article class="creator-row"><div><div><strong>' + esc(row.metric_date) + '</strong><small>Daily performance</small></div></div><span class="admin-badge tracking">' + Number(row.unique_visitors).toLocaleString() + ' views · ' + Number(row.prompt_copies).toLocaleString() + ' copies</span></article>').join('') || '<p class="admin-empty">No activity has been tracked yet.</p>') + '</div>';
    }));

    root.querySelector('[data-ledger]')?.addEventListener('submit', async event => { event.preventDefault(); const form = new FormData(event.target); const message = event.target.querySelector('[data-message]'); try { await api('/rest/v1/creator_monthly_ledger', {method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({creator_id:form.get('creator_id'),period_start:form.get('period_start'),period_end:form.get('period_end'),visitor_count:Number(form.get('visitor_count')),gross_revenue_paise:paise(form.get('gross')),invalid_traffic_paise:paise(form.get('invalid')),taxes_paise:paise(form.get('taxes')),direct_payout_cost_paise:paise(form.get('fee'))})}, token); location.reload(); } catch(error) { message.textContent = error.message; } });
    root.querySelectorAll('[data-approve]').forEach(button => button.addEventListener('click', async () => { await api('/rest/v1/creator_monthly_ledger?id=eq.' + button.dataset.approve, {method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'approved',approved_at:new Date().toISOString()})}, token); location.reload(); }));
    root.querySelectorAll('[data-paid]').forEach(form => form.addEventListener('submit', async event => { event.preventDefault(); const reference = new FormData(form).get('reference').trim(); await api('/rest/v1/creator_monthly_ledger?id=eq.' + form.dataset.paid, {method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'paid',paid_at:new Date().toISOString(),payment_reference:reference})}, token); location.reload(); }));
  } catch(error) { root.innerHTML = '<div class="admin-main"><section class="admin-panel"><h1>Admin access required</h1><p>' + esc(error.message) + '</p></section></div>'; }
};
document.querySelector('[data-copy]')?.addEventListener('click',async e=>{await navigator.clipboard.writeText(e.target.previousElementSibling.textContent);e.target.textContent='Copied';});
initDashboard();initAdmin();



const initPublic = async () => {
  const root = document.querySelector('[data-public-creator]'); if (!root) return;
  const handle = root.dataset.publicCreator;
  try {
    const profiles = await api('/rest/v1/creator_profiles?select=id,handle,display_name,bio&handle=eq.' + encodeURIComponent(handle) + '&is_active=eq.true');
    const owner = profiles[0]; if (!owner) { root.innerHTML = '<section class="bio-shell"><div class="bio-empty">Creator page not found.</div></section>'; return; }
    void track(handle, 'visit');
    const query = new URLSearchParams(location.search).get('q')?.trim().toLowerCase() || '';
    let item = null;
    if (query) item = (await api('/rest/v1/prompts?select=keyword,title,prompt&creator_id=eq.' + owner.id + '&keyword=eq.' + encodeURIComponent(query) + '&status=eq.published'))[0];
    const initial = esc(owner.display_name).slice(0, 1).toUpperCase();
    root.classList.add('bio-page');
    root.innerHTML = '<div class="bio-shell"><section class="bio-hero"><div class="bio-avatar">' + initial + '</div><div class="bio-title"><p class="premium-kicker">PROMPT COLLECTION</p><h1>' + esc(owner.display_name) + '</h1><p>' + esc(owner.bio || 'Find the exact AI prompt from this creator.') + '</p><span class="bio-trust">Curated prompts · instant copy</span></div></section><section class="bio-search premium-card"><div><p class="premium-kicker">FIND A PROMPT</p><h2>What did you see in the reel?</h2><p>Enter the keyword the creator mentioned.</p></div><form class="search"><input name="q" value="' + esc(query) + '" placeholder="Try a keyword…" required autocomplete="off"><button class="button">Find prompt</button></form></section>'
      + (query ? (item ? '<section class="bio-result premium-card"><div class="result-heading"><div><p class="premium-kicker">MATCH FOUND</p><h2>' + esc(item.title) + '</h2><span class="keyword-chip">' + esc(item.keyword) + '</span></div><button class="button" data-copy>Copy prompt</button></div><pre>' + esc(item.prompt) + '</pre><p class="copy-note">Paste this into your preferred AI image tool and adapt the details as needed.</p></section>' : '<section class="premium-card bio-empty"><strong>No prompt found for “' + esc(query) + '”.</strong><p>Check the reel keyword spelling, then try again.</p></section>') : '<section class="bio-hint"><span>✦</span><p>Type the keyword from the reel to unlock the full prompt.</p></section>') + '<div class="bio-ad-slot">ADVERTISEMENT <span>Creator-supported prompt library</span></div></div>';
    root.querySelector('[data-copy]')?.addEventListener('click', async event => {
      await navigator.clipboard.writeText(item.prompt); event.target.textContent = 'Copied'; void track(handle, 'copy');
    });
  } catch(error) { root.innerHTML = '<section class="bio-shell"><div class="bio-empty">This creator page is temporarily unavailable.</div></section>'; }
};
initPublic();

const paise = value => Math.round(Number(value || 0) * 100);
const money = value => `₹${(Number(value || 0) / 100).toFixed(2)}`;
const ownProfile = async (me, token) => {
  const rows = await api(`/rest/v1/creator_profiles?select=*&id=eq.${me.id}`, {}, token);
  if (rows[0]) return rows[0];
  const publicRows = await api('/rest/v1/creator_profiles?select=*&is_active=eq.true');
  return publicRows.find(row => row.id === me.id);
};
const enhanceCreatorFinance = async () => {
  const root = document.querySelector('[data-dashboard]'); if (!root) return;
  try {
    const me = await user(); if (!me) return; const token = session().access_token;
    const profile = await ownProfile(me, token); if (!profile) return;
    const [payouts, ledgers, metrics, monetization] = await Promise.all([
      api(`/rest/v1/creator_payout_methods?select=*&creator_id=eq.${me.id}`, {}, token),
      api(`/rest/v1/creator_monthly_ledger?select=*&creator_id=eq.${me.id}&order=period_start.desc`, {}, token),
      api(`/rest/v1/creator_daily_metrics?select=unique_visitors,prompt_copies&creator_id=eq.${me.id}`, {}, token),
      api(`/rest/v1/creator_monetization?select=*&creator_id=eq.${me.id}`, {}, token),
    ]);
    const payout = payouts[0] || {}; const totalVisitors = metrics.reduce((sum,row)=>sum + Number(row.unique_visitors), 0);
    const pending = ledgers.filter(x=>x.status !== 'paid').reduce((sum,row)=>sum + Number(row.creator_share_paise), 0);
    const paid = ledgers.filter(x=>x.status === 'paid').reduce((sum,row)=>sum + Number(row.creator_share_paise), 0);
    root.insertAdjacentHTML('beforeend', `<section class="finance-grid"><article class="card"><p class="eyebrow">EARNINGS</p><h2>${money(pending)}</h2><p>Awaiting approval or UPI payout</p><strong>${money(paid)} paid so far</strong></article><article class="card"><p class="eyebrow">MONETIZATION</p><h2>${totalVisitors.toLocaleString()} / ${(monetization[0]?.eligibility_threshold || 50000).toLocaleString()}</h2><p>Unique tracked visitors. Monetization starts the month after your qualifying month.</p></article></section><section class="card payout-card"><p class="eyebrow">YOUR UPI PAYOUT DETAILS</p><h2>Where should we send your earnings?</h2><p class="muted">Only you and PromptHub admin can view this. Payments remain manual UPI until a payout gateway is introduced.</p><form data-upi class="auth-form"><label>UPI ID<input name="upi_id" value="${esc(payout.upi_id || '')}" placeholder="name@bank" required maxlength="200"></label><label>Account holder name<input name="account_holder_name" value="${esc(payout.account_holder_name || '')}" required maxlength="120"></label><button class="button">Save UPI details</button><p class="muted" data-message></p></form></section><section class="card"><p class="eyebrow">TRANSPARENT PAYOUT HISTORY</p><p class="muted">Formula: finalized ad revenue − invalid-traffic reversals − taxes − direct payout fee = net distributable revenue. Creator share is 50% of that amount.</p>${ledgers.map(row=>`<article class="ledger-row"><strong>${esc(row.period_start)} to ${esc(row.period_end)}</strong><span>${money(row.creator_share_paise)} · ${esc(row.status)}</span><small>Gross ${money(row.gross_revenue_paise)} · deductions ${money(Number(row.invalid_traffic_paise)+Number(row.taxes_paise)+Number(row.direct_payout_cost_paise))}${row.payment_reference ? ` · UPI ref ${esc(row.payment_reference)}` : ''}</small></article>`).join('') || '<p class="muted">No finalized earnings yet.</p>'}</section>`);
    root.querySelector('[data-upi]')?.addEventListener('submit', async event => { event.preventDefault(); const form = new FormData(event.target); const message = event.target.querySelector('[data-message]'); try { await api('/rest/v1/creator_payout_methods', {method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({creator_id:me.id,upi_id:form.get('upi_id').trim(),account_holder_name:form.get('account_holder_name').trim()})}, token); message.textContent='UPI details saved.'; } catch(error) { message.textContent=error.message; } });
  } catch (_) {}
};
setTimeout(() => { enhanceCreatorFinance(); }, 700);
