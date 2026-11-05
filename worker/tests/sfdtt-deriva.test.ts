// O motor em js/sfdtt/ é cópia do repositório SFDTT (fonte canônica) e NÃO pode ser editado
// aqui. Este teste quebra se alguém mexer na cópia. Correção: mudar no SFDTT e rodar
// `node scripts/sfdtt-sync.mjs <clone SFDTT> origin/v8`.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'js', 'sfdtt');
const lock = JSON.parse(readFileSync(join(DIR, 'sfdtt.lock.json'), 'utf8'));

describe('motor SFDTT vendido', () => {
  it('veio de um commit registrado', () => {
    expect(lock.origem).toBe('alkbhal/SFDTT');
    expect(lock.commit).toMatch(/^[0-9a-f]{40}$/);
  });
  for (const [arq, info] of Object.entries<any>(lock.arquivos)) {
    it(`${arq} está idêntico ao SFDTT (sem deriva)`, () => {
      const h = createHash('sha256').update(readFileSync(join(DIR, arq))).digest('hex');
      expect(h).toBe(info.sha256);
    });
  }
});
