import { createRequire } from 'node:module';
const require = createRequire('/home/user/3trevo/worker/');
const pw = require('playwright');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const raiz = '/home/user/3trevo';
const srv = http.createServer((q, r) => { const f = path.join(raiz, decodeURIComponent(q.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.mp4') ? 'video/mp4' : 'text/html' }); r.end(d); } }); }).listen(8780);
const b = await pw.chromium.launch({ args: ['--no-sandbox'] });
for (const reduzir of [false, true]) {
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, reducedMotion: reduzir ? 'reduce' : 'no-preference' });
  const p = await ctx.newPage(); const reqs = [];
  p.on('request', (r) => { if (r.url().includes('hero-reel')) reqs.push('pedido do vídeo'); });
  await p.route('**/*', (rt) => { const u = rt.request().url(); if (u.startsWith('http://localhost:8780')) return rt.continue(); if (u.includes('workers.dev')) return rt.fulfill({ json: [] }); return rt.abort(); });
  await p.goto('http://localhost:8780/', { waitUntil: 'load' }); await p.waitForTimeout(3000);
  const info = await p.evaluate(() => { const v = document.getElementById('hero-video'); return { podeH264: v.canPlayType('video/mp4; codecs="avc1.42E01E"'), pausado: v.paused, tempo: v.currentTime.toFixed(2), prontidao: v.readyState, temControlePausa: !!document.querySelector('.hero-video-bg button, [aria-label*="pausa" i], [aria-label*="pause" i]') }; });
  console.log(reduzir ? 'reduzir movimento' : 'padrão', JSON.stringify({ ...info, pedidos: reqs.length }));
  await ctx.close();
}
await b.close(); srv.close();
