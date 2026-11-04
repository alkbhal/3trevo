#!/usr/bin/env node
// scripts/capas.mjs — capa canônica nas páginas de obra.
// A fonte única da capa de cada livro é catalogo.capa_url (lida pela API pública do Worker).
// Este script grava essa mesma URL na página de obra: imagem da capa, og:image e JSON-LD (Book.image).
// Em tempo de execução, a página ainda confere a capa no catálogo e troca se ela mudou.
//
// Uso: node scripts/capas.mjs            → atualiza as páginas
//      node scripts/capas.mjs --check    → falha se alguma página estiver diferente do catálogo (CI)
//      node scripts/capas.mjs --de x.json → usa um JSON [{slug, capa_url}] em vez da API (sem rede)
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const API = 'https://tres-trevo-api.al-kbhal.workers.dev/api/public/catalogo';
const args = process.argv.slice(2);
const check = args.includes('--check');
const de = args.includes('--de') ? args[args.indexOf('--de') + 1] : null;

let rows;
try {
  rows = de ? JSON.parse(readFileSync(de, 'utf8')) : await (await fetch(API, { signal: AbortSignal.timeout(15000) })).json();
} catch (e) {
  console.warn(`[capas] catálogo indisponível (${e.message}); conferência pulada.`);
  process.exit(0);
}
const capa = Object.fromEntries((Array.isArray(rows) ? rows : []).filter((r) => r.slug && r.capa_url).map((r) => [r.slug, r.capa_url]));

const problemas = [], mudou = [], suspensos = [];
for (const nome of readdirSync(join(ROOT, 'obra'))) {
  if (!nome.endsWith('.html')) continue;
  const arq = join(ROOT, 'obra', nome), slug = nome.replace(/\.html$/, '');
  const html = readFileSync(arq, 'utf8');
  if (/http-equiv="refresh"/i.test(html)) continue; // redirecionamento
  const url = capa[slug];
  // Livro fora do catálogo público (suspenso ou inativo): não há capa a conferir; a página segue como está.
  if (!url) suspensos.push(slug);
  if (!url) { if (!/data-capa-obra/.test(html)) problemas.push(`obra/${nome}: falta a imagem da capa (img com data-capa-obra)`); continue; }
  let novo = html
    .replace(/(<meta property="og:image" content=")[^"]*(")/, `$1${url}$2`)
    .replace(/(<img [^>]*data-capa-obra[^>]*\ssrc=")[^"]*(")/, `$1${url}$2`)
    .replace(/(<img [^>]*\ssrc=")[^"]*("[^>]*data-capa-obra)/, `$1${url}$2`);
  novo = novo.replace(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema.org","@type":"Book"[\s\S]*?)<\/script>/, (m, j) => {
    const ld = JSON.parse(j); ld.image = url;
    return `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`;
  });
  if (!/data-capa-obra/.test(novo)) problemas.push(`obra/${nome}: falta a imagem da capa (img com data-capa-obra)`);
  if (novo !== html) { mudou.push(`obra/${nome}`); if (!check) writeFileSync(arq, novo); }
}
if (check && mudou.length) problemas.push(...mudou.map((p) => `${p}: capa diferente do catálogo (rode node scripts/capas.mjs)`));
if (problemas.length) { console.error('[capas] ' + problemas.join('\n  ')); process.exit(1); }
const aviso = suspensos.length ? ` Fora do catálogo público (não conferidos): ${suspensos.join(', ')}.` : '';
console.log(check ? `[capas] ok — páginas de obra com a capa do catálogo.${aviso}` : `[capas] ${mudou.length ? 'atualizadas: ' + mudou.join(', ') : 'nada a mudar'}.${aviso}`);
