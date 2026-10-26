#!/usr/bin/env node
// scripts/site-check.mjs — checagem de SEO, conversão e LGPD das páginas públicas (roda no CI).
// Uso: node scripts/site-check.mjs
//
// Vale para toda página indexável (sem "noindex" e que não seja só um redirecionamento):
//   - <title> presente e único entre todas as páginas (PT, EN e ES)
//   - meta description entre 50 e 160 caracteres
//   - og:image presente
//   - toda <img> com alt (exceto pixels 1×1 de rastreio)
//   - link para a política de privacidade
//   - JSON-LD válido (JSON que abre sem erro)
//   - Analytics e pixel só pelo js/consentimento.js (LGPD: nada carrega antes do "aceito")
//   - páginas de venda (home, catálogo, checkout, grátis, obras) sem jargão jurídico ou técnico
//     no texto: nada de "CDC", "art. 49", "Lei nº", "§", "SSL" ou "N$ 1"
// E, por página:
//   - home (PT/EN/ES): Organization e FAQPage
//   - páginas de obra: Book e BreadcrumbList
//   - sitemap.xml lista cada página indexável do site PT
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const erros = [];
const erro = (pagina, msg) => erros.push(`${pagina}: ${msg}`);

function paginas(dir = ROOT) {
  const out = [];
  for (const nome of readdirSync(dir, { withFileTypes: true })) {
    if (nome.name.startsWith('.') || ['node_modules', 'worker', 'supabase', 'scripts', 'docs', 'assets', 'amostras'].includes(nome.name)) continue;
    const p = join(dir, nome.name);
    if (nome.isDirectory()) out.push(...paginas(p));
    else if (nome.name.endsWith('.html') && !/^google[0-9a-f]+\.html$/.test(nome.name)) out.push(p);
  }
  return out;
}

const attr = (tag, nome) => (tag.match(new RegExp(`\\s${nome}="([^"]*)"`)) || [])[1];
const meta = (html, chave) => {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    if (attr(tag, 'name') === chave || attr(tag, 'property') === chave) return attr(tag, 'content') ?? '';
  }
  return null;
};

const VENDA = /^((en\/|es\/)?index|catalogo|checkout|gratis)\.html$|^obra\//;
const JARGAO = /\bCDC\b|\bart\.\s*\d|\bLei n[º°.]|§|\bSSL\b|N\$\s*\d/i;

const sitemap = existsSync(join(ROOT, 'sitemap.xml')) ? readFileSync(join(ROOT, 'sitemap.xml'), 'utf8') : '';
const titulos = new Map();

for (const arquivo of paginas()) {
  const pagina = relative(ROOT, arquivo);
  const html = readFileSync(arquivo, 'utf8');
  const head = html.split(/<\/head>/i)[0];

  // LGPD: vale para todas as páginas, indexáveis ou não.
  if (/googletagmanager\.com\/gtag\/js/.test(html)) erro(pagina, 'Google Analytics colado na página; use <script src="/js/consentimento.js"> (só carrega depois do "aceito")');
  if (/fbq\('init'|connect\.facebook\.net\/[^"']*fbevents/.test(html)) erro(pagina, 'pixel da Meta colado na página; use js/consentimento.js');
  for (const bloco of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    if (!bloco[1].trim()) continue;
    try { JSON.parse(bloco[1]); } catch (e) { erro(pagina, `JSON-LD inválido (${e.message})`); }
  }

  // Página de venda fala do livro: lei, artigo e sigla técnica ficam nos Termos e nas regras.
  if (VENDA.test(pagina)) {
    const corpo = html.replace(/<head\b[\s\S]*?<\/head>|<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ');
    const jargao = corpo.match(JARGAO);
    if (jargao) erro(pagina, `jargão jurídico ou técnico no texto da página de venda ("${jargao[0]}"); escreva como benefício ao leitor e deixe a lei para os Termos`);
  }

  const robots = meta(head, 'robots') || '';
  const redireciona = /http-equiv="refresh"/i.test(head);
  if (/noindex/i.test(robots) || redireciona) continue;

  const titulo = ((head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').trim();
  if (!titulo) erro(pagina, 'sem <title>');
  else titulos.set(titulo, [...(titulos.get(titulo) || []), pagina]);

  const desc = meta(head, 'description');
  if (desc == null) erro(pagina, 'sem meta description');
  else if (desc.length < 50 || desc.length > 160) erro(pagina, `meta description com ${desc.length} caracteres (o ideal é 50 a 160)`);

  if (!meta(head, 'og:image')) erro(pagina, 'sem og:image (imagem que aparece ao compartilhar no WhatsApp e nas redes)');

  for (const img of html.match(/<img\b[^>]*>/gi) || []) {
    const pixel = /width="1"/.test(img) && /height="1"/.test(img);
    if (!pixel && attr(img, 'alt') == null) erro(pagina, `imagem sem alt: ${img.slice(0, 80)}`);
  }

  if (!/href="[^"]*privacidade\.html"|href="[^"]*privacy-[^"]*\.html"/.test(html) && !/privacidade\.html$|privacy-[^/]*\.html$/.test(pagina)) {
    erro(pagina, 'sem link para a política de privacidade');
  }

  const tipos = new Set([...html.matchAll(/"@type"\s*:\s*"(\w+)"/g)].map((m) => m[1]));
  if (/(^|\/)index\.html$/.test(pagina) && pagina.split('/').length <= 2) {
    for (const t of ['Organization', 'FAQPage']) if (!tipos.has(t)) erro(pagina, `home sem marcação ${t}`);
  }
  if (pagina.startsWith('obra/')) {
    for (const t of ['Book', 'BreadcrumbList']) if (!tipos.has(t)) erro(pagina, `página de obra sem marcação ${t}`);
  }

  if (!/^(en|es)\//.test(pagina)) {
    const caminho = pagina === 'index.html' ? '3trevo.com.br/<' : `3trevo.com.br/${pagina}<`;
    if (!sitemap.replace(/https?:\/\/(www\.)?/g, '').includes(caminho)) erro(pagina, 'página indexável fora do sitemap.xml');
  }
}

for (const [t, ps] of titulos) if (ps.length > 1) erro(ps.join(', '), `mesmo <title> em várias páginas: "${t}"`);

if (erros.length) {
  console.error(`[site-check] ${erros.length} problema(s):`);
  for (const e of erros) console.error('  - ' + e);
  process.exit(1);
}
console.log('[site-check] ok: títulos, descrições, og:image, alt, privacidade, marcações, sitemap e consentimento.');
