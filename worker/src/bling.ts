/**
 * bling.ts — cliente da API v3 do Bling (OAuth 2.0 + NF-e)
 *
 * Quem fala com a SEFAZ é o Bling: o certificado A1 fica cadastrado na conta Bling,
 * nunca aqui. O Worker só guarda o par de tokens OAuth no KV (chave bling:tokens).
 * O access_token vale 6 h; o refresh_token troca a cada renovação.
 *
 * Secrets: BLING_CLIENT_ID, BLING_CLIENT_SECRET (app criado na Central de Extensões do Bling,
 * com URL de redirecionamento = WORKER_URL/api/bling/callback).
 */

import type { Env } from './types';

export const BLING_AUTHORIZE = 'https://www.bling.com.br/Api/v3/oauth/authorize';
export const BLING_API = 'https://api.bling.com.br/Api/v3';
const KV_TOKENS = 'bling:tokens';
const KV_STATE = 'bling:state:';

interface Tokens { access_token: string; refresh_token: string; expira_em: number }

export class BlingErro extends Error {
  constructor(message: string, readonly status = 0) { super(message); }
}

export function blingConfigurado(env: Env): boolean {
  return Boolean(env.BLING_CLIENT_ID && env.BLING_CLIENT_SECRET && env.TT_KV);
}

// ─── OAuth ──────────────────────────────────────────────────────────────────

/** URL para o dono autorizar o app no Bling. O state vale 10 min e é de uso único. */
export async function urlAutorizacao(env: Env): Promise<string> {
  const state = crypto.randomUUID();
  await env.TT_KV!.put(KV_STATE + state, '1', { expirationTtl: 600 });
  const q = new URLSearchParams({ response_type: 'code', client_id: env.BLING_CLIENT_ID!, state });
  return `${BLING_AUTHORIZE}?${q}`;
}

export async function consumirState(env: Env, state: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(state)) return false;
  const ok = await env.TT_KV!.get(KV_STATE + state);
  if (!ok) return false;
  await env.TT_KV!.delete(KV_STATE + state);
  return true;
}

async function pedirToken(env: Env, form: Record<string, string>): Promise<Tokens> {
  const resp = await fetch(`${BLING_API}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${env.BLING_CLIENT_ID}:${env.BLING_CLIENT_SECRET}`),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: '1.0',
    },
    body: new URLSearchParams(form),
  });
  const d = (await resp.json().catch(() => ({}))) as any;
  if (!resp.ok || !d.access_token || !d.refresh_token) {
    throw new BlingErro(`token recusado: ${mensagemErro(d) || resp.status}`, resp.status);
  }
  const tokens: Tokens = {
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expira_em: Date.now() + Number(d.expires_in ?? 21600) * 1000,
  };
  await env.TT_KV!.put(KV_TOKENS, JSON.stringify(tokens));
  return tokens;
}

/** Troca o code do callback pelo par de tokens. */
export function trocarCodigo(env: Env, code: string): Promise<Tokens> {
  return pedirToken(env, { grant_type: 'authorization_code', code });
}

export async function lerTokens(env: Env): Promise<Tokens | null> {
  const raw = await env.TT_KV?.get(KV_TOKENS);
  if (!raw) return null;
  try { return JSON.parse(raw) as Tokens; } catch { return null; }
}

/** access_token válido, renovando 2 min antes de vencer. */
export async function accessToken(env: Env): Promise<string> {
  const t = await lerTokens(env);
  if (!t) throw new BlingErro('bling_desconectado');
  if (t.expira_em - 120000 > Date.now()) return t.access_token;
  const novo = await pedirToken(env, { grant_type: 'refresh_token', refresh_token: t.refresh_token });
  return novo.access_token;
}

// ─── API ────────────────────────────────────────────────────────────────────

export function mensagemErro(d: any): string {
  const e = d?.error;
  if (!e) return d?.error_description || '';
  const campos = Array.isArray(e.fields) ? e.fields.map((f: any) => f?.msg).filter(Boolean).join('; ') : '';
  return [e.message || e.description, campos].filter(Boolean).join(' — ').slice(0, 500);
}

export async function blingApi(env: Env, metodo: string, caminho: string, corpo?: unknown): Promise<any> {
  const token = await accessToken(env);
  const resp = await fetch(`${BLING_API}${caminho}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(corpo ? { 'Content-Type': 'application/json' } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const d = (await resp.json().catch(() => ({}))) as any;
  if (!resp.ok) throw new BlingErro(mensagemErro(d) || `HTTP ${resp.status}`, resp.status);
  return d;
}

// ─── Montagem da NF-e ───────────────────────────────────────────────────────

export interface ConfigNFe { naturezaId: number; ncm: string; lojaId?: number }

export function configNFe(env: Env): ConfigNFe | null {
  const naturezaId = Number(env.BLING_NATUREZA_ID);
  if (!Number.isInteger(naturezaId) || naturezaId <= 0) return null;
  const lojaId = Number(env.BLING_LOJA_ID);
  return {
    naturezaId,
    ncm: env.NFE_NCM || '4901.99.00',
    ...(Number.isInteger(lojaId) && lojaId > 0 ? { lojaId } : {}),
  };
}

/** "AAAA-MM-DD HH:MM:SS" no horário de Brasília (UTC−3, sem horário de verão desde 2019). */
export function dataBling(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 3 * 3600000);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function nomePais(codigo: string): string {
  try { return new Intl.DisplayNames(['pt-BR'], { type: 'region' }).of(codigo) || codigo; } catch { return codigo; }
}

function formatarCep(cep: string): string {
  return /^\d{8}$/.test(cep) ? `${cep.slice(0, 5)}-${cep.slice(5)}` : cep;
}

/**
 * Corpo do POST /nfe. Uma nota de saída por pagamento, com o e-book como item único.
 * CFOP e tributos vêm da natureza de operação cadastrada no Bling pelo contador
 * (BLING_NATUREZA_ID), que separa venda dentro do RS, para outro estado e exportação.
 */
export function payloadNFe(df: any, produto: { slug: string; titulo: string }, cfg: ConfigNFe): Record<string, unknown> {
  const exterior = df.tipo_documento === 'EXTERIOR';
  const contato = {
    nome: String(df.nome).slice(0, 120),
    tipoPessoa: exterior ? 'E' : df.tipo_documento === 'CNPJ' ? 'J' : 'F',
    numeroDocumento: df.documento || '',
    contribuinte: 9, // não contribuinte de ICMS (consumidor final)
    email: df.email,
    endereco: exterior
      ? {
          // na NF-e de exportação o município é "EXTERIOR" e a UF "EX"; a cidade real vai no endereço
          endereco: `${df.logradouro} - ${df.cidade}${df.cep ? ' ' + df.cep : ''}`.slice(0, 120),
          numero: df.numero || 'S/N',
          complemento: df.complemento || '',
          bairro: df.bairro || 'Exterior',
          cep: '',
          municipio: 'EXTERIOR',
          uf: 'EX',
          pais: nomePais(df.pais),
        }
      : {
          endereco: df.logradouro,
          numero: df.numero,
          complemento: df.complemento || '',
          bairro: df.bairro,
          cep: formatarCep(df.cep),
          municipio: df.cidade,
          uf: df.uf,
        },
  };
  return {
    tipo: 1, // saída
    dataOperacao: dataBling(df.criado_em),
    contato,
    naturezaOperacao: { id: cfg.naturezaId },
    ...(cfg.lojaId ? { loja: { id: cfg.lojaId } } : {}),
    finalidade: 1, // normal
    itens: [{
      codigo: produto.slug,
      descricao: `E-book: ${produto.titulo}`.slice(0, 120),
      unidade: 'UN',
      quantidade: 1,
      valor: Number(df.valor),
      tipo: 'P',
      origem: 0, // nacional
      classificacaoFiscal: cfg.ncm,
    }],
    observacoes: `Pagamento Mercado Pago ${df.mp_payment_id}. Livro digital (e-book), entrega por download.`,
  };
}
