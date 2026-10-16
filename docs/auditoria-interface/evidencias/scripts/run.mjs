// Auditoria de front-end (lab local). Uso: node run.mjs <raiz-do-site> <pasta-saida>
// Limitações (registradas no relatório): CDNs externos bloqueados (fontes, gtag, supabase),
// API do worker simulada com catálogo fixo, sem rede real nem dispositivo físico.
import { createRequire } from 'node:module';
const require = createRequire('/home/user/3trevo/worker/');
const pw = require('playwright');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');

const [raiz, saida] = process.argv.slice(2);
const aqui = path.dirname(new URL(import.meta.url).pathname);
const LIBS = path.join(aqui, '..', 'libs', 'node_modules');
fs.mkdirSync(saida, { recursive: true });
const tipos = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };

const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  const f = path.join(raiz, u === '/' ? 'index.html' : u);
  if (!f.startsWith(raiz)) { r.writeHead(403); r.end(); return; }
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': tipos[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
}).listen(8770);
const BASE = 'http://localhost:8770';

const CATALOGO = [
  { slug: 'livre-das-dividas', titulo: 'Livre das Dívidas', titulo_en: 'Debt Free', autor: 'Said Anes', genero_pt: 'Finanças', descricao: 'Plano prático para sair das dívidas.', preco: 19.9, cotas: 1, capa_url: null, ordem: 1, ativo: true, idioma: 'pt-BR' },
  { slug: 'antifalencia', titulo: 'O Guia Antifalência do Empreendedor Iniciante', autor: 'Said Anes', genero_pt: 'Manuais', descricao: 'O que ninguém conta antes de abrir um negócio.', preco: 37, cotas: 10, capa_url: null, ordem: 2, ativo: true, idioma: 'pt-BR' },
  { slug: 'justicamento', titulo: 'Justiça(mento) para Orelha', autor: 'Said Anes', genero_pt: 'Ensaio', descricao: 'Ensaio.', preco: 29.9, cotas: 3, capa_url: null, ordem: 3, ativo: true, idioma: 'pt-BR' },
];

const resultados = {};
const erros = [];

async function nova(browser, { largura = 1280, altura = 800, reduzir = false, toque = false } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: largura, height: altura }, deviceScaleFactor: 1,
    isMobile: toque, hasTouch: toque, reducedMotion: reduzir ? 'reduce' : 'no-preference',
  });
  const p = await ctx.newPage();
  p.__erros = [];
  p.on('pageerror', (e) => p.__erros.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') p.__erros.push('console: ' + m.text().slice(0, 160)); });
  await p.route('**/*', (rt) => {
    const u = rt.request().url();
    if (u.startsWith(BASE)) {
      if (u.includes('/js/') && u.includes('supabase')) return rt.fulfill({ path: path.join(LIBS, 'axe-core/axe.min.js'), contentType: 'text/javascript' });
      return rt.continue();
    }
    if (u.includes('tres-trevo-api.al-kbhal.workers.dev')) {
      if (u.includes('/api/public/catalogo')) return rt.fulfill({ json: CATALOGO });
      return rt.fulfill({ json: { ok: false } });
    }
    return rt.abort(); // fontes, gtag, facebook, CDNs: bloqueados no lab
  });
  return { ctx, p };
}

async function cdp(p) {
  const s = await p.context().newCDPSession(p);
  await s.send('Performance.enable');
  return s;
}
async function metricas(s) {
  const { metrics } = await s.send('Performance.getMetrics');
  const m = {}; for (const x of metrics) m[x.name] = x.value; return m;
}

const browser = await pw.chromium.launch({ args: ['--no-sandbox'] });

// ── 1. Carregamento e erros (computador e celular) ─────────────────────────────
for (const [nome, opt] of [['desktop', { largura: 1280, altura: 800 }], ['celular', { largura: 375, altura: 812, toque: true }]]) {
  const { ctx, p } = await nova(browser, opt);
  const t0 = Date.now();
  await p.goto(BASE + '/index.html', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(2500);
  const info = await p.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth,
    cardsCatalogo: document.querySelectorAll('#prod-grid .pcard').length,
    grid: (document.getElementById('prod-grid') || {}).innerText?.slice(0, 80),
    dataEnt: document.querySelectorAll('[data-ent]').length,
    willChange: [...document.querySelectorAll('*')].filter((e) => getComputedStyle(e).willChange !== 'auto').length,
    imgsSemLazy: [...document.images].filter((i) => i.loading !== 'lazy').length,
    imgs: document.images.length,
  }));
  resultados['index_' + nome] = { ...info, tempoCarregamentoMs: Date.now() - t0, erros: p.__erros.slice(0, 10) };
  await ctx.close();
}

// ── 2. Acessibilidade automática (axe-core) em index e catálogo ───────────────
for (const pagina of ['index.html', 'catalogo.html', 'nema.html']) {
  const { ctx, p } = await nova(browser, { largura: 1280, altura: 800 });
  await p.goto(BASE + '/' + pagina, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(2000);
  await p.addScriptTag({ path: path.join(LIBS, 'axe-core/axe.min.js') });
  const r = await p.evaluate(async () => {
    const res = await window.axe.run(document, { resultTypes: ['violations'] });
    return res.violations.map((v) => ({ id: v.id, impacto: v.impact, n: v.nodes.length, exemplo: (v.nodes[0] && v.nodes[0].target.join(' ')) || '' }));
  });
  resultados['axe_' + pagina] = r;
  await ctx.close();
}

// ── 3. Movimento: rolagem com e sem "reduzir movimento" (CDP) ─────────────────
for (const reduzir of [false, true]) {
  const { ctx, p } = await nova(browser, { largura: 1280, altura: 800, reduzir });
  await p.goto(BASE + '/index.html', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const s = await cdp(p);
  const antes = await metricas(s);
  const quadros = [];
  await p.evaluate(() => {
    window.__q = []; let ult = performance.now();
    (function loop(t) { window.__q.push(t - ult); ult = t; if (window.__q.length < 600) requestAnimationFrame(loop); })(performance.now());
  });
  const total = await p.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < total; y += 400) {
    await p.mouse.wheel(0, 400);
    await p.waitForTimeout(40);
  }
  await p.waitForTimeout(1200);
  const depois = await metricas(s);
  const intervalos = await p.evaluate(() => window.__q.slice(5));
  const ordenados = [...intervalos].sort((a, b) => a - b);
  const pct = (q) => ordenados.length ? Math.round(ordenados[Math.floor(q * (ordenados.length - 1))] * 10) / 10 : null;
  const deltas = {};
  for (const k of ['RecalcStyleCount', 'LayoutCount', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'TaskDuration']) {
    deltas[k] = Math.round(((depois[k] ?? 0) - (antes[k] ?? 0)) * 1000) / 1000;
  }
  const estado = await p.evaluate(() => {
    const ent = [...document.querySelectorAll('[data-ent]')];
    return {
      entOn: document.documentElement.classList.contains('ent-on'),
      entVisiveis: ent.filter((e) => getComputedStyle(e).opacity !== '0').length,
      entTotal: ent.length,
      entOpacidadeMin: Math.min(...ent.map((e) => parseFloat(getComputedStyle(e).opacity))),
      nemaK: [...document.querySelectorAll('#nema [data-k]')].map((e) => getComputedStyle(e).opacity),
    };
  });
  resultados['movimento_' + (reduzir ? 'reduzido' : 'padrao')] = { deltas, quadroMs: { p50: pct(0.5), p95: pct(0.95), max: pct(1), quadros: ordenados.length }, estado, errosNoLab: p.__erros.length };
  await s.detach();
  await ctx.close();
}

// ── 4. Teclado: ordem de foco, alcance dos cards e indicador de foco ──────────
{
  const { ctx, p } = await nova(browser, { largura: 1280, altura: 800 });
  await p.goto(BASE + '/index.html', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const seq = [];
  for (let i = 0; i < 260; i++) {
    await p.keyboard.press('Tab');
    const d = await p.evaluate(() => {
      const a = document.activeElement; if (!a || a === document.body) return null;
      const cs = getComputedStyle(a);
      return { tag: a.tagName, texto: (a.innerText || a.getAttribute('aria-label') || '').slice(0, 40).replace(/\s+/g, ' '), cls: a.className && a.className.toString().slice(0, 40), outline: cs.outlineStyle + ' ' + cs.outlineWidth, cardBtnAdq: !!a.closest('.pcard') && a.classList.contains('btn-adq') };
    });
    if (d) seq.push(d);
  }
  const cardsAlcancados = seq.filter((x) => x.cardBtnAdq).length;
  const semIndicador = seq.filter((x) => x.outline.startsWith('none') || x.outline.startsWith('auto 0')).length;
  resultados.teclado_index = { passos: seq.length, alcancaLinkAdquirir: cardsAlcancados, focosSemContornoVisivel: semIndicador, amostra: seq.slice(0, 6), total: seq.length };
  await ctx.close();
}

// ── 5. Alvos de toque (menor que 44 px no celular) ────────────────────────────
for (const pagina of ['index.html', 'catalogo.html']) {
  const { ctx, p } = await nova(browser, { largura: 375, altura: 812, toque: true });
  await p.goto(BASE + '/' + pagina, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const r = await p.evaluate(() => {
    const els = [...document.querySelectorAll('a, button, input, select, [role=button]')].filter((e) => {
      const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.top < innerHeight;
    });
    const pequenos = els.filter((e) => { const b = e.getBoundingClientRect(); return b.width < 44 || b.height < 44; });
    return { visiveisNaTela: els.length, abaixo44px: pequenos.length, exemplos: pequenos.slice(0, 6).map((e) => ({ tag: e.tagName, texto: (e.innerText || e.getAttribute('aria-label') || '').slice(0, 30).replace(/\s+/g, ' '), w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height) })) };
  });
  resultados['toque_' + pagina] = r;
  await ctx.close();
}

// ── 6. Menu mobile do catálogo: estado ARIA e tecla Escape ────────────────────
{
  const { ctx, p } = await nova(browser, { largura: 375, altura: 812, toque: true });
  await p.goto(BASE + '/catalogo.html', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(1200);
  const antes = await p.evaluate(() => document.getElementById('menuBtn') && document.getElementById('menuBtn').getAttribute('aria-expanded'));
  await p.click('#menuBtn').catch((e) => resultados.menu_erro = e.message.slice(0, 120));
  await p.waitForTimeout(400);
  const depoisClique = await p.evaluate(() => document.getElementById('menuBtn').getAttribute('aria-expanded'));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  const depoisEsc = await p.evaluate(() => document.getElementById('menuBtn').getAttribute('aria-expanded'));
  resultados.menu_catalogo = { ariaExpandedInicial: antes, ariaExpandedAposClique: depoisClique, ariaExpandedAposEscape: depoisEsc };
  await ctx.close();
}

// ── 7. Botão "Menu" da página inicial: o que faz de fato ─────────────────────
{
  const { ctx, p } = await nova(browser, { largura: 375, altura: 812, toque: true });
  await p.goto(BASE + '/index.html', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(1200);
  const y0 = await p.evaluate(() => scrollY);
  await p.click('.menu-mob').catch((e) => resultados.menu_mob_erro = e.message.slice(0, 120));
  await p.waitForTimeout(1200);
  const r = await p.evaluate(() => ({ ariaExpanded: document.querySelector('.menu-mob').getAttribute('aria-expanded'), scrollAntes: null }));
  resultados.menu_mob_index = { ...r, scrollDepois: await p.evaluate(() => Math.round(scrollY)), scrollAntes: Math.round(y0), temMenuAberto: await p.evaluate(() => !!document.querySelector('[role=dialog], .mobile-nav.open, .menu-aberto')) };
  await ctx.close();
}

// ── 8. Catálogo sem resposta da API: estado de falha e nova tentativa ────────
{
  const { ctx, p } = await nova(browser, { largura: 1280, altura: 800 });
  await p.route('**/api/public/catalogo**', (rt) => rt.abort());
  await p.goto(BASE + '/index.html', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(9000);
  resultados.falha_catalogo_index = await p.evaluate(() => ({
    texto: (document.getElementById('prod-grid') || {}).innerText?.slice(0, 120),
    botaoTentar: !!document.querySelector('#prod-grid button'),
  }));
  await ctx.close();
}

// ── 9. Cards: clique no card abre o checkout? (faz o caminho do mouse) ─────────
{
  const { ctx, p } = await nova(browser, { largura: 1280, altura: 800 });
  await p.goto(BASE + '/index.html', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const card = p.locator('#prod-grid .pcard').first();
  await card.scrollIntoViewIfNeeded().catch(() => {});
  await card.click({ position: { x: 20, y: 20 } }).catch(() => {});
  await p.waitForTimeout(800);
  resultados.clique_card = { url: p.url().replace(BASE, '') };
  await ctx.close();
}

await browser.close();
srv.close();
fs.writeFileSync(path.join(saida, 'resultados.json'), JSON.stringify(resultados, null, 2));
console.log(JSON.stringify(resultados, null, 2).slice(0, 6000));
