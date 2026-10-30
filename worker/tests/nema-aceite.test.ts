// worker/tests/nema-aceite.test.ts
// Regulamento Geral do Nema (etapa 7): aceite uma vez por versão, extrato livre e o
// comportamento de antes enquanto a migração não está aplicada ou a exigência está desligada.

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  aceiteSchema, precisaAceite, regulamentoVigente,
  handleNemaAceite, handleNemaExtrato, handleNemaRegulamento,
} from '../src/routes/nema';

const env = { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'chave' } as any;
const TOKEN = 'token-de-sessao-valido-1234567890';
const USUARIO = { id: '11111111-1111-1111-1111-111111111111', email: 'leitor@exemplo.com' };

// Simula o Supabase: auth/v1/user e as rpc/tabelas pedidas, cada uma com a resposta dada.
function simular(rpcs: Record<string, unknown>, tabelas: Record<string, unknown> = {}) {
  const chamadas: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const caminho = url.replace('https://sb.test/', '');
    chamadas.push(caminho);
    if (caminho === 'auth/v1/user') return Response.json(USUARIO);
    const rpc = caminho.match(/^rest\/v1\/rpc\/(\w+)$/)?.[1];
    if (rpc) return rpc in rpcs ? Response.json(rpcs[rpc]) : new Response('not found', { status: 404 });
    const tabela = Object.keys(tabelas).find((t) => caminho.startsWith(`rest/v1/${t}`));
    return tabela ? Response.json(tabelas[tabela]) : new Response('[]');
  }));
  return chamadas;
}

const req = (metodo: string, corpo?: unknown, logado = true) =>
  new Request('https://api.test/x', {
    method: metodo,
    headers: logado ? { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' } : {},
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('aceiteSchema', () => {
  it('aceita versão inteira positiva e origem conhecida', () => {
    expect(aceiteSchema.safeParse({ versao: 1, origem: 'area_cliente' }).success).toBe(true);
    expect(aceiteSchema.safeParse({ versao: 3, origem: 'checkout' }).success).toBe(true);
  });
  it('rejeita versão zero, negativa, fracionária ou texto', () => {
    for (const versao of [0, -1, 1.5, '1']) expect(aceiteSchema.safeParse({ versao, origem: 'checkout' }).success).toBe(false);
  });
  it('rejeita origem desconhecida ou ausente', () => {
    expect(aceiteSchema.safeParse({ versao: 1, origem: 'admin' }).success).toBe(false);
    expect(aceiteSchema.safeParse({ versao: 1 }).success).toBe(false);
  });
});

describe('precisaAceite', () => {
  it('exigência desligada: não precisa, e nem consulta o aceite', async () => {
    const chamadas = simular({ nema_param: 0, nema_aceite_ok: false });
    expect(await precisaAceite(env, USUARIO.id)).toBe(false);
    expect(chamadas.some((c) => c.endsWith('nema_aceite_ok'))).toBe(false);
  });
  it('exigência ligada e sem aceite: precisa', async () => {
    simular({ nema_param: 1, nema_aceite_ok: false });
    expect(await precisaAceite(env, USUARIO.id)).toBe(true);
  });
  it('exigência ligada e com aceite: não precisa', async () => {
    simular({ nema_param: 1, nema_aceite_ok: true });
    expect(await precisaAceite(env, USUARIO.id)).toBe(false);
  });
  it('migração ainda não aplicada (parâmetro inexistente): comportamento de antes', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    simular({ nema_param: null });
    expect(await precisaAceite(env, USUARIO.id)).toBe(false);
  });
});

describe('regulamentoVigente e GET /api/nema/regulamento', () => {
  it('sem versão publicada: vigente null', async () => {
    simular({ nema_versao_vigente: null });
    expect(await regulamentoVigente(env)).toBeNull();
    const r = await handleNemaRegulamento(req('GET', undefined, false), env);
    expect(await r.json()).toEqual({ ok: true, vigente: null });
  });
  it('função ainda não existe (migração não aplicada): vigente null, sem erro', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    simular({});
    const r = await handleNemaRegulamento(req('GET', undefined, false), env);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, vigente: null });
  });
  it('versão vigente e leitor logado: informa se já aceitou', async () => {
    const reg = { versao: 1, titulo: 'Regulamento Geral v1', url: '/nema-regulamento.html', vigente_desde: '2026-11-01T00:00:00Z' };
    simular({ nema_versao_vigente: 1, nema_aceite_ok: false }, { nema_regulamentos: [reg] });
    const r = await handleNemaRegulamento(req('GET'), env);
    expect(await r.json()).toEqual({ ok: true, vigente: reg, aceito: false });
  });
});

describe('POST /api/nema/aceite', () => {
  it('sem login: 401', async () => {
    simular({});
    const r = await handleNemaAceite(req('POST', { versao: 1, origem: 'area_cliente' }, false), env);
    expect(r.status).toBe(401);
  });
  it('corpo inválido: 400, sem chamar o banco', async () => {
    const chamadas = simular({ nema_aceitar: { ok: true, versao: 1 } });
    const r = await handleNemaAceite(req('POST', { versao: 'um', origem: 'area_cliente' }), env);
    expect(r.status).toBe(400);
    expect(chamadas.some((c) => c.endsWith('nema_aceitar'))).toBe(false);
  });
  it('versão que não é a vigente: 409 com a vigente', async () => {
    simular({ nema_aceitar: { ok: false, erro: 'versao_nao_vigente', vigente: 2 } });
    const r = await handleNemaAceite(req('POST', { versao: 1, origem: 'checkout' }), env);
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ ok: false, erro: 'versao_nao_vigente', vigente: 2 });
  });
  it('aceite da vigente: 200', async () => {
    simular({ nema_aceitar: { ok: true, versao: 1 } });
    const r = await handleNemaAceite(req('POST', { versao: 1, origem: 'area_cliente' }), env);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, versao: 1 });
  });
});

describe('GET /api/nema/extrato', () => {
  it('sem login: 401', async () => {
    simular({});
    expect((await handleNemaExtrato(req('GET', undefined, false), env)).status).toBe(401);
  });
  it('logado: devolve os movimentos, sem exigir aceite', async () => {
    const mov = [{ criado_em: '2026-10-30T10:00:00Z', tipo: 'credito_compra', quantidade: 3.98, status: 'confirmado', disponivel_em: '2026-11-06T10:00:00Z', purchase_id: null }];
    const chamadas = simular({ nema_extrato: mov });
    const r = await handleNemaExtrato(req('GET'), env);
    expect(await r.json()).toEqual({ ok: true, movimentos: mov });
    expect(chamadas.some((c) => c.endsWith('nema_aceite_ok'))).toBe(false);
  });
});
