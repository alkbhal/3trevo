// worker/tests/guardiao-deriva.test.ts
// A cópia do núcleo do Guardião em src/guardiao/vendor é vendida (repositório
// `guardiao`) e NÃO pode ser editada aqui: editar faz este projeto divergir dos
// outros e perde a evolução comum. Este teste quebra o `npm test` se alguém
// mexer na cópia. Correção: subir a mudança para o repositório `guardiao`,
// ganhar versão e voltar por `guardiao sync worker/src/guardiao/vendor`.

import { describe, it, expect } from 'vitest';
// @ts-expect-error — .mjs vendido, sem tipos; só usamos verificarDeriva
import { verificarDeriva } from '../src/guardiao/vendor/guardiao-deriva.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const VENDOR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'guardiao', 'vendor');

describe('núcleo do Guardião vendido', () => {
  it('está idêntico à versão registrada no guardiao.lock.json (sem deriva)', () => {
    const r = verificarDeriva(VENDOR);
    expect(r.problemas).toEqual([]);
    expect(r.ok).toBe(true);
  });
});
