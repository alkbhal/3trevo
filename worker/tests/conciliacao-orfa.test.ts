import { describe, it, expect, vi, afterEach } from 'vitest';
import { processarPagamentoAprovado } from '../src/routes/checkout';

const env: any = {
  SUPABASE_URL: 'https://sb.test',
  SUPABASE_SERVICE_KEY: 'chave',
  MP_ACCESS_TOKEN: 'mp',
};

const pagamento = {
  id: 190344306558,
  status: 'approved',
  external_reference: 'livre-das-dividas',
  payer: { email: 'comprador@exemplo.com', first_name: 'Camila', last_name: 'D' },
  transaction_amount: 15.35,
  payment_type_id: 'bank_transfer',
};

type Chamada = { url: string; method: string; body: string | undefined };

// Simula o Supabase: cada teste informa as respostas; rotas não informadas respondem 201 vazio.
function simularSupabase(resp: (url: string, method: string) => Response | undefined) {
  const chamadas: Chamada[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: any, init?: any) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    chamadas.push({ url, method, body: typeof init?.body === 'string' ? init.body : undefined });
    return resp(url, method) ?? new Response('[]', { status: 201 });
  }));
  return chamadas;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('processarPagamentoAprovado: comprador ausente', () => {
  it('não grava compra nem chama a RPC quando o usuário não pode ser resolvido', async () => {
    const chamadas = simularSupabase((url, method) => {
      if (url.includes('/auth/v1/admin/users') && method === 'POST') return new Response('erro', { status: 500 });
      if (url.includes('/auth/v1/admin/users') && method === 'GET') return new Response(JSON.stringify({ users: [] }));
      return undefined;
    });

    const resp = await processarPagamentoAprovado(env, pagamento, '190344306558');

    expect(resp.status).toBe(500);
    expect(chamadas.some(c => c.url.includes('/rpc/registrar_compra_mp'))).toBe(false);
    expect(chamadas.some(c => c.url.includes('/rest/v1/payments') && c.method === 'POST')).toBe(false);
  });
});

describe('processarPagamentoAprovado: compra órfã já registrada', () => {
  it('vincula o comprador, grava acesso e token e só então libera a compra', async () => {
    const chamadas = simularSupabase((url, method) => {
      if (url.includes('/auth/v1/admin/users') && method === 'POST') {
        return new Response(JSON.stringify({ id: 'user-1' }), { status: 200 });
      }
      if (url.includes('/rpc/registrar_compra_mp')) {
        return new Response(JSON.stringify({
          ok: true, novo: false, purchase_id: 'pur-1', download_token: null,
          ebook_titulo: 'Livre das Dívidas', tipo: 'ebook', cotas_base: 0,
        }));
      }
      if (url.includes('/rest/v1/purchases?id=eq.pur-1') && method === 'GET') {
        return new Response(JSON.stringify([{ id: 'pur-1', user_id: null, payment_id: 'pay-1', product_id: 'prod-1' }]));
      }
      if (url.includes('/rest/v1/downloads') && method === 'POST') {
        return new Response(JSON.stringify([{ token: 'tok-1' }]), { status: 201 });
      }
      return undefined;
    });

    const resp = await processarPagamentoAprovado(env, pagamento, '190344306558');
    expect(resp.status).toBe(200);

    const idxBiblioteca = chamadas.findIndex(c => c.url.includes('/rest/v1/user_library'));
    const idxGate = chamadas.findIndex(c => c.method === 'PATCH' && c.url.includes('/rest/v1/purchases?id=eq.pur-1'));
    expect(idxBiblioteca).toBeGreaterThan(-1);
    expect(idxGate).toBeGreaterThan(idxBiblioteca);

    const gate = chamadas[idxGate];
    expect(JSON.parse(gate.body!)).toEqual({ user_id: 'user-1' });
    expect(gate.url).toContain('user_id=is.null');
  });

  it('não repete nada quando a compra já tem dono (reenvio do MP)', async () => {
    const chamadas = simularSupabase((url, method) => {
      if (url.includes('/auth/v1/admin/users') && method === 'POST') {
        return new Response(JSON.stringify({ id: 'user-1' }), { status: 200 });
      }
      if (url.includes('/rpc/registrar_compra_mp')) {
        return new Response(JSON.stringify({
          ok: true, novo: false, purchase_id: 'pur-1', download_token: 'tok-antigo',
          ebook_titulo: 'Livre das Dívidas', tipo: 'ebook', cotas_base: 0,
        }));
      }
      if (url.includes('/rest/v1/purchases?id=eq.pur-1') && method === 'GET') {
        return new Response(JSON.stringify([{ id: 'pur-1', user_id: 'user-1', payment_id: 'pay-1', product_id: 'prod-1' }]));
      }
      return undefined;
    });

    const resp = await processarPagamentoAprovado(env, pagamento, '190344306558');
    expect(resp.status).toBe(200);
    expect(chamadas.some(c => c.url.includes('/rest/v1/user_library'))).toBe(false);
    expect(chamadas.some(c => c.url.includes('/rest/v1/downloads') && c.method === 'POST')).toBe(false);
    expect(chamadas.some(c => c.method === 'PATCH' && c.url.includes('/rest/v1/purchases'))).toBe(false);
  });
});
