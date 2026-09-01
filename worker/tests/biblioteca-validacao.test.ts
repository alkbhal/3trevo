// worker/tests/biblioteca-validacao.test.ts
// Achados reais da auditoria (01/09): slot_id ia direto pra filtro PostgREST sem checar
// tipo/formato (injection), e admin acervo create/update gravava o body cru sem schema.

import { describe, it, expect } from 'vitest';
import { bibliotecaAcervoSchema, parsePositiveInt } from '../src/routes/biblioteca';

describe('parsePositiveInt (slot_id)', () => {
  it('aceita um id numérico real', () => {
    expect(parsePositiveInt(42)).toBe(42);
    expect(parsePositiveInt('42')).toBe(42);
  });

  it('rejeita valores que tentam injetar operadores PostgREST', () => {
    expect(parsePositiveInt('1&status=eq.lendo')).toBe(null);
    expect(parsePositiveInt('1 or 1=1')).toBe(null);
  });

  it('rejeita zero, negativo, vazio e não-numérico', () => {
    expect(parsePositiveInt(0)).toBe(null);
    expect(parsePositiveInt(-1)).toBe(null);
    expect(parsePositiveInt('')).toBe(null);
    expect(parsePositiveInt(undefined)).toBe(null);
  });
});

describe('bibliotecaAcervoSchema', () => {
  it('aceita um payload real de criação', () => {
    const r = bibliotecaAcervoSchema.safeParse({
      slug: 'dom-casmurro', titulo: 'Dom Casmurro', autor: 'Machado de Assis', acesso: 'bonus',
    });
    expect(r.success).toBe(true);
  });

  it('rejeita slug fora do padrão kebab-case', () => {
    const r = bibliotecaAcervoSchema.safeParse({ slug: 'Não Válido!', titulo: 'X' });
    expect(r.success).toBe(false);
  });

  it('rejeita acesso fora do enum bonus/compra', () => {
    const r = bibliotecaAcervoSchema.safeParse({ acesso: 'gratis' });
    expect(r.success).toBe(false);
  });

  it('rejeita product_id que não é uuid', () => {
    const r = bibliotecaAcervoSchema.safeParse({ product_id: 'not-a-uuid' });
    expect(r.success).toBe(false);
  });

  it('ignora campos fora do schema (só chaves declaradas passam adiante)', () => {
    const r = bibliotecaAcervoSchema.safeParse({ titulo: 'X', epub_url: 'a.epub', campo_indevido: '<script>' });
    expect(r.success).toBe(true);
    expect((r as any).data.campo_indevido).toBeUndefined();
  });
});
