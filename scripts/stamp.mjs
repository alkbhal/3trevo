#!/usr/bin/env node
// scripts/stamp.mjs — Passo 4/9 "Fonte Única": versionamento por hash de conteúdo
// pros <script src> / <link href> locais (js/css). Resolve o achado real já vivido
// no projeto (GitHub Pages/CDN atrasa propagação de deploy, confirmado em sessões
// anteriores via raw.githubusercontent.com) sem depender de cache-busting manual
// por query string chutada à mão. Idempotente: hash vem do conteúdo do arquivo, não
// da hora — rodar 2x sem mudar nada produz o mesmo resultado (CI usa isso pra travar
// esquecimento: se `git diff` mostrar algo depois de rodar, alguém commitou sem stamp).
//
// Uso: node scripts/stamp.mjs [--check]
//   --check   não escreve nada, só falha (exit 1) se algum arquivo precisar de stamp.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set([
  '.git', '.github', '.claude', '.claude-flow', '.gstack', '.swarm', '.wrangler',
  '.entrega-temp', 'node_modules', 'worker', 'assets',
]);
const CHECK_ONLY = process.argv.includes('--check');

// Só interessa src/href local a .js/.css, dentro de <script>/<link> — nunca CDN externo.
const TAG_ATTR_RE = /(<(?:script|link)\b[^>]*\b(?:src|href)=")([^"?]+\.(?:js|css))(\?[^"]*)?(")/gi;

function listHtmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.')) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      out.push(...listHtmlFiles(full));
    } else if (entry.endsWith('.html')) {
      out.push(full);
    }
  }
  return out;
}

function hashOf(localPath) {
  // localPath vem do HTML: "/js/x.js" ou "js/x.js" — sempre relativo à raiz do repo,
  // nunca ao arquivo HTML (é assim que o site já referencia hoje, confirmado por grep).
  const fsPath = join(ROOT, localPath.replace(/^\//, ''));
  let content;
  try {
    content = readFileSync(fsPath);
  } catch {
    return null; // asset não existe localmente (ex.: caminho dinâmico) — não mexe
  }
  return createHash('sha256').update(content).digest('hex').slice(0, 8);
}

let dirty = false;
const alterados = [];

for (const file of listHtmlFiles(ROOT)) {
  const original = readFileSync(file, 'utf8');
  const stamped = original.replace(TAG_ATTR_RE, (full, pre, path, _query, post) => {
    const hash = hashOf(path);
    if (!hash) return full;
    return `${pre}${path}?v=${hash}${post}`;
  });
  if (stamped !== original) {
    dirty = true;
    alterados.push(file.slice(ROOT.length + 1));
    if (!CHECK_ONLY) writeFileSync(file, stamped, 'utf8');
  }
}

if (alterados.length) {
  console.log(`${CHECK_ONLY ? '[check] precisam de stamp' : '[stamp] atualizados'}:`);
  for (const f of alterados) console.log(`  - ${f}`);
} else {
  console.log('[stamp] nada pra atualizar — todos os hashes já batem com o conteúdo real.');
}

if (CHECK_ONLY && dirty) {
  console.error('\n[stamp] rode `node scripts/stamp.mjs` e commite o resultado antes do merge.');
  process.exit(1);
}
