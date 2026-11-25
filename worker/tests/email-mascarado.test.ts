import { describe, it, expect, vi, afterEach } from 'vitest';
import { processarPagamentoAprovado } from '../src/routes/checkout';
import { handleConciliacao } from '../src/cron/conciliacao';

const env: any = { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'chave', MP_ACCESS_TOKEN: 'mp' };

// Pagamento PIX real: o MP devolve o e-mail do pagador mascarado.
const pagamentoMascarado = {
  id: 190344306558,
  status: 'approved',
  external_reference: 'livre-das-dividas',
  payer: { email: 'XXXXXXXXXXX', first_name: null },
  transaction_amount: 15.35,
  payment_type_id: 'bank_transfer',
};

afterEach(() => vi.unstubAllGlobals());

function simular(handler: (url: string, method: string, body?: string) => Response | undefined) {
  const chamadas: { url: string; method: string; body?: string }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: any, init?: any) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = typeof init?.body === 'string' ? init.body : undefined;
    chamadas.push({ url, method, body });
    return handler(url, method, body) ?? new Response('[]', { status: 201 });
  }));
  return chamadas;
}

describe('e-mail mascarado pelo MP', () => {
  it('usa o e-mail do checkout (metadata) e cria o usuário com ele', async () => {
    const chamadas = simular((url, method) => {
      if (url.includes('/auth/v1/admin/users') && method === 'POST') {
        return new Response(JSON.stringify({ id: 'user-1' }), { status: 200 });
      }
      if (url.includes('/rpc/registrar_compra_mp')) {
        return new Response(JSON.stringify({ ok: true, novo: true, purchase_id: 'p1', download_token: 't' }));
      }
      return undefined;
    });

    const resp = await processarPagamentoAprovado(env, {
      ...pagamentoMascarado,
      metadata: { comprador_email: 'Camila_Dambros523@Hotmail.com' },
    }, '190344306558');

    expect(resp.status).toBe(200);
    const criacao = chamadas.find(c => c.url.includes('/auth/v1/admin/users') && c.method === 'POST');
    expect(JSON.parse(criacao!.body!).email).toBe('camila_dambros523@hotmail.com');
    expect(chamadas.some(c => c.url.includes('/rpc/registrar_compra_mp'))).toBe(true);
  });

  it('sem e-mail válido em lugar nenhum: não cria compra e responde 500 (fica visível)', async () => {
    const chamadas = simular((url, method) => {
      if (url.includes('/auth/v1/admin/users') && method === 'POST') return new Response('erro', { status: 400 });
      if (url.includes('/auth/v1/admin/users') && method === 'GET') return new Response(JSON.stringify({ users: [] }));
      return undefined;
    });

    const resp = await processarPagamentoAprovado(env, pagamentoMascarado, '190344306558');

    expect(resp.status).toBe(500);
    expect(chamadas.some(c => c.url.includes('/rpc/registrar_compra_mp'))).toBe(false);
  });
});

describe('conta criada no checkout', () => {
  it('identifica o comprador pelo id do metadata, sem criar conta pelo e-mail', async () => {
    const UID = '11111111-2222-3333-4444-555555555555';
    const chamadas = simular((url, method) => {
      if (url.includes('/rpc/registrar_compra_mp')) {
        return new Response(JSON.stringify({ ok: true, novo: true, purchase_id: 'p1', download_token: 't' }));
      }
      return undefined;
    });

    const resp = await processarPagamentoAprovado(env, {
      ...pagamentoMascarado,
      metadata: { comprador_email: 'camila_dambros523@hotmail.com', comprador_user_id: UID },
    }, '190344306558');

    expect(resp.status).toBe(200);
    expect(chamadas.some(c => c.url.includes('/auth/v1/admin/users') && c.method === 'POST')).toBe(false);
    const rpc = chamadas.find(c => c.url.includes('/rpc/registrar_compra_mp'));
    expect(JSON.parse(rpc!.body!).p_user_id).toBe(UID);
  });

  it('pagamento já vinculado não é reprocessado', async () => {
    const chamadas = simular((url) => {
      if (url.includes('/rest/v1/payments?id_externo')) return new Response(JSON.stringify([{ id: 'x' }]));
      return undefined;
    });

    const resp = await processarPagamentoAprovado(env, pagamentoMascarado, '190344306558');

    expect(resp.status).toBe(200);
    expect(chamadas.some(c => c.url.includes('/rpc/registrar_compra_mp'))).toBe(false);
  });
});

describe('conciliação: só processa pagamentos do catálogo', () => {
  it('ignora pagamento de outra vitrine e processa o nosso', async () => {
    const chamadas = simular((url, method) => {
      if (url.includes('/v1/payments/search')) {
        return new Response(JSON.stringify({ results: [
          { ...pagamentoMascarado, id: 189399449571, external_reference: 'POTS3_fb04_xyz' },
          { ...pagamentoMascarado, metadata: { comprador_email: 'a@b.com' } },
        ] }));
      }
      if (url.includes('/rest/v1/catalogo')) return new Response(JSON.stringify([{ slug: 'livre-das-dividas' }]));
      if (url.includes('/auth/v1/admin/users') && method === 'POST') return new Response(JSON.stringify({ id: 'u' }));
      if (url.includes('/rpc/registrar_compra_mp')) return new Response(JSON.stringify({ ok: true, novo: false }));
      return undefined;
    });

    await handleConciliacao({ ...env, MP_ACCESS_TOKEN: 'mp' });

    expect(chamadas.some(c => c.url.includes('189399449571') || c.body?.includes('POTS3'))).toBe(false);
    expect(chamadas.filter(c => c.url.includes('/rpc/registrar_compra_mp')).length).toBe(1);
  });
});
