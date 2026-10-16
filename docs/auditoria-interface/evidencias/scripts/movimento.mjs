import { createRequire } from 'node:module';
const require = createRequire('/home/user/3trevo/worker/');
const pw = require('playwright');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const raiz = '/home/user/3trevo';
const srv = http.createServer((q, r) => { const f = path.join(raiz, decodeURIComponent(q.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html' }); r.end(d); } }); }).listen(8777);
const b = await pw.chromium.launch({ args: ['--no-sandbox'] });
const out = { padrao: [], reduzido: [] };
for (const modo of ['padrao', 'reduzido', 'padrao', 'reduzido', 'padrao', 'reduzido']) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: modo === 'reduzido' ? 'reduce' : 'no-preference' });
  const p = await ctx.newPage();
  await p.route('**/*', (rt) => { const u = rt.request().url(); if (u.startsWith('http://localhost:8777')) return rt.continue(); if (u.includes('workers.dev')) return rt.fulfill({ json: [] }); return rt.abort(); });
  await p.goto('http://localhost:8777/', { waitUntil: 'load' }); await p.waitForTimeout(1200);
  const s = await p.context().newCDPSession(p); await s.send('Performance.enable');
  const m = async () => Object.fromEntries((await s.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
  const a = await m();
  await p.evaluate(() => { window.__t = []; let u = performance.now(); (function f(t) { window.__t.push(t - u); u = t; if (window.__t.length < 900) requestAnimationFrame(f); })(performance.now()); });
  const total = await p.evaluate(() => document.documentElement.scrollHeight);
  await p.mouse.move(640, 400);
  for (let y = 0; y < total; y += 120) { await p.mouse.wheel(0, 120); await p.waitForTimeout(30); }
  await p.waitForTimeout(1000);
  const z = await m();
  const t = (await p.evaluate(() => window.__t)).slice(5);
  const srt = [...t].sort((x, y) => x - y);
  out[modo].push({ quadros: t.length, p50: +srt[Math.floor(srt.length * .5)].toFixed(1), p95: +srt[Math.floor(srt.length * .95)].toFixed(1), acimaDe20ms: t.filter((x) => x > 20).length, recalcStyle: z.RecalcStyleCount - a.RecalcStyleCount, layout: z.LayoutCount - a.LayoutCount, scriptMs: +((z.ScriptDuration - a.ScriptDuration) * 1000).toFixed(0) });
  await s.detach(); await ctx.close();
}
for (const k of ['padrao', 'reduzido']) console.log(k, JSON.stringify(out[k]));
await b.close(); srv.close();
