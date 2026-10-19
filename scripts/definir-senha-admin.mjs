// Gera o SQL para trocar a senha do admin. Rode no SEU computador; a senha nunca é impressa nem enviada.
// Uso: node scripts/definir-senha-admin.mjs   (pede a senha oculta, minimo 12 caracteres)
// Compativel com derivarPinHash() do worker: PBKDF2-SHA256, 200000 iteracoes, 32 bytes, salt UUID.
import { pbkdf2Sync, randomUUID } from 'node:crypto';
import readline from 'node:readline';

function pedirOculto(pergunta) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (t) => { if (t.includes(pergunta)) rl.output.write(t); };
    rl.question(pergunta, (r) => { rl.close(); process.stdout.write('\n'); resolve(r); });
  });
}

const senha = await pedirOculto('Nova senha (minimo 12 caracteres): ');
const conf = await pedirOculto('Repita a senha: ');
if (senha !== conf) { console.error('As senhas nao conferem.'); process.exit(1); }
if (senha.length < 12 || senha.length > 64) { console.error('Use de 12 a 64 caracteres.'); process.exit(1); }
if (senha !== senha.trim()) { console.error('A senha nao pode comecar nem terminar com espaco (o admin.html faz trim antes de enviar).'); process.exit(1); }

const salt = randomUUID();
const hash = pbkdf2Sync(senha, salt, 200_000, 32, 'sha256').toString('hex');
console.log('\nRode no SQL Editor do Supabase (primeiro: select id from dash_usuarios;):\n');
console.log(`update dash_usuarios set pin_salt = '${salt}', pin_hash_v2 = '${hash}' where id = '<ID_DO_USUARIO>';`);
console.log('\nDepois disso o PIN antigo deixa de funcionar.');
