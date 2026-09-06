export function normalizeKeyword(value) {
  return String(value ?? '').normalize('NFKC').trim().toLowerCase();
}
export function validatePrompt(input) {
  const keyword = normalizeKeyword(input.keyword);
  const title = String(input.title ?? '').trim();
  const body = String(input.body ?? '').trim();
  if (!/^[\p{L}\p{N}][\p{L}\p{M}\p{N}_-]{0,49}$/u.test(keyword)) throw new Error('Use a keyword of 1–50 letters or numbers. Hyphens and underscores are allowed; spaces are not.');
  if (!title || title.length > 140) throw new Error('Add a title of 1–140 characters.');
  if (!body || body.length > 20000) throw new Error('Add a prompt of 1–20,000 characters.');
  if (!['draft', 'published'].includes(input.status)) throw new Error('Choose Draft or Published.');
  return { keyword, title, body, status: input.status };
}
export function calculateEarnings({ pageViews, slots, fillRate, ecpm, creatorShare }) {
  for (const value of [pageViews, slots, fillRate, ecpm, creatorShare]) if (!Number.isFinite(value) || value < 0) throw new Error('Enter valid, non-negative numbers.');
  if (pageViews > 1e9 || slots > 4 || fillRate > 100 || creatorShare > 100 || ecpm > 1000) throw new Error('Values exceed the calculator limits.');
  const impressions = pageViews * slots * fillRate / 100;
  const revenue = impressions / 1000 * ecpm;
  return { impressions, revenue, creator: revenue * creatorShare / 100, platform: revenue * (100 - creatorShare) / 100 };
}
