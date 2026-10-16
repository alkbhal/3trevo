import { createRequire } from 'node:module';
const require = createRequire('/home/user/3trevo/worker/');
const pw = require('playwright');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const raiz = '/home/user/3trevo';
const srv = http.createServer((q, r) => { const f = path.join(raiz, decodeURIComponent(q.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html' }); r.end(d); } }); }).listen(8774);
const b = await pw.chromium.launch({ args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();
await p.route('**/*', (rt) => { const u = rt.request().url(); if (u.startsWith('http://localhost:8774')) return rt.continue(); if (u.includes('workers.dev')) return rt.fulfill({ json: [] }); return rt.abort(); });
await p.goto('http://localhost:8774/', { waitUntil: 'load' }); await p.waitForTimeout(1000);
await p.mouse.move(640,400); await p.mouse.wheel(0, 8369); await p.waitForTimeout(2500);
const ler = () => p.evaluate(() => [...document.querySelectorAll('#faq [data-ent]')].map((e) => +getComputedStyle(e).opacity).map((v) => v.toFixed(2)).join(' '));
console.log('após o salto  :', await ler());
// Rolagem contínua de 3 s, 40 px a cada 16 ms (como uma pessoa lendo)
const y0 = await p.evaluate(() => scrollY);
await p.mouse.move(640, 400); for (let i = 0; i < 190; i++) { await p.mouse.wheel(0, 40); await p.waitForTimeout(16); }
await p.waitForTimeout(1200);
console.log('após 3s de rolagem:', await ler(), '| rolou', Math.round((await p.evaluate(() => scrollY)) - y0), 'px');
await b.close(); srv.close();
