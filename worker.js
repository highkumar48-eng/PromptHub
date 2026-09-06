import { handleRequest } from './lib/app.js';
export default { fetch(request, env) { return handleRequest(request, env); } };
