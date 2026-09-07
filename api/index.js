import { handleRequest } from '../lib/app.js';

export default async function handler(req, res) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }
  const method = req.method || 'GET';
  const chunks = [];
  if (!['GET', 'HEAD'].includes(method)) for await (const chunk of req) chunks.push(chunk);
  const host = req.headers.host || 'localhost';
  const request = new Request(`https://${host}${req.url}`, {
    method,
    headers,
    ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
  });
  const result = await handleRequest(request, process.env);
  res.statusCode = result.status;
  result.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await result.arrayBuffer()));
}
