// worker/tests/nfe-bling.test.ts
// NF-e pelo Bling: montagem da nota, fila de emissão (sem nota dupla) e OAuth.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { payloadNFe, dataBling, accessToken } from '../src/bling';
import { handleNFeEmissao } from '../src/cron/nfe-emissao';
import { handleBlingCallback, handleNFeConectar } from '../src/routes/admin-nfe';

function kv(inicial: Record<string, string> = {}) {
  const m = new Map(Object.entries(inicial));
  return {
    m,
    get: vi.fn(async (k: string) => m.get(k) ?? null),
    put: vi.fn(async (k: string, v: string) => { m.set(k, v); }),
    delete: vi.fn(async (k: string) => { m.delete(k); }),
  };
}

const TOKENS_OK = JSON.stringify({ access_token: 'AT', refresh_token: 'RT', expira_em: Date.now() + 3600000 });
const envBase = (extra: Record<string, unknown> = {}) => ({
  SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc',
  BLING_CLIENT_ID: 'cid', BLING_CLIENT_SECRET: 'csec', BLING_NATUREZA_ID: '777',
  NFE_ENABLED: 'true', TT_KV: kv({ 'bling:tokens': TOKENS_OK }), ...extra,
}) as any;

const DF = {
  id: 'df1', purchase_id: 'pu1', mp_payment_id: 'mp1', email: 'ana@x.com', nome: 'Ana Leitora', valor: 19.9,
  tipo_documento: 'CPF', pais: 'BR', documento: '52998224725', cep: '95660000', logradouro: 'Rua Principal',
  numero: '100', complemento: null, bairro: 'Centro', cidade: 'Montauri', uf: 'RS', criado_em: '2026-10-26T15:30:00Z',
};

type Chamada = { url: string; metodo: string; corpo: any };
function mockFetch(responder: (url: string, metodo: string, corpo: any) => unknown) {
  const chamadas: Chamada[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: any, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.url;
    const metodo = init?.method ?? 'GET';
    let corpo: any = init?.body;
    try { corpo = typeof corpo === 'string' ? JSON.parse(corpo) : corpo; } catch { /* form */ }
    chamadas.push({ url, metodo, corpo });
    const r = responder(url, metodo, corpo);
    if (r instanceof Response) return r;
    return new Response(JSON.stringify(r ?? []), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  return chamadas;
}
afterEach(() => vi.unstubAllGlobals());

/** Supabase + Bling falsos para uma nota na fila. */
function cenario(nota: Record<string, unknown>, opts: { situacao?: number; compra?: string } = {}) {
  return mockFetch((url, metodo) => {
    if (url.includes('/rest/v1/dados_fiscais?nf_emitida_em')) return [];
    if (url.includes('/rest/v1/notas_fiscais?status=in.')) return [{ tentativas: 0, ...nota, dados_fiscais: DF }];
    if (url.includes('/rest/v1/purchases')) return [{ status: opts.compra ?? 'approved', produto: { slug: 'isa-isma-tintim', titulo: 'Isa, Isma e Tintim' } }];
    if (url.includes('/rest/v1/notas_fiscais?id=eq.n1&status=eq.')) return [{ id: 'n1' }];
    if (url.endsWith('/Api/v3/nfe') && metodo === 'POST') return { data: { id: 555 } };
    if (url.endsWith('/enviar')) return { data: {} };
    if (url.endsWith('/Api/v3/nfe/555')) return {
      data: { id: 555, situacao: opts.situacao ?? 5, numero: '123', serie: '1', chaveAcesso: '4326...', xml: 'https://bling/xml', linkPDF: 'https://bling/pdf' },
    };
    return [];
  });
}
const patchesDaNota = (ch: Chamada[]) => ch.filter((c) => c.metodo === 'PATCH' && c.url.includes('notas_fiscais?id=eq.n1')).map((c) => c.corpo);

describe('payloadNFe', () => {
  const produto = { slug: 'isa-isma-tintim', titulo: 'Isa, Isma e Tintim' };
  const cfg = { naturezaId: 777, ncm: '4901.99.00' };

  it('CPF: pessoa física, endereço brasileiro, item único com NCM de livro', () => {
    const p: any = payloadNFe(DF, produto, cfg);
    expect(p).toMatchObject({ tipo: 1, naturezaOperacao: { id: 777 }, dataOperacao: '2026-10-26 12:30:00' });
    expect(p.contato).toMatchObject({ tipoPessoa: 'F', numeroDocumento: '52998224725', contribuinte: 9 });
    expect(p.contato.endereco).toMatchObject({ cep: '95660-000', municipio: 'Montauri', uf: 'RS', numero: '100' });
    expect(p.itens).toEqual([expect.objectContaining({ codigo: 'isa-isma-tintim', quantidade: 1, valor: 19.9, classificacaoFiscal: '4901.99.00' })]);
  });

  it('CNPJ vira pessoa jurídica', () => {
    expect((payloadNFe({ ...DF, tipo_documento: 'CNPJ', documento: '18928966000159' }, produto, cfg) as any).contato.tipoPessoa).toBe('J');
  });

  it('exterior: estrangeiro, UF EX, município EXTERIOR e a cidade real no endereço', () => {
    const fora = { ...DF, tipo_documento: 'EXTERIOR', pais: 'PT', documento: null, cep: '1100-053', numero: null, bairro: null, cidade: 'Lisboa', uf: 'EX', logradouro: 'Rua Augusta 10' };
    const c: any = (payloadNFe(fora, produto, cfg) as any).contato;
    expect(c).toMatchObject({ tipoPessoa: 'E', numeroDocumento: '' });
    expect(c.endereco).toMatchObject({ uf: 'EX', municipio: 'EXTERIOR', numero: 'S/N', pais: 'Portugal' });
    expect(c.endereco.endereco).toBe('Rua Augusta 10 - Lisboa 1100-053');
  });

  it('dataBling usa o horário de Brasília', () => {
    expect(dataBling('2026-01-01T02:00:00Z')).toBe('2025-12-31 23:00:00');
  });
});

describe('handleNFeEmissao', () => {
  it('desligado: só enfileira, sem falar com o Bling', async () => {
    const ch = mockFetch((url) => {
      if (url.includes('dados_fiscais?nf_emitida_em')) return [{ id: 'df1', purchase_id: 'pu1' }];
      if (url.includes('notas_fiscais?on_conflict')) return [{ id: 'n1' }];
      return [];
    });
    const r = await handleNFeEmissao(envBase({ NFE_ENABLED: undefined }));
    expect(r).toMatchObject({ ativo: false, enfileiradas: 1, motivo: 'NFE_ENABLED desligado' });
    const ins = ch.find((c) => c.url.includes('notas_fiscais?on_conflict=dados_fiscais_id'))!;
    expect(ins.corpo).toEqual([{ dados_fiscais_id: 'df1', purchase_id: 'pu1', status: 'pendente' }]);
    expect(ch.some((c) => c.url.includes('bling.com.br'))).toBe(false);
  });

  it('sem natureza de operação definida não emite', async () => {
    mockFetch(() => []);
    expect(await handleNFeEmissao(envBase({ BLING_NATUREZA_ID: '' }))).toMatchObject({ ativo: false, motivo: 'BLING_NATUREZA_ID não definido' });
  });

  it('pendente → cria, envia, consulta e grava a nota emitida', async () => {
    const ch = cenario({ id: 'n1', status: 'pendente', bling_id: null });
    const r = await handleNFeEmissao(envBase());
    expect(r).toMatchObject({ ativo: true, emitidas: 1, erros: 0 });
    const criar = ch.find((c) => c.url.endsWith('/Api/v3/nfe') && c.metodo === 'POST')!;
    expect(criar.corpo.contato.numeroDocumento).toBe('52998224725');
    const patches = patchesDaNota(ch);
    // trava → bling_id gravado logo após criar → enviada → emitida
    expect(patches.map((p) => p.status)).toEqual(['criando', 'pendente', 'enviada', 'emitida']);
    expect(patches[1]).toMatchObject({ bling_id: '555' });
    expect(patches.at(-1)).toMatchObject({ status: 'emitida', numero_nf: 123, chave_acesso: '4326...', pdf_url: 'https://bling/pdf' });
    const df = ch.find((c) => c.metodo === 'PATCH' && c.url.includes('dados_fiscais?id=eq.df1'))!;
    expect(df.corpo).toMatchObject({ nf_numero: '123' });
  });

  it('com bling_id já gravado nunca cria outra nota: só reenvia', async () => {
    const ch = cenario({ id: 'n1', status: 'erro', bling_id: '555', tentativas: 2 }, { situacao: 1 });
    await handleNFeEmissao(envBase());
    expect(ch.some((c) => c.url.endsWith('/Api/v3/nfe') && c.metodo === 'POST')).toBe(false);
    expect(ch.some((c) => c.url.endsWith('/nfe/555/enviar'))).toBe(true);
  });

  it('nota com erro que o Bling já autorizou é marcada emitida sem reenviar', async () => {
    const ch = cenario({ id: 'n1', status: 'erro', bling_id: '555', tentativas: 1 }, { situacao: 6 });
    await handleNFeEmissao(envBase());
    expect(ch.some((c) => c.url.endsWith('/enviar'))).toBe(false);
    expect(patchesDaNota(ch).at(-1)).toMatchObject({ status: 'emitida' });
  });

  it('compra reembolsada antes da emissão vira cancelada, sem nota', async () => {
    const ch = cenario({ id: 'n1', status: 'pendente', bling_id: null }, { compra: 'refunded' });
    await handleNFeEmissao(envBase());
    expect(ch.some((c) => c.url.includes('bling.com.br'))).toBe(false);
    expect(patchesDaNota(ch).at(-1)).toMatchObject({ status: 'cancelada' });
  });

  it('rejeição da SEFAZ sai da fila automática', async () => {
    const ch = cenario({ id: 'n1', status: 'enviada', bling_id: '555' }, { situacao: 4 });
    await handleNFeEmissao(envBase());
    expect(patchesDaNota(ch).at(-1)).toMatchObject({ status: 'erro', tentativas: 5 });
  });

  it('falha do Bling conta tentativa e guarda a mensagem', async () => {
    const ch = mockFetch((url, metodo) => {
      if (url.includes('notas_fiscais?status=in.')) return [{ id: 'n1', status: 'pendente', bling_id: null, tentativas: 1, dados_fiscais: DF }];
      if (url.includes('/rest/v1/purchases')) return [{ status: 'approved', produto: { slug: 's', titulo: 'T' } }];
      if (url.includes('notas_fiscais?id=eq.n1&status=eq.')) return [{ id: 'n1' }];
      if (url.endsWith('/Api/v3/nfe') && metodo === 'POST') {
        return new Response(JSON.stringify({ error: { message: 'Validação', fields: [{ msg: 'CEP inválido' }] } }), { status: 400 });
      }
      return [];
    });
    const r = await handleNFeEmissao(envBase());
    expect(r.erros).toBe(1);
    expect(patchesDaNota(ch).at(-1)).toMatchObject({ status: 'erro', tentativas: 2, error_message: 'Validação — CEP inválido' });
  });

  it('Bling desconectado (401) para o lote sem gastar tentativas', async () => {
    const ch = cenario({ id: 'n1', status: 'enviada', bling_id: '555' });
    vi.stubGlobal('fetch', vi.fn(async (input: any, init?: RequestInit) => {
      const url = String(input);
      ch.push({ url, metodo: init?.method ?? 'GET', corpo: init?.body });
      if (url.includes('notas_fiscais?status=in.')) return Response.json([{ id: 'n1', status: 'enviada', bling_id: '555', tentativas: 0, dados_fiscais: DF }]);
      if (url.includes('bling.com.br')) return Response.json({ error: { message: 'invalid_token' } }, { status: 401 });
      return Response.json([]);
    }));
    const r = await handleNFeEmissao(envBase());
    expect(r.motivo).toMatch(/desconectado/);
    expect(ch.some((c) => c.metodo === 'PATCH' && c.url.includes('notas_fiscais?id=eq.n1'))).toBe(false);
  });
});

describe('OAuth do Bling', () => {
  it('renova o access_token vencido e guarda o novo par', async () => {
    const env = envBase({ TT_KV: kv({ 'bling:tokens': JSON.stringify({ access_token: 'velho', refresh_token: 'RT1', expira_em: Date.now() - 1 }) }) });
    const ch = mockFetch(() => ({ access_token: 'novo', refresh_token: 'RT2', expires_in: 21600 }));
    expect(await accessToken(env)).toBe('novo');
    expect(ch[0].url).toBe('https://api.bling.com.br/Api/v3/oauth/token');
    expect(String(ch[0].corpo)).toContain('grant_type=refresh_token');
    expect(JSON.parse(env.TT_KV.m.get('bling:tokens'))).toMatchObject({ refresh_token: 'RT2' });
  });

  it('callback recusa state desconhecido', async () => {
    mockFetch(() => ({}));
    const res = await handleBlingCallback(new Request('https://w/api/bling/callback?code=abc&state=00000000-0000-0000-0000-000000000000'), envBase());
    expect(res.status).toBe(400);
  });

  it('callback com state válido troca o code e grava os tokens (state é de uso único)', async () => {
    const STATE = '11111111-2222-3333-4444-555555555555';
    const env = envBase({ TT_KV: kv({ [`bling:state:${STATE}`]: '1' }) });
    mockFetch(() => ({ access_token: 'AT', refresh_token: 'RT', expires_in: 21600 }));
    const res = await handleBlingCallback(new Request(`https://w/api/bling/callback?code=abc&state=${STATE}`), env);
    expect(res.status).toBe(200);
    expect(env.TT_KV.m.has('bling:tokens')).toBe(true);
    expect(env.TT_KV.m.has(`bling:state:${STATE}`)).toBe(false);
  });

  it('conectar exige login do admin', async () => {
    mockFetch(() => []); // admin_sessoes vazio = sem sessão
    const res = await handleNFeConectar(new Request('https://w/api/admin/nfe/conectar', { method: 'POST', headers: { Authorization: 'Bearer x' } }), envBase());
    expect(res.status).toBe(401);
  });
});
