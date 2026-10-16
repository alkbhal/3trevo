/**
 * publicacao/ptax.ts — Três Trevo Worker
 * Cotação PTAX do Banco Central (D1): 1 unidade da moeda em BRL, boletim de
 * fechamento, taxa de venda. Falhou a consulta → null, e a proposta en/es fica
 * em rascunho com o motivo (R4.6). Nunca uma taxa suposta.
 */

import type { Cotacao } from '../guardiao/engine';

const OLINDA = 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata';
export const FONTE_PTAX = 'BCB PTAX — boletim de fechamento, cotação de venda';
const MOEDA = /^[A-Z]{3}$/;

/** AAAA-MM-DD → MM-DD-AAAA (formato da API Olinda). */
function dataOlinda(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${m}-${d}-${a}`;
}

function menosDias(iso: string, dias: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) - dias * 86400000).toISOString().slice(0, 10);
}

/**
 * Último fechamento PTAX até `hoje`, olhando 7 dias para trás (fim de semana e
 * feriado não têm boletim — mesma janela de validade do motor).
 */
export async function buscarPtax(moeda: string, hoje: string): Promise<Cotacao | null> {
  if (!MOEDA.test(moeda)) return null;
  const url = `${OLINDA}/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)` +
    `?@moeda='${moeda}'&@dataInicial='${dataOlinda(menosDias(hoje, 7))}'&@dataFinalCotacao='${dataOlinda(hoje)}'` +
    `&$format=json&$select=cotacaoVenda,dataHoraCotacao,tipoBoletim`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const corpo = (await r.json()) as { value?: Array<{ cotacaoVenda: number; dataHoraCotacao: string; tipoBoletim: string }> };
    const fechamentos = (corpo.value ?? [])
      .filter((v) => /fechamento/i.test(v.tipoBoletim) && typeof v.cotacaoVenda === 'number' && v.cotacaoVenda > 0)
      .sort((a, b) => a.dataHoraCotacao.localeCompare(b.dataHoraCotacao));
    const ultimo = fechamentos[fechamentos.length - 1];
    if (!ultimo) return null;
    return { taxa: ultimo.cotacaoVenda, data: ultimo.dataHoraCotacao.slice(0, 10), fonte: FONTE_PTAX };
  } catch (err) {
    console.error(`[ptax] consulta ${moeda} falhou:`, err);
    return null;
  }
}
