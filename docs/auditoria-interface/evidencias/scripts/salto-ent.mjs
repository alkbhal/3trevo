import { createRequire } from 'node:module';
const require = createRequire('/home/user/3trevo/worker/');
const pw = require('playwright');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const raiz = '/home/user/3trevo';
const srv = http.createServer((q, r) => { const f = path.join(raiz, decodeURIComponent(q.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html' }); r.end(d); } }); }).listen(8773);
const b = await pw.chromium.launch({ args: ['--no-sandbox'] });
const ler = (p) => p.evaluate(() => ({ y: Math.round(scrollY), faqOpac: [...document.querySelectorAll('#faq [data-ent]')].map((e) => getComputedStyle(e).opacity).join(' ') }));
for (const [nome, acao] of [
  ['link #faq (ancora)', async (p) => { await p.evaluate(() => { location.hash = '#faq'; }); }],
  ['scrollTo direto', async (p) => { await p.evaluate(() => window.scrollTo(0, document.getElementById('faq').offsetTop)); }],
]) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  await p.route('**/*', (rt) => { const u = rt.request().url(); if (u.startsWith('http://localhost:8773')) return rt.continue(); if (u.includes('workers.dev')) return rt.fulfill({ json: [] }); return rt.abort(); });
  await p.goto('http://localhost:8773/', { waitUntil: 'load' }); await p.waitForTimeout(1000);
  await acao(p); await p.waitForTimeout(2000);
  const a = await ler(p);
  await p.mouse.move(640, 400); await p.mouse.wheel(0, 30); await p.waitForTimeout(800);
  const c = await ler(p);
  console.log(nome, '| após 2s:', JSON.stringify(a), '| após 1 rolagem pequena:', JSON.stringify(c));
  await ctx.close();
}
await b.close(); srv.close();
