/**
 * guardiao/engine.ts — Três Trevo Worker
 *
 * GUARDIÃO (protocolo G-001..G-005, comum a todos os projetos TT). Cópia
 * ADAPTADA do motor criado no Amigo Entregador (`guardiao/engine.js`); a
 * origem é lá, o uso é de todos os projetos. Se um princípio mudar num, mude
 * nos outros — hoje são cópias, não pacote compartilhado.
 *
 * O que foi mantido (é o que faz o Guardião ser o Guardião):
 *   - 4 níveis: 🔴 violação · 🟠 divergente · 🟡 não confirmado · 🟢 confirmado
 *   - "não sei ainda" NUNCA vira OK: requisito ausente, consulta que falhou e
 *     nível desconhecido são 🟡. Exceção dentro do check é 🟠 (falhar ao rodar
 *     não é o mesmo que não ter rodado).
 *   - o motor percorre a lista CONTRATADA, não a do catálogo: invariante
 *     prometido e removido aparece como 🔴, não some.
 *   - meta-check `catalogo_integro`: contrato == catálogo, sem ausente/duplicado/
 *     não declarado.
 *   - padrão histórico (persistente/recorrente/oscilante/resolvido...).
 *
 * O que mudou de propósito:
 *   - checks são ASSÍNCRONOS (aqui a evidência vem de fetch, não de módulos JS).
 *   - sem guarda de escrita em localStorage e sem `ambiente_sem_escrita`: um
 *     Worker não tem localStorage. Em troca, todo check aqui é SOMENTE LEITURA
 *     por construção (só consulta) — regra do catálogo, não do motor.
 *   - `modulos` do original virou `requer`: chaves do contexto que precisam
 *     estar presentes para o check poder rodar.
 */

export type Nivel = 'violacao' | 'divergente' | 'nao_confirmado' | 'confirmado';

export interface Parcial {
  nivel: Nivel;
  titulo: string;
  explicacao: string;
  resultadoObservado: string;
  acaoRecomendada?: string | null;
}

export interface Invariante<C> {
  id: string;
  categoria: string;
  regra: string;
  resultadoEsperado: string;
  impacto: string[];
  /** Chaves do contexto que precisam ser "truthy" para o check rodar. */
  requer?: (keyof C)[];
  executar: (ctx: C) => Promise<Parcial> | Parcial;
}

export interface Resultado extends Parcial {
  id: string;
  categoria: string;
  quando: string;
  regra: string;
  resultadoEsperado: string;
  impacto: string[];
}

export const NIVEL_ORDEM: Record<Nivel, number> = { violacao: 0, divergente: 1, nao_confirmado: 2, confirmado: 3 };
export const NIVEL_ICONE: Record<Nivel, string> = { violacao: '🔴', divergente: '🟠', nao_confirmado: '🟡', confirmado: '🟢' };

export function statusGeral(resultados: Pick<Resultado, 'nivel'>[]): { status: string; icone: string; titulo: string; texto: string } {
  const tem = (n: Nivel) => resultados.some(x => x.nivel === n);
  if (tem('violacao')) return { status: 'bloqueio', icone: '🔴', titulo: 'BLOQUEIO — regra protegida contrariada', texto: 'Pelo menos uma regra protegida foi contrariada. Corrija antes de seguir em frente.' };
  if (tem('divergente')) return { status: 'nao_concluido', icone: '🟠', titulo: 'NÃO CONCLUÍDO — revisar itens divergentes', texto: 'Um item não pôde ser avaliado ou não bate com o esperado.' };
  if (tem('nao_confirmado')) return { status: 'atencao', icone: '🟡', titulo: 'ATENÇÃO — parte do contrato sem evidência', texto: "Nada quebrado, mas nem tudo foi verificado nesta execução — 'não sei ainda' não é 'OK'." };
  return { status: 'ok', icone: '🟢', titulo: 'OK — todo o contrato verificado confirma', texto: 'Todos os invariantes contratados foram verificados e bateram.' };
}

// ─── PADRÃO HISTÓRICO (portado sem alteração de regra) ───────────────────────
export interface ExecucaoHistorica { resultados: { id: string; nivel: Nivel }[] }
export type Padrao =
  | { tipo: 'oscilante'; mudancas: number; de: Nivel }
  | { tipo: 'primeira_ocorrencia' | 'regrediu' | 'resolvido' | 'melhorou'; de: Nivel }
  | { tipo: 'persistente'; execucoes: number }
  | { tipo: 'recorrente'; vezes: number }
  | { tipo: 'estavel' };

function ocorrenciasDe(id: string, historico: ExecucaoHistorica[]): Nivel[] {
  const lista: Nivel[] = [];
  for (const h of historico || []) {
    const item = (h.resultados || []).find(x => x.id === id);
    if (item) lista.push(item.nivel);
  }
  return lista;
}
function contarMudancas(seq: Nivel[]): number {
  let n = 0;
  for (let i = 1; i < seq.length; i++) if (seq[i] !== seq[i - 1]) n++;
  return n;
}
const problematico = (n: Nivel) => n !== 'confirmado';

export function classificarPadrao(id: string, nivelAtual: Nivel, historico: ExecucaoHistorica[]): Padrao | null {
  const oc = ocorrenciasDe(id, historico);
  if (!oc.length) return null;
  const ultimo = oc[oc.length - 1];
  const ordAtual = NIVEL_ORDEM[nivelAtual], ordUltimo = NIVEL_ORDEM[ultimo];
  const problematicasAntes = oc.filter(problematico).length;
  const mudancas = contarMudancas([...oc, nivelAtual]);
  if (mudancas >= 3 && problematico(nivelAtual)) return { tipo: 'oscilante', mudancas, de: ultimo };
  if (ordAtual < ordUltimo) return problematicasAntes === 0 ? { tipo: 'primeira_ocorrencia', de: ultimo } : { tipo: 'regrediu', de: ultimo };
  if (ordAtual > ordUltimo) return nivelAtual === 'confirmado' ? { tipo: 'resolvido', de: ultimo } : { tipo: 'melhorou', de: ultimo };
  if (problematico(nivelAtual)) {
    if (problematicasAntes === oc.length) return { tipo: 'persistente', execucoes: oc.length + 1 };
    return { tipo: 'recorrente', vezes: problematicasAntes + 1 };
  }
  return { tipo: 'estavel' };
}

export function calcularRisco(id: string, nivelAtual: Nivel, historico: ExecucaoHistorica[]) {
  const oc = ocorrenciasDe(id, historico);
  if (oc.length < 2) return null;
  const seq = [...oc, nivelAtual];
  const mudancas = contarMudancas(seq);
  return { execucoes: seq.length, mudancas, problematicas: seq.filter(problematico).length, instabilidade: mudancas / (seq.length - 1) };
}

// ─── EXECUTOR ────────────────────────────────────────────────────────────────
type Definicao = Pick<Invariante<never>, 'id' | 'categoria' | 'regra' | 'resultadoEsperado' | 'impacto'>;

function montar(def: Definicao, quando: string, parcial: Parcial): Resultado {
  // Nível desconhecido NUNCA vira silêncio: sem nível não há veredito, e um
  // resultado invisível para statusGeral produziria um falso verde por omissão.
  if (!Object.prototype.hasOwnProperty.call(NIVEL_ICONE, parcial.nivel)) {
    parcial = {
      nivel: 'nao_confirmado',
      titulo: parcial.titulo || `Check devolveu resultado sem nível: ${def.id}`,
      explicacao: 'O check rodou mas não declarou em que estado terminou. Sem nível não há veredito — tratado como não confirmado, nunca como OK.',
      resultadoObservado: `nível devolvido: ${String(parcial.nivel)}`,
      acaoRecomendada: `Revisar o retorno de ${def.id} no catálogo: todo caminho precisa devolver nivel.`,
    };
  }
  return { ...parcial, id: def.id, categoria: def.categoria, quando, regra: def.regra, resultadoEsperado: def.resultadoEsperado, impacto: def.impacto };
}

/** Sempre devolve um resultado por invariante contratado + o meta-check catalogo_integro. */
export async function verificar<C extends object>(ctx: C, catalogo: Invariante<C>[], idsContratados: string[]): Promise<Resultado[]> {
  const quando = new Date().toISOString();
  const porId = new Map<string, Invariante<C>>();
  const duplicados: string[] = [];
  for (const def of catalogo) {
    if (porId.has(def.id)) duplicados.push(def.id); else porId.set(def.id, def);
  }

  const resultados: Resultado[] = [];
  for (const id of idsContratados) {
    const def = porId.get(id);
    if (!def) {
      resultados.push(montar(
        { id, categoria: 'Catálogo', regra: 'invariante declarado como contratado deve existir no catálogo', resultadoEsperado: 'entrada presente', impacto: ['Integridade do próprio Guardião'] },
        quando,
        {
          nivel: 'violacao',
          titulo: `Invariante contratado não existe no catálogo do Guardião: ${id}`,
          explicacao: 'O contrato afirma que este invariante é protegido, mas o Guardião não tem nenhum check com esse id. O sistema está afirmando mais do que verifica.',
          resultadoObservado: 'ausente do catálogo',
          acaoRecomendada: 'Restaurar o check no catálogo, ou remover o id dos contratados explicando por quê.',
        },
      ));
      continue;
    }

    const faltando = (def.requer ?? []).filter(k => !ctx[k]);
    if (faltando.length) {
      resultados.push(montar(def, quando, {
        nivel: 'nao_confirmado',
        titulo: `Não verificado: falta configuração — ${def.id}`,
        explicacao: `Este invariante depende de ${faltando.map(String).join(', ')}, que não está disponível nesta execução. Não foi verificado, e por isso não pode ser tratado como saudável.`,
        resultadoObservado: `faltando: ${faltando.map(String).join(', ')}`,
      }));
      continue;
    }

    try {
      resultados.push(montar(def, quando, await def.executar(ctx)));
    } catch (e) {
      // Falhar ao rodar é diferente de não ter rodado: 🟠, não 🟡.
      resultados.push(montar(def, quando, {
        nivel: 'divergente',
        titulo: `O check lançou exceção ao ser executado: ${def.id}`,
        explicacao: 'O invariante não pôde ser avaliado porque o próprio check quebrou. A proteção não está funcionando.',
        resultadoObservado: `exceção: ${(e as Error)?.message ?? String(e)}`,
        acaoRecomendada: `Revisar o check ${def.id} e o que ele consulta.`,
      }));
    }
  }

  // META-CHECK: integridade do próprio catálogo.
  const idsCatalogo = catalogo.map(d => d.id);
  const naoContratados = idsCatalogo.filter(id => !idsContratados.includes(id));
  const ausentes = idsContratados.filter(id => !porId.has(id));
  const integro = !ausentes.length && !naoContratados.length && !duplicados.length;
  resultados.push(montar(
    {
      id: 'catalogo_integro', categoria: 'Catálogo',
      regra: 'o conjunto de checks tem que ser exatamente o conjunto de invariantes declarado no contrato — sem ausentes, sem duplicados, sem check não declarado',
      resultadoEsperado: `${idsContratados.length} invariantes, 0 ausentes, 0 duplicados, 0 não declarados`,
      impacto: ['Integridade do próprio Guardião', 'Validade das outras verificações'],
    },
    quando,
    {
      nivel: integro ? 'confirmado' : 'violacao',
      titulo: integro ? `Catálogo íntegro: os ${idsContratados.length} invariantes contratados existem e foram avaliados` : 'Catálogo divergente do contrato',
      explicacao: integro
        ? 'O contrato declara exatamente os invariantes que o Guardião executa: nenhum sumiu em silêncio.'
        : 'O que o contrato promete e o que o Guardião executa não são a mesma coisa. Pode haver regra prometida que ninguém está checando.',
      resultadoObservado: integro
        ? `${idsContratados.length}/${idsContratados.length} presentes`
        : `ausentes: ${ausentes.join(', ') || 'nenhum'}; não declarados: ${naoContratados.join(', ') || 'nenhum'}; duplicados: ${duplicados.join(', ') || 'nenhum'}`,
      acaoRecomendada: integro ? null : 'Reconciliar o catálogo com a lista de invariantes contratados.',
    },
  ));

  return resultados.sort((a, b) => NIVEL_ORDEM[a.nivel] - NIVEL_ORDEM[b.nivel]);
}
