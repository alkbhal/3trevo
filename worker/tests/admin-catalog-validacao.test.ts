// worker/tests/admin-catalog-validacao.test.ts
// Zod em admin-catalog.ts (passo 3 "Fonte Única") — antes zero validação de
// tipo/faixa, só existência de slug/titulo. Teste do que a auditoria achou:
// preço negativo, slug fora do padrão, linha de tabela sem os campos reais.

import { describe, it, expect } from 'vitest';
import { catalogoInputSchema, tableRowSchemas } from '../src/routes/admin-catalog';

describe('catalogoInputSchema', () => {
  it('aceita um payload real de criação', () => {
    const r = catalogoInputSchema.safeParse({
      slug: 'justicamento', titulo: 'Justiça(mento) para Orelha', preco: 10, ativo: true,
    });
    expect(r.success).toBe(true);
  });

  it('rejeita preço negativo', () => {
    const r = catalogoInputSchema.safeParse({ slug: 'x', titulo: 'X', preco: -5 });
    expect(r.success).toBe(false);
  });

  it('rejeita slug fora do padrão kebab-case', () => {
    const r = catalogoInputSchema.safeParse({ slug: 'Não Válido!', titulo: 'X', preco: 10 });
    expect(r.success).toBe(false);
  });

  it('rejeita ordem não-inteira', () => {
    const r = catalogoInputSchema.safeParse({ ordem: 1.5 });
    expect(r.success).toBe(false);
  });

  it('rejeita ativo com tipo errado (string em vez de boolean)', () => {
    const r = catalogoInputSchema.safeParse({ ativo: 'sim' });
    expect(r.success).toBe(false);
  });
});

describe('tableRowSchemas (handleAdminTableInsert)', () => {
  it('leads: aceita linha real', () => {
    const r = tableRowSchemas.leads.safeParse({ email: 'a@b.com', nome: 'A', score: 5 });
    expect(r.success).toBe(true);
  });

  it('leads: rejeita email inválido', () => {
    const r = tableRowSchemas.leads.safeParse({ email: 'não-é-email' });
    expect(r.success).toBe(false);
  });

  it('campaigns: rejeita linha sem os campos not-null do schema real', () => {
    const r = tableRowSchemas.campaigns.safeParse({ name: 'Campanha X' });
    expect(r.success).toBe(false); // faltam utm_campaign e channel
  });

  it('email_templates: rejeita id não-numérico', () => {
    const r = tableRowSchemas.email_templates.safeParse({ id: 'zero', tag: 't', subject: 's', html: '<p></p>' });
    expect(r.success).toBe(false);
  });
});
