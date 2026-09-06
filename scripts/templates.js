import fs from 'node:fs';
import path from 'node:path';
import ejs from 'ejs';
const templates = {};
function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
  const filename = path.join(dir, entry.name);
  if (entry.isDirectory()) walk(filename);
  else if (filename.endsWith('.ejs')) {
    const key = path.relative('views', filename).replaceAll('\\', '/').replace(/\.ejs$/, '');
    templates[key] = ejs.compile(fs.readFileSync(filename, 'utf8'), { client: true, compileDebug: false }).toString();
  }
} }
walk('views'); fs.mkdirSync('generated', { recursive: true });
// EJS client templates use `with`. Store their source as text so the module parser never sees it;
// Function evaluates it in its own non-strict function body at request time.
fs.writeFileSync('generated/templates.js', 'const sources = {\n' + Object.entries(templates).map(([k,v]) => JSON.stringify(k) + ':' + JSON.stringify(v)).join(',\n') + '\n};\nconst templates = Object.fromEntries(Object.entries(sources).map(([key, source]) => [key, Function("return (" + source + ")")()]));\nexport function render(name, data) { if (!templates[name]) throw new Error("Unknown template"); return templates[name](data, undefined, (part, extra = {}) => { const key = part.startsWith("partials/") ? part : (name.includes("/") ? name.slice(0,name.lastIndexOf("/")+1) : "") + part; return render(key, {...data,...extra}); }); }\n');
