import { createRequire } from 'node:module';
const require = createRequire('/home/user/3trevo/worker/');
const pw = require('playwright');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const raiz = '/home/user/3trevo';
const srv = http.createServer((q, r) => { const f = path.join(raiz, decodeURIComponent(q.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html' }); r.end(d); } }); }).listen(8775);
const b = await pw.chromium.launch({ args: ['--no-sandbox'] });
async function percorrer(passo, espera, rotulo) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  await p.route('**/*', (rt) => { const u = rt.request().url(); if (u.startsWith('http://localhost:8775')) return rt.continue(); if (u.includes('workers.dev')) return rt.fulfill({ json: [] }); return rt.abort(); });
  await p.goto('http://localhost:8775/', { waitUntil: 'load' }); await p.waitForTimeout(1000);
  await p.mouse.move(640, 400);
  const faqTop = await p.evaluate(() => document.getElementById('faq').getBoundingClientRect().top + scrollY);
  const vistos = {};
  for (let i = 0; i < 2000; i++) {
    await p.mouse.wheel(0, passo); await p.waitForTimeout(espera);
    const r = await p.evaluate(() => {
      const itens = [...document.querySelectorAll('#faq [data-ent]')].filter((e) => { const b = e.getBoundingClientRect(); return b.top > 0 && b.top < innerHeight * 0.85; });
      return itens.map((e) => ({ t: e.innerText.slice(0, 16).replace(/\s+/g, ' '), o: +getComputedStyle(e).opacity }));
    });
    for (const x of r) vistos[x.t] = Math.max(vistos[x.t] ?? 0, x.o);
    if (await p.evaluate(() => innerHeight + scrollY >= document.documentElement.scrollHeight - 2)) break;
  }
  console.log(rotulo, '| maior opacidade que cada item alcançou enquanto estava na tela:');
  for (const [t, o] of Object.entries(vistos)) console.log('   ', o.toFixed(2), t);
  await ctx.close();
}
await percorrer(40, 16, 'roda 40px/16ms');
await percorrer(120, 60, 'roda 120px/60ms');
await b.close(); srv.close();
