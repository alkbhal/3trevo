/**
 * guardiao/catalogo-3trevo.ts — Três Trevo Worker
 * Catálogo do Guardião para o 3Trevo: contrato de SEGURANÇA do banco.
 *
 * Só entra aqui invariante que nasceu de decisão JÁ REGISTRADA (regra do
 * Guardião: contrato nasce de decisão, nunca de inferência de quem programa):
 *   - SECURITY-BASELINE-TT.md → "RLS habilitado em TODA tabela (sem exceção)"
 *   - scripts/security_hardening.sql → funções de servidor sem EXECUTE para
 *     PUBLIC/anon/authenticated (esse script nunca surtiu efeito por usar
 *     assinaturas erradas; em 29/09/2026 o acesso foi de fato revogado, e é
 *     ESTE catálogo que garante que não volte a abrir sem ninguém perceber).
 *
 * Todo check aqui é SOMENTE LEITURA: consulta `guardiao_postura` (função de
 * banco só-leitura, executável apenas pela service_role) e avalia o retorno.
 */

import type { Env } from '../types';
import type { Invariante, Parcial } from './engine';

/** Funções que só o worker (service_role) pode chamar. Lista = decisão registrada. */
export const FUNCOES_SENSIVEIS = [
  'registrar_compra_mp',
  'apurar_sorteio_lf',
  'registrar_resultado_sorteio_v2',
  'aprovar_depoimento_manual',
  'fila_revisao_manual',
  'submit_depoimento',
  'consultar_participacao',
  'upsert_cliente_pedido',
  'creditar_questionario',
];

export interface Postura {
  /** Função sensível que algum role público consegue executar. */
  funcoes_expostas: { fn: string; roles: string[] }[];
  /** Função vigiada que não existe mais no banco (vigilância perdida). */
  funcoes_ausentes: string[];
  /** Tabelas do schema public sem RLS. */
  tabelas_sem_rls: string[];
}

export interface CtxTrevo {
  postura: Postura | null;
  erroPostura: string | null;
}

/** Única parte com rede: uma chamada RPC só-leitura. Nunca lança — falha vira erroPostura (→ 🟡). */
export async function montarContexto(env: Env): Promise<CtxTrevo> {
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/guardiao_postura`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_funcs: FUNCOES_SENSIVEIS }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return { postura: null, erroPostura: `HTTP ${r.status}` };
    return { postura: (await r.json()) as Postura, erroPostura: null };
  } catch (e) {
    return { postura: null, erroPostura: String((e as Error)?.message ?? e) };
  }
}

function naoConsultou(ctx: CtxTrevo, o: string): Parcial {
  return {
    nivel: 'nao_confirmado',
    titulo: `Não verificado: ${o}`,
    explicacao: 'Não foi possível consultar o banco nesta execução. Sem consulta não há evidência — e "não sei ainda" nunca é tratado como OK.',
    resultadoObservado: `consulta falhou: ${ctx.erroPostura ?? 'sem resposta'}`,
    acaoRecomendada: 'Conferir se a função guardiao_postura existe no Supabase e se a SUPABASE_SERVICE_KEY está válida.',
  };
}

/** Avaliação pura (sem rede): é o que os testes exercitam. */
export function avaliarPostura(ctx: CtxTrevo): { funcoes: Parcial; rls: Parcial } {
  const p = ctx.postura;
  if (!p) return { funcoes: naoConsultou(ctx, 'funções de servidor fechadas ao público'), rls: naoConsultou(ctx, 'RLS em todas as tabelas') };

  let funcoes: Parcial;
  if (p.funcoes_expostas.length) {
    const lista = p.funcoes_expostas.map(f => `${f.fn} (${f.roles.join('/')})`).join('; ');
    funcoes = {
      nivel: 'violacao',
      titulo: `${p.funcoes_expostas.length} função(ões) de servidor aberta(s) ao público`,
      explicacao: 'Estas funções só deveriam ser chamadas pelo servidor do site, mas qualquer visitante da internet consegue chamá-las direto. Dependendo da função, isso permite registrar compra falsa, encerrar sorteio ou aprovar depoimento sem ser administrador.',
      resultadoObservado: lista,
      acaoRecomendada: 'REVOKE EXECUTE ON FUNCTION <função> FROM PUBLIC, anon, authenticated; e GRANT EXECUTE apenas para service_role.',
    };
  } else if (p.funcoes_ausentes.length) {
    funcoes = {
      nivel: 'nao_confirmado',
      titulo: 'Função vigiada não existe mais no banco',
      explicacao: 'Uma função da lista de vigilância sumiu (renomeada ou apagada). Enquanto a lista não for atualizada, o que ela protegia deixa de ser vigiado — e vigilância perdida não é OK.',
      resultadoObservado: `ausentes: ${p.funcoes_ausentes.join(', ')}`,
      acaoRecomendada: 'Atualizar FUNCOES_SENSIVEIS em guardiao/catalogo-3trevo.ts com o nome atual.',
    };
  } else {
    funcoes = {
      nivel: 'confirmado',
      titulo: `As ${FUNCOES_SENSIVEIS.length} funções de servidor estão fechadas ao público`,
      explicacao: 'Nenhuma das funções sensíveis pode ser chamada por visitante ou por usuário logado comum; só o servidor do site consegue.',
      resultadoObservado: `0 de ${FUNCOES_SENSIVEIS.length} expostas`,
    };
  }

  const rls: Parcial = p.tabelas_sem_rls.length
    ? {
        nivel: 'violacao',
        titulo: `${p.tabelas_sem_rls.length} tabela(s) sem proteção de linha (RLS)`,
        explicacao: 'Estas tabelas estão sem a trava que impede o público de ler ou alterar linhas direto pelo endereço do banco. A regra do projeto é: nenhuma exceção.',
        resultadoObservado: p.tabelas_sem_rls.join(', '),
        acaoRecomendada: 'ALTER TABLE <tabela> ENABLE ROW LEVEL SECURITY;',
      }
    : {
        nivel: 'confirmado',
        titulo: 'Todas as tabelas públicas têm RLS ligado',
        explicacao: 'Cada tabela exposta pela API tem a trava de linha ativa.',
        resultadoObservado: '0 tabelas sem RLS',
      };

  return { funcoes, rls };
}

export const CATALOGO: Invariante<CtxTrevo>[] = [
  {
    id: 'funcoes_servidor_fechadas',
    categoria: 'Segurança',
    regra: 'funções de servidor (compra, sorteio, moderação) não são executáveis por PUBLIC/anon/authenticated — só service_role',
    resultadoEsperado: '0 funções sensíveis expostas, 0 ausentes',
    impacto: ['Integridade do sorteio', 'Registro de compras/cotas', 'Moderação de depoimentos'],
    executar: ctx => avaliarPostura(ctx).funcoes,
  },
  {
    id: 'rls_em_todas_as_tabelas',
    categoria: 'Segurança',
    regra: 'RLS habilitado em TODA tabela do schema public, sem exceção (SECURITY-BASELINE-TT.md)',
    resultadoEsperado: '0 tabelas públicas sem RLS',
    impacto: ['Dados de clientes, pedidos e leads'],
    executar: ctx => avaliarPostura(ctx).rls,
  },
];

export const IDS_CONTRATADOS = ['funcoes_servidor_fechadas', 'rls_em_todas_as_tabelas'];
