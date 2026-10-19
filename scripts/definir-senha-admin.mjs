#!/usr/bin/env node
// Gera o UPDATE SQL que define a senha de um usuário do admin (public.dash_usuarios).
// Formato idêntico ao Worker (worker/src/routes/admin-auth.ts → derivarPinHash):
//   PBKDF2-HMAC-SHA256, 200_000 iterações, 32 bytes, salt = string UTF-8, hash em hex.
// Não conecta a banco, não lê .env, não grava a senha em lugar nenhum.
// Uso: node scripts/definir-senha-admin.mjs

import { pbkdf2Sync, randomBytes } from 'node:crypto';

const ITERACOES = 200_000; // ponytail: manter igual ao Worker; mudar lá exige mudar aqui
const MIN = 12;
const MAX = 64;

function pedirSenhaOculta(rotulo) {
  return new Promise((resolve, reject) => {
    const { stdin, stderr } = process;
    if (!stdin.isTTY) return reject(new Error('Precisa de terminal interativo (TTY).'));
    stderr.write(rotulo);
    let senha = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const fim = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', aoDigitar);
      stderr.write('\n');
    };
    const aoDigitar = (chunk) => {
      for (const c of chunk) {
        if (c === '\r' || c === '\n') { fim(); return resolve(senha); }
        if (c === '\u0003') { fim(); return reject(new Error('Cancelado.')); } // Ctrl+C
        if (c === '\u007f' || c === '\b') senha = senha.slice(0, -1);
        else senha += c;
      }
    };
    stdin.on('data', aoDigitar);
  });
}

async function main() {
  const senha = await pedirSenhaOculta(`Nova senha (${MIN}-${MAX} caracteres): `);
  if (senha.length < MIN || senha.length > MAX) {
    throw new Error(`Senha deve ter entre ${MIN} e ${MAX} caracteres (veio ${senha.length}).`);
  }
  const confirmacao = await pedirSenhaOculta('Repita a senha: ');
  if (confirmacao !== senha) throw new Error('As senhas não conferem.');

  const salt = randomBytes(16).toString('hex'); // o Worker usa o salt como string UTF-8, não como bytes
  const hash = pbkdf2Sync(senha, salt, ITERACOES, 32, 'sha256').toString('hex');

  console.log(`-- Troque <ID_DO_USUARIO> pelo id (uuid) de public.dash_usuarios.
UPDATE public.dash_usuarios
   SET pin_salt = '${salt}',
       pin_hash_v2 = '${hash}'
 WHERE id = '<ID_DO_USUARIO>';

-- Conferência (deve mostrar 64 hex em pin_hash_v2 e 32 em pin_salt):
SELECT id, length(pin_salt) AS salt_len, length(pin_hash_v2) AS hash_len
  FROM public.dash_usuarios;`);
}

main().catch((e) => {
  console.error(`Erro: ${e.message}`);
  process.exit(1);
});
