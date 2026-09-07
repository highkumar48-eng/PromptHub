import { defineConfig, loadEnv } from 'vite';
import { sites } from '@openai/sites-vite-plugin';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    appType: 'custom', plugins: [sites(), { name:'prompthub-preview', configureServer(server) { return () => server.middlewares.use(async (req,res,next) => { if(req.url.startsWith('/@')||req.url.startsWith('/node_modules')) return next(); try { const { handleRequest } = await server.ssrLoadModule('/lib/app.js'); const headers=new Headers(); for(const [k,v] of Object.entries(req.headers)) if(v) headers.set(k,Array.isArray(v)?v.join(', '):v); const body=['GET','HEAD'].includes(req.method)?undefined:req; const request=new Request('http://'+req.headers.host+req.url,{method:req.method,headers,body}); const result=await handleRequest(request,{...env,LOCAL_PREVIEW:true}); res.statusCode=result.status; result.headers.forEach((v,k)=>res.setHeader(k,v)); res.end(Buffer.from(await result.arrayBuffer())); } catch(error) { console.error(error); res.statusCode=500; res.end('Preview unavailable'); } }); }}],
    server: { host: '127.0.0.1', port: 3017, strictPort: true },
    build: { ssr: 'worker.js', outDir: 'dist', rollupOptions: { output: { entryFileNames: 'server/index.js' } }, copyPublicDir: true },
    define: { __APP_ENV__: JSON.stringify(env) },
  };
});
