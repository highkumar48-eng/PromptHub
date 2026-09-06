import { defineConfig } from 'vite';
import { sites } from '@openai/sites-vite-plugin';
import { localDatabase } from './lib/local-db.js';
export default defineConfig({
  appType: 'custom',
  plugins: [sites(), {
    name: 'prompthub-local',
    configureServer(server) {
      const DB = localDatabase(); server.httpServer?.once('close', () => DB.close());
      return () => server.middlewares.use(async (req, res, next) => {
        if (req.url.startsWith('/@') || req.url.startsWith('/node_modules')) return next();
        try {
          const chunks = []; let bytes = 0;
          for await (const chunk of req) { bytes += chunk.length; if (bytes > 1048576) { res.statusCode = 413; res.end('File too large'); return; } chunks.push(chunk); }
          const { handleRequest } = await server.ssrLoadModule('/lib/app.js');
          const headers = new Headers(); for (const [k,v] of Object.entries(req.headers)) if (v) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
          const requestPath = req.url === '/index.html' ? '/' : req.url;
          const request = new Request('http://' + req.headers.host + requestPath, { method: req.method, headers, ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) });
          const result = await handleRequest(request, { DB, LOCAL_PREVIEW: true });
          res.statusCode = result.status; result.headers.forEach((v,k) => res.setHeader(k,v)); res.end(Buffer.from(await result.arrayBuffer()));
        } catch (e) { console.error(e); res.statusCode = 500; res.end('Preview unavailable'); }
      });
    },
  }],
  server: { host: '127.0.0.1', port: 3017, strictPort: true },
  build: { ssr: 'worker.js', outDir: 'dist', rollupOptions: { output: { entryFileNames: 'server/index.js' } }, copyPublicDir: true },
});
