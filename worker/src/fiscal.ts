/**
 * fiscal.ts — dados do comprador para a nota fiscal (CPF/CNPJ + endereço)
 *
 * O checkout manda `nf` junto com o pedido; aqui ele é validado de novo (o navegador
 * não é confiável), segue no metadata da preferência MP e, com o pagamento aprovado,
 * é gravado em public.dados_fiscais (uma linha por pagamento, só service_role lê).
 */

import type { Env } from './types';
import { sb } from './sb';

export interface DadosNF {
  // EXTERIOR: comprador fora do Brasil (NF de exportação: sem CPF/CEP; UF "EX", município "EXTERIOR")
  tipo: 'CPF' | 'CNPJ' | 'EXTERIOR';
  pais: string; // ISO 3166-1 alfa-2 ('BR' no Brasil)
  documento: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  ibge: string;
}

const UFS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);

export function cpfValido(v: string): boolean {
  if (!/^\d{11}$/.test(v) || /^(\d)\1{10}$/.test(v)) return false;
  for (let t = 9; t < 11; t++) {
    let soma = 0;
    for (let i = 0; i < t; i++) soma += Number(v[i]) * (t + 1 - i);
    if (((soma * 10) % 11) % 10 !== Number(v[t])) return false;
  }
  return true;
}

// Aceita o CNPJ alfanumérico da Receita (jul/2026): valor de cada caractere = código ASCII − 48.
export function cnpjValido(v: string): boolean {
  if (!/^[0-9A-Z]{12}\d{2}$/.test(v) || /^(\d)\1{13}$/.test(v)) return false;
  const pesos = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (let t = 12; t < 14; t++) {
    let soma = 0;
    for (let i = 0; i < t; i++) soma += (v.charCodeAt(i) - 48) * pesos[i + 13 - t];
    const resto = soma % 11;
    if ((resto < 2 ? 0 : 11 - resto) !== Number(v[t])) return false;
  }
  return true;
}

function texto(v: unknown, max: number): string {
  // remove caracteres de controle e espaços repetidos; corta no tamanho do campo da NF
  return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/** Valida e normaliza o `nf` vindo do checkout. Retorna null se faltar ou estiver errado. */
export function validarDadosNF(raw: unknown): DadosNF | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.exterior === true || r.tipo === 'EXTERIOR') return validarExterior(r);
  // Se o metadata do MP devolver número em vez de texto, recupera os zeros à esquerda.
  const doc0 = String(r.documento ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  const documento = typeof r.documento === 'number' ? doc0.padStart(r.tipo === 'CNPJ' ? 14 : 11, '0') : doc0;
  const tipo = documento.length === 11 && cpfValido(documento) ? 'CPF'
    : documento.length === 14 && cnpjValido(documento) ? 'CNPJ' : null;
  if (!tipo) return null;

  const cep = String(r.cep ?? '').replace(/\D/g, '').padStart(typeof r.cep === 'number' ? 8 : 0, '0');
  const uf = String(r.uf ?? '').trim().toUpperCase();
  const ibge = String(r.ibge ?? '').replace(/\D/g, '');
  const nf: DadosNF = {
    tipo, pais: 'BR', documento, cep, uf,
    logradouro: texto(r.logradouro, 120),
    numero: texto(r.numero, 10),
    complemento: texto(r.complemento, 60),
    bairro: texto(r.bairro, 60),
    cidade: texto(r.cidade, 60),
    ibge: ibge.length === 7 ? ibge : '',
  };
  if (cep.length !== 8 || !UFS.has(uf) || !nf.logradouro || !nf.numero || !nf.bairro || !nf.cidade) return null;
  return nf;
}

/**
 * Comprador no exterior: país, endereço e cidade obrigatórios; código postal e
 * documento do país dele (passaporte ou número fiscal) opcionais.
 */
function validarExterior(r: Record<string, unknown>): DadosNF | null {
  const pais = String(r.pais ?? '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(pais) || pais === 'BR') return null;
  const nf: DadosNF = {
    tipo: 'EXTERIOR', pais,
    documento: String(r.documento ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 20),
    cep: texto(r.cep, 12),
    logradouro: texto(r.logradouro, 120),
    numero: texto(r.numero, 10),
    complemento: texto(r.complemento, 60),
    bairro: texto(r.bairro, 60),
    cidade: texto(r.cidade, 60),
    uf: 'EX',
    ibge: '',
  };
  if (!nf.logradouro || !nf.cidade) return null;
  return nf;
}

/** Campos `payer` da preferência MP (o MP já abre o pagamento com CPF/endereço preenchidos). */
export function payerMP(nf: DadosNF, nome: string): Record<string, unknown> {
  const payer: Record<string, unknown> = {};
  if (nome) payer.name = nome;
  if (nf.tipo === 'EXTERIOR') return payer; // o MP só entende identificação e CEP brasileiros
  payer.address = { zip_code: nf.cep, street_name: nf.logradouro, street_number: nf.numero };
  // CNPJ alfanumérico ainda pode não ser aceito pelo MP: nesse caso só a NF usa o documento.
  if (/^\d+$/.test(nf.documento)) payer.identification = { type: nf.tipo, number: nf.documento };
  return payer;
}

/** Grava os dados fiscais do pagamento aprovado. Idempotente (MP reenvia avisos). */
export async function salvarDadosFiscais(env: Env, opts: {
  mpPaymentId: string;
  purchaseId: string | null;
  email: string;
  nome: string;
  valor: number;
  metadata: unknown;
}): Promise<void> {
  const nf = validarDadosNF((opts.metadata as any)?.nf);
  if (!nf) return; // compra antiga ou sem dados (ex.: pedido criado antes deste campo)
  const resp = await sb(env, 'dados_fiscais?on_conflict=mp_payment_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({
      mp_payment_id: opts.mpPaymentId,
      purchase_id: opts.purchaseId,
      email: opts.email,
      nome: texto(opts.nome, 150),
      valor: opts.valor,
      tipo_documento: nf.tipo,
      pais: nf.pais,
      documento: nf.documento || null,
      cep: nf.cep || null,
      logradouro: nf.logradouro,
      numero: nf.numero || null,
      complemento: nf.complemento || null,
      bairro: nf.bairro || null,
      cidade: nf.cidade,
      uf: nf.uf,
      codigo_ibge: nf.ibge || null,
    }),
  });
  if (!resp.ok) console.error('[fiscal] falha ao gravar dados_fiscais:', resp.status, await resp.text());
}
