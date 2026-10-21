#!/usr/bin/env node
// scripts/i18n.mjs — Três sites, uma fonte: o português.
//
// As páginas da raiz (PT) são editadas normalmente. Este script gera /en/ e /es/ a partir
// delas e dos dicionários i18n/en.json e i18n/es.json, de forma que cada site saia
// INTEIRO no idioma escolhido (nada de português nos sites EN/ES, nem obra, nem rodapé).
//
// Marcação usada nas páginas PT:
//   data-i18n="chave"            → texto do elemento vem do dicionário
//   data-i18n-html="chave"       → idem, aceitando HTML (<em>, <br>, <a>)
//   data-i18n-attr="placeholder:chave;aria-label:chave2;content:chave3"
//   data-so-pt                   → elemento só existe no site PT (catálogo, sorteio, CDC…)
//   <template data-so-intl>…</template> → conteúdo só dos sites EN/ES (no PT fica inerte)
//   <script id="tt-textos"></script> → recebe window.TT_TEXTOS (chaves "js.*") do idioma
//   <nav data-tt-idiomas></nav>  → seletor de idioma com links reais para as 3 versões
//
// Uso:
//   node scripts/i18n.mjs            gera en/ e es/ e atualiza os textos JS das páginas PT
//   node scripts/i18n.mjs --check    não escreve; falha se faltar tradução, se o PT mudou
//                                    depois da tradução, se sobrar português ou se algo
//                                    estiver fora de sincronia (usado no CI)
//   node scripts/i18n.mjs --aceitar  registra o PT atual como base das traduções (rodar
//                                    depois de atualizar en.json/es.json)

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const ACEITAR = process.argv.includes('--aceitar');
const SITE = 'https://3trevo.com.br';

const ler = (p) => readFileSync(join(ROOT, p), 'utf8');
const lerJson = (p) => JSON.parse(ler(p));
const config = lerJson('i18n/paginas.json'); // (config.json é ignorado pelo .gitignore)
const PAGINAS = config.paginas;            // páginas que existem nos três idiomas
const IDIOMAS = Object.keys(config.idiomas); // ['en', 'es']
const dic = Object.fromEntries(['pt', ...IDIOMAS].map((l) => [l, lerJson(`i18n/${l}.json`)]));
const basePath = 'i18n/base-pt.json';
const base = existsSync(join(ROOT, basePath)) ? lerJson(basePath) : {};

const erros = [];
const erro = (m) => erros.push(m);

// ── Utilidades de HTML (sem dependências: marcação controlada pelo próprio projeto) ──
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

// Acha o fechamento do elemento cuja tag de abertura começa em `ini` (conta aninhamento).
function fimDoElemento(html, ini) {
  const m = /^<([a-zA-Z][\w-]*)[^>]*?(\/?)>/.exec(html.slice(ini));
  if (!m) return -1;
  const tag = m[1].toLowerCase();
  const fimAbertura = ini + m[0].length;
  if (VOID.has(tag) || m[2] === '/') return { fimAbertura, fim: fimAbertura, tag };
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  re.lastIndex = fimAbertura;
  let nivel = 1, x;
  while ((x = re.exec(html))) {
    if (tag === 'script' || tag === 'style' || tag === 'template' || tag === 'textarea') {
      if (x[1] === '/') return { fimAbertura, inicioFecho: x.index, fim: x.index + x[0].length, tag };
      continue;
    }
    nivel += x[1] === '/' ? -1 : 1;
    if (nivel === 0) return { fimAbertura, inicioFecho: x.index, fim: x.index + x[0].length, tag };
  }
  return -1;
}

// Percorre as tags de abertura que contêm `attr`, de trás para frente (índices estáveis).
function cadaElementoCom(html, attrRe, fn) {
  const re = new RegExp(`<[a-zA-Z][\\w-]*\\b[^>]*\\b${attrRe}[^>]*>`, 'g');
  const achados = [];
  let m;
  while ((m = re.exec(html))) achados.push(m.index);
  for (let i = achados.length - 1; i >= 0; i--) html = fn(html, achados[i]);
  return html;
}

const attrDe = (tagAbertura, nome) => {
  const m = new RegExp(`\\s${nome}="([^"]*)"`).exec(tagAbertura);
  return m ? m[1] : null;
};
const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const escTexto = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const semTags = (s) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

// Texto PT de cada chave encontrada na página (para detectar tradução desatualizada).
function chavesDaPagina(html, pagina) {
  const out = {};
  cadaElementoCom(html, '(?:data-i18n|data-i18n-html)="', (h, ini) => {
    const el = fimDoElemento(h, ini);
    const abertura = h.slice(ini, el.fimAbertura);
    const k = attrDe(abertura, 'data-i18n') ?? attrDe(abertura, 'data-i18n-html');
    const v = el.inicioFecho != null ? h.slice(el.fimAbertura, el.inicioFecho).replace(/\s+/g, ' ').trim() : '';
    if (out[k] != null && out[k] !== v) erro(`${pagina}: a chave "${k}" aparece com textos PT diferentes`);
    out[k] = v;
    return h;
  });
  cadaElementoCom(html, 'data-i18n-attr="', (h, ini) => {
    const abertura = h.slice(ini, h.indexOf('>', ini) + 1);
    for (const par of attrDe(abertura, 'data-i18n-attr').split(';').filter(Boolean)) {
      const [a, k] = par.split(':').map((x) => x.trim());
      out[k] = attrDe(abertura, a) ?? '';
    }
    return h;
  });
  return out;
}

function foraDeScripts(html, fn) {
  return html.split(/(<script\b[\s\S]*?<\/script>)/i).map((p, i) => (i % 2 ? p : fn(p))).join('');
}

// ── Transformação de uma página para um idioma ───────────────────────────────
function traduzir(html, pagina, lang) {
  const d = dic[lang];
  const pre = `/${config.idiomas[lang].pasta}`;

  // 1. Remove o que só existe no PT.
  html = cadaElementoCom(html, 'data-so-pt\\b', (h, ini) => {
    const el = fimDoElemento(h, ini);
    if (el === -1) { erro(`${pagina}: data-so-pt sem fechamento`); return h; }
    return h.slice(0, ini) + h.slice(el.fim);
  });
  // 2. Desembrulha o que só existe nos sites internacionais.
  html = html.replace(/<template data-so-intl>([\s\S]*?)<\/template>/g, '$1');

  // 3. Textos e atributos.
  html = cadaElementoCom(html, '(?:data-i18n|data-i18n-html)="', (h, ini) => {
    const el = fimDoElemento(h, ini);
    const abertura = h.slice(ini, el.fimAbertura);
    const kTexto = attrDe(abertura, 'data-i18n');
    const k = kTexto ?? attrDe(abertura, 'data-i18n-html');
    const v = d[k];
    if (v == null) { erro(`${lang}/${pagina}: falta a tradução de "${k}"`); return h; }
    const conteudo = kTexto != null ? escTexto(v) : v;
    return h.slice(0, el.fimAbertura) + conteudo + h.slice(el.inicioFecho);
  });
  html = cadaElementoCom(html, 'data-i18n-attr="', (h, ini) => {
    const fimAb = h.indexOf('>', ini) + 1;
    let abertura = h.slice(ini, fimAb);
    for (const par of attrDe(abertura, 'data-i18n-attr').split(';').filter(Boolean)) {
      const [a, k] = par.split(':').map((x) => x.trim());
      if (d[k] == null) { erro(`${lang}/${pagina}: falta a tradução de "${k}"`); continue; }
      abertura = abertura.replace(new RegExp(`(\\s${a}=")[^"]*(")`), `$1${escAttr(d[k])}$2`);
    }
    return h.slice(0, ini) + abertura + h.slice(fimAb);
  });

  // 4. Idioma do documento.
  html = html.replace(/<html\b[^>]*>/, `<html lang="${config.idiomas[lang].html_lang}" data-lang="${lang}">`);

  // 5. Links: páginas traduzidas apontam para a versão do idioma; páginas só-PT são erro.
  // (fora dos <script>: o JavaScript monta os próprios links com o prefixo do idioma)
  html = foraDeScripts(html, (trecho) => trecho.replace(/(\s(?:href|action)=")([^"#?]*)([^"]*)"/g, (tudo, a, url, resto) => {
    const local = url.replace(/^https?:\/\/(www\.)?3trevo\.com\.br/, '');
    if (/^(mailto:|tel:|https?:|\/\/|data:|javascript:)/.test(local) || local === '' && resto) return tudo;
    if (/^\/(en|es)(\/|$)/.test(local)) return tudo; // já localizado (seletor de idioma)
    if (/\.(css|js|png|jpe?g|webp|svg|ico|webmanifest|mp4|epub|pdf|json|xml|txt)$/i.test(local)) {
      return `${a}${local.startsWith('/') ? local : '/' + local}${resto}"`;
    }
    const pag = local === '/' || local === '' ? 'index.html' : local.replace(/^\//, '');
    if (PAGINAS.includes(pag)) return `${a}${pre}/${pag === 'index.html' ? '' : pag}${resto}"`;
    erro(`${lang}/${pagina}: link para página só em português: ${url}`);
    return tudo;
  }).replace(/(\ssrc=")(?!\/|https?:|data:)([^"]+)"/g, '$1/$2"'));
  html = html.replace(/(<meta property="og:url" content=")[^"]*"/, `$1${urlDe(pagina, lang)}"`);

  // 6. hreflang + canonical.
  html = html.replace(/\s*<link rel="(?:alternate" hreflang|canonical)[^>]*>/g, '');
  html = html.replace('</head>', `${alternates(pagina, lang)}\n</head>`);

  // 7. Seletor de idioma e textos do JavaScript.
  html = seletor(html, pagina, lang);
  html = textosJs(html, lang);
  return html;
}

function urlDe(pagina, lang) {
  const pre = lang === 'pt' ? '' : `/${config.idiomas[lang].pasta}`;
  return `${SITE}${pre}/${pagina === 'index.html' ? '' : pagina}`;
}
function alternates(pagina, lang) {
  return [
    `<link rel="canonical" href="${urlDe(pagina, lang)}">`,
    ...['pt', ...IDIOMAS].map((l) => `<link rel="alternate" hreflang="${l === 'pt' ? 'pt-BR' : l}" href="${urlDe(pagina, l)}">`),
    `<link rel="alternate" hreflang="x-default" href="${urlDe(pagina, 'pt')}">`,
  ].join('\n');
}
function seletor(html, pagina, lang) {
  return html.replace(/<(nav|div) data-tt-idiomas([^>]*)>[\s\S]*?<\/\1>/, (_, tag, attrs) => {
    const itens = ['pt', ...IDIOMAS].map((l) => {
      const href = urlDe(pagina, l).replace(SITE, '') || '/';
      const nome = dic[l]['meta.idioma.nome'];
      return `<a href="${href}" hreflang="${l === 'pt' ? 'pt-BR' : l}" lang="${l === 'pt' ? 'pt-BR' : l}"${l === lang ? ' aria-current="true" class="ativo"' : ''}>${l.toUpperCase()}<span class="tt-idiomas-nome"> · ${nome}</span></a>`;
    }).join('');
    return `<${tag} data-tt-idiomas${attrs}>${itens}</${tag}>`;
  });
}
function textosJs(html, lang) {
  const js = Object.fromEntries(Object.entries(dic[lang]).filter(([k]) => k.startsWith('js.')));
  const corpo = `window.TT_LANG=${JSON.stringify(lang)};window.TT_TEXTOS=${JSON.stringify(js)};` +
    `window.T=function(k,v){var s=window.TT_TEXTOS[k];if(s==null)return k;` +
    `return v?s.replace(/\\{(\\w+)\\}/g,function(_,n){return v[n]!=null?v[n]:''}):s};`;
  html = html.replace(/<script id="tt-textos">[\s\S]*?<\/script>/, `<script id="tt-textos">${corpo}</script>`);
  return ldFaq(html, lang);
}
// <script type="application/ld+json" id="ld-faq"></script> → FAQPage com as perguntas de "js.faq" do idioma
// (o FAQ da página é montado por JavaScript; esta marcação é o que buscadores e IAs leem sem rodar JS).
function ldFaq(html, lang) {
  const faq = dic[lang]['js.faq'];
  if (!Array.isArray(faq)) return html;
  const ld = { '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: config.idiomas[lang]?.html_lang || 'pt-BR',
    mainEntity: faq.map(({ q, r }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: r } })) };
  return html.replace(/<script type="application\/ld\+json" id="ld-faq">[\s\S]*?<\/script>/,
    `<script type="application/ld+json" id="ld-faq">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`);
}

// ── Português que escapou para EN/ES ─────────────────────────────────────────
// ã, õ e ç não existem no espanhol nem no inglês; as palavras pegam o resto.
// Só palavras que não existem em espanhol nem em inglês ("para", "obra", "compra" existem).
const PT_MARCAS = /[ãõç]|(^|[^\p{L}])(você|vocês|não|também|então|leitura|livros?|grátis|sair|minha|nossa|seu|sua|pela|clássicos?|obrigad[oa]|até|aqui|agora|ainda|quando|isso|nosso|meus?|suas?|editora)(?![\p{L}])/iu;
function vazamentos(html, onde) {
  const visivel = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<template[\s\S]*?<\/template>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const textos = [...visivel.matchAll(/>([^<]+)</g)].map((m) => m[1]);
  const attrs = [...visivel.matchAll(/\s(?:placeholder|alt|title|aria-label|content)="([^"]*)"/g)].map((m) => m[1]);
  for (const t of [...textos, ...attrs]) {
    const limpo = t.replace(/Três Trevo|Said Anes|Montauri|sac@3trevo\.com\.br|3trevo\.com\.br/g, '');
    if (PT_MARCAS.test(limpo)) erro(`${onde}: português visível: "${semTags(t).slice(0, 90)}"`);
  }
  for (const [k, v] of Object.entries(dic[onde.split('/')[0]] || {})) {
    if (k.startsWith('js.') && PT_MARCAS.test(JSON.stringify(v).replace(/Três Trevo|Said Anes/g, ''))) erro(`${onde.split('/')[0]}.json: "${k}" parece português`);
  }
}

// ── Execução ─────────────────────────────────────────────────────────────────
const baseNova = {};
let mudou = [];
for (const pagina of PAGINAS) {
  const ptOrig = ler(pagina);
  const pt = textosJs(seletor(ptOrig.replace(/\s*<link rel="(?:alternate" hreflang|canonical)[^>]*>/g, '')
    .replace('</head>', `${alternates(pagina, 'pt')}\n</head>`), pagina, 'pt'), 'pt');
  if (pt !== ptOrig) { mudou.push(pagina); if (!CHECK) writeFileSync(join(ROOT, pagina), pt); }

  const chaves = chavesDaPagina(pt, pagina);
  for (const [k, v] of Object.entries(chaves)) {
    baseNova[k] = v;
    if (!ACEITAR && base[k] != null && base[k] !== v) erro(`PT mudou depois da tradução: "${k}" (${pagina}) — atualize en.json/es.json e rode --aceitar`);
    if (!ACEITAR && base[k] == null) erro(`chave nova sem base de tradução: "${k}" (${pagina}) — traduza e rode --aceitar`);
  }

  for (const lang of IDIOMAS) {
    const saida = traduzir(pt, pagina, lang);
    vazamentos(saida, `${lang}/${pagina}`);
    const destino = join(config.idiomas[lang].pasta, pagina);
    const atual = existsSync(join(ROOT, destino)) ? ler(destino) : null;
    if (atual !== saida) {
      mudou.push(destino);
      if (!CHECK) { mkdirSync(dirname(join(ROOT, destino)), { recursive: true }); writeFileSync(join(ROOT, destino), saida); }
    }
  }
}
// Páginas só-PT que usam scripts com textos (ex.: o pop-up do beacon.js).
for (const pagina of config.so_pt_com_textos || []) {
  const orig = ler(pagina);
  if (!orig.includes('<script id="tt-textos">')) { erro(`${pagina}: falta <script id="tt-textos"></script> no <head>`); continue; }
  const novo = textosJs(orig, 'pt');
  if (novo !== orig) { mudou.push(pagina); if (!CHECK) writeFileSync(join(ROOT, pagina), novo); }
}
// Chaves de JS: todas as do PT precisam existir em EN/ES.
for (const k of Object.keys(dic.pt).filter((k) => k.startsWith('js.') || k.startsWith('meta.'))) {
  baseNova[k] = dic.pt[k];
  for (const lang of IDIOMAS) if (dic[lang][k] == null) erro(`${lang}.json: falta "${k}"`);
  if (!ACEITAR && base[k] != null && JSON.stringify(base[k]) !== JSON.stringify(dic.pt[k])) erro(`PT mudou depois da tradução: "${k}" (pt.json)`);
  if (!ACEITAR && base[k] == null) erro(`chave nova sem base de tradução: "${k}" (pt.json)`);
}

if (ACEITAR) {
  writeFileSync(join(ROOT, basePath), JSON.stringify(Object.fromEntries(Object.entries(baseNova).sort()), null, 1) + '\n');
  console.log(`[i18n] base de tradução registrada (${Object.keys(baseNova).length} chaves).`);
}
if (CHECK && mudou.length) erro(`arquivos fora de sincronia (rode node scripts/i18n.mjs): ${mudou.join(', ')}`);
if (erros.length) {
  console.error(`[i18n] ${erros.length} problema(s):\n  - ` + erros.join('\n  - '));
  process.exit(1);
}
console.log(CHECK ? '[i18n] ok — PT, EN e ES em sincronia e sem português nos sites EN/ES.'
  : `[i18n] gerado: ${mudou.length ? mudou.join(', ') : 'nada mudou'}`);
