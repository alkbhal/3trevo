import { createRequire } from 'node:module';
const require = createRequire('/home/user/3trevo/worker/');
const pw = require('playwright');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const raiz = '/home/user/3trevo';
const srv = http.createServer((q, r) => { const f = path.join(raiz, decodeURIComponent(q.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html' }); r.end(d); } }); }).listen(8779);
const b = await pw.chromium.launch({ args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();
await p.route('**/*', (rt) => { const u = rt.request().url(); if (u.startsWith('http://localhost:8779')) return rt.continue(); if (u.includes('workers.dev')) return rt.fulfill({ json: u.includes('catalogo') ? [{ slug: 'livre-das-dividas', titulo: 'Livre das Dívidas', autor: 'Said Anes', genero_pt: 'Manuais', descricao: 'x', preco: 19.9, cotas: 1, ativo: true }] : { ok: false } }); return rt.abort(); });
await p.goto('http://localhost:8779/catalogo.html', { waitUntil: 'load' }); await p.waitForTimeout(1500);
await p.addScriptTag({ path: '/tmp/claude-0/-home-user/0ffa8973-7b3a-5167-8af9-7300caeca452/scratchpad/libs/node_modules/axe-core/axe.min.js' });
const r = await p.evaluate(async () => { const res = await axe.run(document, { runOnly: ['color-contrast'] }); return res.violations.flatMap((v) => v.nodes.slice(0, 20).map((n) => { const d = n.any[0] && n.any[0].data || {}; return { alvo: n.target.join(' ').slice(0, 70), fg: d.fgColor, bg: d.bgColor, razao: d.contrastRatio, tamanho: d.fontSize, peso: d.fontWeight, texto: (n.html || '').replace(/\s+/g, ' ').slice(0, 80) }; })); });
const porCor = {}; for (const x of r) { const k = x.fg + ' sobre ' + x.bg + ' (' + x.razao + ':1, ' + x.tamanho + ')'; porCor[k] = (porCor[k] || 0) + 1; }
console.log(JSON.stringify(porCor, null, 1));
console.log('exemplo:', JSON.stringify(r[0]));
await b.close(); srv.close();
