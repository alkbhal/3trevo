// worker/tests/sorteio-index.test.ts
// Motor de sorteio commit-reveal ("Semente TT") — teste da única peça
// determinística e sem I/O do motor: seedFinal + tamanho da cartela → índice.
// Vetor de teste travado no arquivo: pega regressão de algoritmo se a fórmula
// mudar sem querer (mesma fórmula do DOTIS: sha256(seed:n) mod n).

import { describe, it, expect } from 'vitest';
import { calcularIndiceVencedor } from '../src/routes/sorteio';

describe('calcularIndiceVencedor', () => {
  it('é determinístico — mesma entrada produz sempre o mesmo índice', async () => {
    const a = await calcularIndiceVencedor('seed-fixo-de-teste', 1000);
    const b = await calcularIndiceVencedor('seed-fixo-de-teste', 1000);
    expect(a).toBe(b);
  });

  it('respeita o vetor de teste travado (regressão de algoritmo)', async () => {
    // Se este teste falhar depois de uma mudança de código, o algoritmo
    // mudou — confirmar que é intencional antes de atualizar o valor.
    const idx = await calcularIndiceVencedor('seed-fixo-de-teste', 1000);
    expect(idx).toBe(await sha256ModN('seed-fixo-de-teste:1000', 1000));
  });

  it('caso de borda — cartela com 1 único número sempre resolve pro índice 0', async () => {
    const idx = await calcularIndiceVencedor('qualquer-seed', 1);
    expect(idx).toBe(0);
  });

  it('sempre devolve um índice dentro do tamanho da cartela', async () => {
    for (const seed of ['a', 'b', 'c', 'seed-longo-'.repeat(10)]) {
      const idx = await calcularIndiceVencedor(seed, 37);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(37);
    }
  });

  it('não é degenerado — seeds diferentes tendem a produzir índices diferentes', async () => {
    const indices = new Set<number>();
    for (let i = 0; i < 20; i++) {
      indices.add(await calcularIndiceVencedor(`seed-${i}`, 100000));
    }
    // 20 seeds distintos num espaço de 100k — não deveriam colidir todos no mesmo índice.
    expect(indices.size).toBeGreaterThan(1);
  });

  it('rejeita tamanho de cartela <= 0', async () => {
    await expect(calcularIndiceVencedor('seed', 0)).rejects.toThrow();
    await expect(calcularIndiceVencedor('seed', -1)).rejects.toThrow();
  });
});

// Reimplementação independente da fórmula, só pra este teste de regressão
// (não importa de src/ — se copiasse o bug do código, o teste nunca pegaria).
async function sha256ModN(input: string, n: number): Promise<number> {
  const buf = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input)));
  let big = 0n;
  for (let i = 0; i < 8; i++) big = (big << 8n) | BigInt(buf[i]);
  return Number(big % BigInt(n));
}
