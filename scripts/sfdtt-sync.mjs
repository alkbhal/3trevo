#!/usr/bin/env node
// scripts/sfdtt-sync.mjs — traz o motor do SFDTT (fonte canônica: repositório alkbhal/SFDTT)
// para js/sfdtt/ SEM editar nada, e grava js/sfdtt/sfdtt.lock.json (commit + sha256 de cada
// arquivo). Correção no motor se faz no repositório SFDTT; aqui só se sincroniza.
// Uso: node scripts/sfdtt-sync.mjs <caminho do clone SFDTT> [ref=origin/v8]
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEST = join(ROOT, 'js', 'sfdtt');
// origem no SFDTT → destino relativo em js/sfdtt (mantém os imports relativos intactos)
export const ARQUIVOS = {
  'src/utils/index.js': 'utils/index.js',
  'src/constants.js': 'constants.js',
  'src/engine/index.js': 'engine/index.js',
  'src/engine/fiscal.js': 'engine/fiscal.js',
  'src/engine/grupos.js': 'engine/grupos.js',
  'src/engine/decisao.js': 'engine/decisao.js',
};

const [repo, ref = 'origin/v8'] = process.argv.slice(2);
if (!repo) { console.error('uso: node scripts/sfdtt-sync.mjs <clone SFDTT> [ref]'); process.exit(1); }
const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', maxBuffer: 1 << 26 });
const commit = git('rev-parse', ref).trim();
const lock = { origem: 'alkbhal/SFDTT', ref, commit, sincronizado: new Date().toISOString().slice(0, 10), arquivos: {} };
for (const [src, dst] of Object.entries(ARQUIVOS)) {
  const conteudo = git('show', `${commit}:${src}`);
  mkdirSync(dirname(join(DEST, dst)), { recursive: true });
  writeFileSync(join(DEST, dst), conteudo);
  lock.arquivos[dst] = { origem: src, sha256: createHash('sha256').update(conteudo).digest('hex') };
}
writeFileSync(join(DEST, 'sfdtt.lock.json'), JSON.stringify(lock, null, 2) + '\n');
console.log(`[sfdtt-sync] ${Object.keys(ARQUIVOS).length} arquivos de ${ref} (${commit.slice(0, 7)}) → js/sfdtt/`);
