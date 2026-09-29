#!/usr/bin/env node
// Detector de deriva do Guardião — SEM dependência. Uma cópia deste arquivo é
// vendida em cada projeto junto do núcleo (`guardiao sync`), para o CI rodar
//   node <pasta-do-guardiao>/guardiao-deriva.mjs
// e falhar (exit 1) se alguém editou a cópia local do núcleo em vez da origem.
// Editar a cópia faz o projeto divergir dos outros e perde a evolução comum:
// a mudança tem que subir para o repositório `guardiao`, ganhar versão e voltar
// por `guardiao sync`.
//
// O hash ignora CRLF/LF: checkout com core.autocrlf=true no Windows reescreve
// os fins de linha e gerava "editado" falso (mesma armadilha do autoteste do
// Guardião do Amigo Entregador).
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const normalizar = txt => txt.replace(/\r\n/g, '\n');
export const hashDe = txt => createHash('sha256').update(normalizar(txt)).digest('hex');

export function verificarDeriva(dir) {
  const lockPath = join(dir, 'guardiao.lock.json');
  if (!existsSync(lockPath)) return { ok: false, versao: null, problemas: ['guardiao.lock.json ausente — rode `guardiao sync`'] };
  let lock;
  try { lock = JSON.parse(readFileSync(lockPath, 'utf8')); } catch { return { ok: false, versao: null, problemas: ['guardiao.lock.json ilegível'] }; }
  const problemas = [];
  for (const [nome, esperado] of Object.entries(lock.arquivos || {})) {
    const p = join(dir, nome);
    if (!existsSync(p)) { problemas.push(`${nome}: ausente`); continue; }
    const real = hashDe(readFileSync(p, 'utf8'));
    if (real !== esperado) problemas.push(`${nome}: editado localmente (esperado ${esperado.slice(0, 12)}…, real ${real.slice(0, 12)}…)`);
  }
  return { ok: !problemas.length, versao: lock.versao, problemas };
}

const principal = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (principal) {
  const dir = process.argv[2] ? resolve(process.argv[2]) : dirname(fileURLToPath(import.meta.url));
  const r = verificarDeriva(dir);
  if (r.ok) {
    console.log(`🟢 Guardião ${r.versao}: cópia idêntica à origem.`);
  } else {
    console.error('🔴 Deriva do Guardião — a cópia local não bate com a versão registrada:');
    r.problemas.forEach(p => console.error('  • ' + p));
    console.error('Correção: leve a mudança para o repositório `guardiao` (nova versão) e rode `guardiao sync`; ou reverta a edição local.');
    process.exit(1);
  }
}
