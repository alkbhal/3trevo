// worker/tests/nema.test.ts
// Nema fase 0: desconto no checkout, crédito na compra aprovada e o sorteio parado.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { extrairBearer, reservaDoMetadata, handleNemaSaldo } from '../src/routes/nema';
import { handleCriarPreferencia, handleWebhookPagamento } from '../src/routes/checkout';

const env: any = {
  SUPABASE_URL: 'https://sb.test',
  SUPABASE_SERVICE_KEY: 'service-key',
  MP_ACCESS_TOKEN: 'APP_USR-test',
  WEBHOOK_HMAC_SECRET: 'segredo',
};
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.usuario.assinatura';
const REF = '11111111-2222-3333-4444-555555555555';
const PURCHASE = '99999999-8888-7777-6666-555555555555';

type Chamada = { url: string; init?: RequestInit };

function mockFetch(responder: (url: string, init?: RequestInit) => unknown) {
  const chamadas: Chamada[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: any, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.url;
    chamadas.push({ url, init });
    const r = responder(url, init);
    if (r instanceof Response) return r;
    return new Response(JSON.stringify(r ?? {}), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  return chamadas;
}

afterEach(() => vi.unstubAllGlobals());

describe('extrairBearer', () => {
  it('lê o token de sessão', () => {
    const r = new Request('https://x', { headers: { Authorization: `Bearer ${TOKEN}` } });
    expect(extrairBearer(r)).toBe(TOKEN);
  });
  it('recusa cabeçalho ausente ou com caracteres estranhos', () => {
    expect(extrairBearer(new Request('https://x'))).toBe(null);
    const r = new Request('https://x', { headers: { Authorization: 'Bearer abc def&x=1' } });
    expect(extrairBearer(r)).toBe(null);
  });
});

describe('reservaDoMetadata', () => {
  it('aceita só UUID', () => {
    expect(reservaDoMetadata({ nema_reserva: REF })).toBe(REF);
    expect(reservaDoMetadata({ nema_reserva: "1' or 1=1" })).toBe(null);
    expect(reservaDoMetadata(undefined)).toBe(null);
  });
});

describe('GET /api/nema/saldo', () => {
  it('exige login', async () => {
    mockFetch(() => ({}));
    const res = await handleNemaSaldo(new Request('https://w/api/nema/saldo'), env);
    expect(res.status).toBe(401);
  });

  it('devolve o saldo e o valor em reais', async () => {
    mockFetch((url) => {
      if (url.endsWith('/auth/v1/user')) return { id: 'u1', email: 'leitor@x.com' };
      if (url.includes('rpc/nema_saldo')) return [{ disponivel: 4.98, pendente: 0, reservado: 0 }];
      if (url.includes('rpc/nema_param')) return 0.5;
      return {};
    });
    const req = new Request('https://w/api/nema/saldo', { headers: { Authorization: `Bearer ${TOKEN}` } });
    const body: any = await (await handleNemaSaldo(req, env)).json();
    expect(body).toMatchObject({ ok: true, disponivel: 4.98, disponivel_em_reais: 2.49 });
  });
});

describe('POST /api/checkout/preferencia com Nema', () => {
  function responderBase(url: string) {
    if (url.includes('/rest/v1/catalogo')) return [{ slug: 'antifalencia', titulo: 'Guia', preco: 46.04, cotas: 3 }];
    if (url.endsWith('/auth/v1/user')) return { id: 'u1', email: 'dono@x.com' };
    if (url.includes('rpc/nema_reservar')) return { ok: true, quantidade: 10, desconto: 5, reserva_ref: REF };
    if (url.includes('/checkout/preferences')) return { id: 'pref1', init_point: 'https://mp/pay' };
    return [];
  }

  it('aplica o desconto, cobra no e-mail do dono do saldo e grava a reserva no metadata', async () => {
    const chamadas = mockFetch(responderBase);
    const req = new Request('https://w/api/checkout/preferencia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ slug: 'antifalencia', email: 'outro@x.com', usar_nema: true }),
    });
    const body: any = await (await handleCriarPreferencia(req, env)).json();
    expect(body).toMatchObject({ ok: true, desconto: 5, nema_usado: 10 });
    const mp = chamadas.find((c) => c.url.includes('/checkout/preferences'))!;
    const pref = JSON.parse(String(mp.init!.body));
    expect(pref.items[0].unit_price).toBe(41.04);
    expect(pref.payer.email).toBe('dono@x.com');
    expect(pref.metadata).toEqual({ nema_reserva: REF, nema_quantidade: 10 });
  });

  it('sem login não usa Nema', async () => {
    mockFetch(responderBase);
    const req = new Request('https://w/api/checkout/preferencia', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'antifalencia', email: 'x@x.com', usar_nema: true }),
    });
    expect((await handleCriarPreferencia(req, env)).status).toBe(401);
  });

  it('sem pedir Nema, o preço segue cheio e nada é reservado', async () => {
    const chamadas = mockFetch(responderBase);
    const req = new Request('https://w/api/checkout/preferencia', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'antifalencia', email: 'x@x.com' }),
    });
    await handleCriarPreferencia(req, env);
    const pref = JSON.parse(String(chamadas.find((c) => c.url.includes('/checkout/preferences'))!.init!.body));
    expect(pref.items[0].unit_price).toBe(46.04);
    expect(pref.metadata).toBeUndefined();
    expect(chamadas.some((c) => c.url.includes('nema_reservar'))).toBe(false);
  });

  it('se o Mercado Pago falhar, a reserva é cancelada', async () => {
    const chamadas = mockFetch((url) =>
      url.includes('/checkout/preferences') ? new Response('erro', { status: 500 }) : responderBase(url));
    const req = new Request('https://w/api/checkout/preferencia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ slug: 'antifalencia', email: 'x@x.com', usar_nema: true }),
    });
    expect((await handleCriarPreferencia(req, env)).status).toBe(502);
    expect(chamadas.some((c) => c.url.includes('nema_cancelar_reserva'))).toBe(true);
  });
});

describe('webhook de pagamento aprovado', () => {
  async function assinar(id: string, ts: number) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.WEBHOOK_HMAC_SECRET),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`id:${id};request-id:req1;ts:${ts}`));
    return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  it('confirma o Nema usado, credita o Nema ganho e não distribui números de sorteio', async () => {
    const chamadas = mockFetch((url) => {
      if (url.includes('/v1/payments/mp1')) return {
        status: 'approved', external_reference: 'antifalencia', transaction_amount: 41.04,
        payment_type_id: 'pix', payer: { email: 'dono@x.com', first_name: 'Dono' }, metadata: { nema_reserva: REF },
      };
      if (url.includes('/auth/v1/admin/users')) return { id: 'u1' };
      if (url.includes('rpc/registrar_compra_mp')) return { ok: true, novo: true, purchase_id: PURCHASE, cotas_base: 3 };
      if (url.includes('rpc/nema_creditar_compra')) return { ok: true, quantidade: 8.21 };
      return {};
    });
    const ts = Math.floor(Date.now() / 1000);
    const req = new Request('https://w/api/webhook/pagamento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-request-id': 'req1', 'x-signature': `ts=${ts},v1=${await assinar('mp1', ts)}` },
      body: JSON.stringify({ type: 'payment', data: { id: 'mp1' } }),
    });
    const res = await handleWebhookPagamento(req, env);
    expect(res.status).toBe(200);

    const confirma = chamadas.find((c) => c.url.includes('nema_confirmar_resgate'))!;
    expect(JSON.parse(String(confirma.init!.body))).toMatchObject({ p_ref: REF, p_mp_payment: 'mp1', p_purchase: PURCHASE });
    const credito = chamadas.find((c) => c.url.includes('nema_creditar_compra'))!;
    expect(JSON.parse(String(credito.init!.body))).toMatchObject({ p_user: 'u1', p_purchase: PURCHASE, p_valor_pago: 41.04 });
    expect(chamadas.some((c) => c.url.includes('draw_numbers') || c.url.includes('draw_entries') || c.url.includes('/draws?'))).toBe(false);
  });
});
