/**
 * guardiao/monitor.ts — Três Trevo Worker
 * Liga o Guardião ao cron horário (cron/health-monitor.ts).
 *
 * Mapeamento para o que o monitor já sabe fazer:
 *   🔴 violação / 🟠 divergente → `erros`  (dispara o e-mail de alerta existente)
 *   🟡 não confirmado           → `avisos` (log + KV, sem e-mail)
 *   🟢 confirmado               → silêncio
 * Histórico das últimas 24 execuções fica em KV e alimenta o padrão
 * (primeira ocorrência / persistente / oscilante / resolvido).
 */

import type { Env } from '../types';
import { verificar, statusGeral, classificarPadrao, NIVEL_ICONE, type ExecucaoHistorica, type Resultado } from './engine';
import { CATALOGO, IDS_CONTRATADOS, montarContexto } from './catalogo-3trevo';

export const KV_GUARDIAO_HIST = 'guardiao:historico';
const MAX_HISTORICO = 24;            // 24 execuções horárias = 1 dia
const TTL_HISTORICO_S = 7 * 24 * 3600;

interface Registro extends ExecucaoHistorica { quando: string }

async function lerHistorico(env: Env): Promise<Registro[]> {
  if (!env.TT_KV) return [];
  try {
    const raw = await env.TT_KV.get(KV_GUARDIAO_HIST);
    const lista = raw ? JSON.parse(raw) : [];
    return Array.isArray(lista) ? lista : [];
  } catch {
    return []; // histórico corrompido: recomeça, nunca quebra a verificação
  }
}

async function gravarHistorico(env: Env, hist: Registro[], resultados: Resultado[]): Promise<void> {
  if (!env.TT_KV) return;
  const novo: Registro = { quando: new Date().toISOString(), resultados: resultados.map(r => ({ id: r.id, nivel: r.nivel })) };
  try {
    await env.TT_KV.put(KV_GUARDIAO_HIST, JSON.stringify([...hist, novo].slice(-MAX_HISTORICO)), { expirationTtl: TTL_HISTORICO_S });
  } catch (e) {
    console.warn('[guardiao] não gravou histórico:', e);
  }
}

function linha(r: Resultado, hist: Registro[]): string {
  const padrao = classificarPadrao(r.id, r.nivel, hist);
  const marca = padrao && padrao.tipo !== 'estavel' ? ` [${padrao.tipo}]` : '';
  const acao = r.acaoRecomendada ? ` → ${r.acaoRecomendada}` : '';
  return `Guardião ${NIVEL_ICONE[r.nivel]} ${r.titulo} — ${r.resultadoObservado}${marca}${acao}`;
}

/** Nunca lança: o Guardião falhar não pode derrubar o monitor que o hospeda. */
export async function rodarGuardiao(env: Env, erros: string[], avisos: string[]) {
  try {
    const hist = await lerHistorico(env);
    const resultados = await verificar(await montarContexto(env), CATALOGO, IDS_CONTRATADOS);
    for (const r of resultados) {
      if (r.nivel === 'confirmado') continue;
      (r.nivel === 'nao_confirmado' ? avisos : erros).push(linha(r, hist));
    }
    await gravarHistorico(env, hist, resultados);
    const s = statusGeral(resultados);
    return { status: s.status, icone: s.icone, contratados: IDS_CONTRATADOS.length };
  } catch (e) {
    avisos.push(`Guardião 🟡 não executou: ${(e as Error)?.message ?? String(e)}`);
    return { status: 'atencao', icone: '🟡', contratados: IDS_CONTRATADOS.length };
  }
}
