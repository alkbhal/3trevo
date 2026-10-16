import { createRequire } from 'node:module';
const require = createRequire('/home/user/3trevo/worker/');
const pw = require('playwright');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const raiz = '/home/user/3trevo';
const srv = http.createServer((q, r) => { const f = path.join(raiz, decodeURIComponent(q.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html' }); r.end(d); } }); }).listen(8778);
const b = await pw.chromium.launch({ args: ['--no-sandbox'] });
const CAT = [{ slug: 'livre-das-dividas', titulo: 'Livre das Dívidas', autor: 'Said Anes', genero: 'Finanças', descricao: 'Plano.', preco: 19.9, cotas: 1, ativo: true }];
for (const pagina of ['checkout.html?slug=livre-das-dividas', 'area-cliente.html', 'nema.html', 'minha-biblioteca.html', 'catalogo.html']) {
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage(); const erros = [];
  p.on('pageerror', (e) => erros.push('pageerror: ' + e.message.slice(0, 120)));
  await p.route('**/*', (rt) => { const u = rt.request().url(); if (u.startsWith('http://localhost:8778')) return rt.continue(); if (u.includes('supabase-js')) return rt.fulfill({ path: '/tmp/claude-0/-home-user/0ffa8973-7b3a-5167-8af9-7300caeca452/scratchpad/libs/node_modules/@supabase/supabase-js/dist/umd/supabase.js', contentType: 'text/javascript' }); if (u.includes('workers.dev')) return rt.fulfill({ json: u.includes('catalogo') ? CAT : { ok: false, erro: 'simulado' } }); return rt.abort(); });
  await p.goto('http://localhost:8778/' + pagina, { waitUntil: 'load' }).catch(() => {}); await p.waitForTimeout(2000);
  const info = await p.evaluate(() => ({ titulo: document.title.slice(0, 60), botoes: [...document.querySelectorAll('button, a.btn, input[type=submit]')].filter((e) => getComputedStyle(e).display !== 'none').slice(0, 8).map((e) => (e.innerText || e.value || e.getAttribute('aria-label') || '').trim().slice(0, 30)), overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
  console.log(pagina, JSON.stringify(info), erros.length ? erros.slice(0, 3) : 'sem erro de página');
  await ctx.close();
}
await b.close(); srv.close();
