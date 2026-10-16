import { createRequire } from 'node:module';
const require = createRequire('/home/user/3trevo/worker/');
const pw = require('playwright');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const raiz = '/home/user/3trevo';
const srv = http.createServer((q, r) => { const f = path.join(raiz, decodeURIComponent(q.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html' }); r.end(d); } }); }).listen(8776);
const b = await pw.chromium.launch({ args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();
await p.route('**/*', (rt) => { const u = rt.request().url(); if (u.startsWith('http://localhost:8776')) return rt.continue(); if (u.includes('workers.dev')) return rt.fulfill({ json: [] }); return rt.abort(); });
await p.goto('http://localhost:8776/', { waitUntil: 'load' }); await p.waitForTimeout(1000);
// 1) Abertura por salto: a cena deve aparecer
const ab = await p.evaluate(() => document.getElementById('abertura').getBoundingClientRect().top + scrollY);
await p.evaluate((y) => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, y + 600); }, ab);
await p.waitForTimeout(1500);
console.log('abertura (salto):', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('.ab-cena')].map((c) => ({ op: +getComputedStyle(c).opacity, vis: getComputedStyle(c).visibility })))));
// 2) Elementos focáveis sem contorno visível
await p.evaluate(() => { document.documentElement.style.scrollBehavior = ''; window.scrollTo(0, 0); });
await p.waitForTimeout(500);
const sem = new Set();
for (let i = 0; i < 260; i++) {
  await p.keyboard.press('Tab');
  const d = await p.evaluate(() => { const a = document.activeElement; if (!a || a === document.body) return null; const cs = getComputedStyle(a); return (cs.outlineStyle === 'none' || cs.outlineWidth === '0px') ? (a.tagName + ' .' + (a.className || '').toString().slice(0, 30) + ' ' + (a.innerText || a.getAttribute('aria-label') || '').slice(0, 25).replace(/\s+/g, ' ')) : null; });
  if (d) sem.add(d);
}
console.log('focáveis sem contorno:', sem.size); [...sem].slice(0, 15).forEach((s) => console.log('   ', s));
await b.close(); srv.close();
