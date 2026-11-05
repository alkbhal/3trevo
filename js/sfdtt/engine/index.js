import { fmt, thisM, curDay, daysInM, dayOfStr } from "../utils/index.js";
import { G, AM, RD, BL, PU, TL, GO, RO, MT } from "../constants.js";
import { calcJurosAtraso } from "./fiscal.js";

export { GRUPOS_BASE } from "./grupos.js";

// ─── Helpers de mês ──────────────────────────────────────────────────────────
export function getMes(lancs, mes) {
  // Suporta tanto data (YYYY-MM-DD) quanto mes (YYYY-MM) para retrocompatibilidade
  return lancs.filter(l => {
    const m = l.data?.slice(0, 7) || l.mes;
    return m === mes;
  });
}

// ─── Cálculos de fluxo ───────────────────────────────────────────────────────
export function calcEntradas(lancs, mes) {
  return getMes(lancs, mes)
    .filter(l => l.tipo === "entrada")
    .reduce((s, l) => s + (l.valor || 0), 0);
}

export function calcSaidas(lancs, mes) {
  return getMes(lancs, mes)
    // TRANSFER = pagamento de fatura; indisponivel = bloqueio judicial ou ajuste — nenhum é gasto
    .filter(l => l.tipo === "saida" && l.transaction_type !== "TRANSFER" && !l.indisponivel)
    .reduce((s, l) => s + (l.valor || 0), 0);
}

// ─── Visão Anual ─────────────────────────────────────────────────────────────
export function calcAnual(lancs, ano) {
  const meses = Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, "0")}`);
  const linhas = meses.map(mes => {
    const entradas  = calcEntradas(lancs, mes);
    const saidas    = calcSaidas(lancs, mes);
    const lancsMes  = getMes(lancs, mes);
    const porGrupo  = {};
    for (const l of lancsMes.filter(l => l.tipo === "saida" && l.transaction_type !== "TRANSFER")) {
      const g = l.grupoId || "outros";
      porGrupo[g] = (porGrupo[g] || 0) + (l.valor || 0);
    }
    return { mes, entradas, saidas, saldo: entradas - saidas, lancamentos: lancsMes.length, porGrupo };
  });

  const totalEntradas = linhas.reduce((s, l) => s + l.entradas, 0);
  const totalSaidas   = linhas.reduce((s, l) => s + l.saidas,   0);
  const mediaEntradas = totalEntradas / 12;
  const mediaSaidas   = totalSaidas   / 12;
  const mesesComDados = linhas.filter(l => l.lancamentos > 0).length;

  return { meses: linhas, totalEntradas, totalSaidas, saldoAnual: totalEntradas - totalSaidas, mediaEntradas, mediaSaidas, mesesComDados };
}

// ─── % do salário consumido por um valor ─────────────────────────────────────
export function calcSalaryPct(valor, salario) {
  if (!salario || salario <= 0) return null;
  return +((valor / salario) * 100).toFixed(1);
}

// ─── Saldo de cartões a partir dos lançamentos (ledger unificado) ─────────────
export function calcSaldoCartao(lancs, mes) {
  const items = mes ? getMes(lancs, mes) : lancs;
  const gastos    = items.filter(l => l.account_type === "cartao" && l.tipo === "saida" && l.transaction_type !== "TRANSFER").reduce((s, l) => s + (l.valor || 0), 0);
  const pagamentos = lancs.filter(l => l.transaction_type === "TRANSFER" && l.account_to === "cartao" && (!mes || (l.data?.slice(0,7)||l.mes) === mes)).reduce((s, l) => s + (l.valor || 0), 0);
  return gastos - pagamentos; // valor devedor do cartão
}

export function calcComparativo(lancs, mes, mesPrev) {
  const entAtual = calcEntradas(lancs, mes);
  const saiAtual = calcSaidas(lancs, mes);
  const entPrev  = calcEntradas(lancs, mesPrev);
  const saiPrev  = calcSaidas(lancs, mesPrev);
  const temDados = getMes(lancs, mesPrev).length > 0;
  const diffSai  = saiAtual - saiPrev;
  const pctSai   = saiPrev > 0 ? (diffSai / saiPrev) * 100 : null;
  const diffEnt  = entAtual - entPrev;
  const pctEnt   = entPrev > 0 ? (diffEnt / entPrev) * 100 : null;
  return { diffSai, pctSai, diffEnt, pctEnt, temDados, mesPrev, saiPrev, entPrev };
}

export function calcParcelas(dividas) {
  return dividas
    .filter(d => d.status !== "quitada")
    .reduce((s, d) => s + (d.parcela || 0), 0);
}

// Compromisso RECORRENTE: dívidas com mais de 1 parcela restante — o que se repete
// todo mês e projeta capacidade futura (usado em comprometimento/IRF).
// Distingue de uma dívida com parcelasRestantes<=1, cujo "parcela" é o valor de
// LIQUIDAÇÃO de uma vez (às vezes ~= saldo inteiro), não um fluxo mensal recorrente —
// somar os dois como se fossem a mesma coisa infla o comprometimento indefinidamente
// até a liquidação acontecer, mesmo quando ela é pontual.
export function calcParcelasRecorrentes(dividas) {
  return dividas
    .filter(d => d.status !== "quitada" && (d.parcelasRestantes || 0) > 1)
    .reduce((s, d) => s + (d.parcela || 0), 0);
}

// Compromisso de LIQUIDAÇÃO: última parcela (ou parcela única) restante — dinheiro
// real devido este mês, mas que não se repete no próximo (some do recorrente após
// pago). Não deve entrar no comprometimento/IRF (métricas de sustentabilidade
// contínua), mas conta no fluxo de caixa real do mês (livreAposParcelas).
export function calcParcelasLiquidacao(dividas) {
  return dividas
    .filter(d => d.status !== "quitada" && (d.parcelasRestantes || 0) <= 1)
    .reduce((s, d) => s + (d.parcela || 0), 0);
}

// Pagamento único (arresto/bloqueio judicial de valores, indenização à vista,
// boleto avulso...) não é despesa recorrente mensal — rotular como "R$ X/mês"
// nesse caso é enganoso e faz parecer que o valor se repete todo mês quando na
// verdade é um evento pontual (achado real de usuário: arresto judicial de
// ~R$6k reaparecendo mês a mês na interface). Mesmo critério de totalParc do
// calcParcelasLiquidacao acima, só que pra rotulagem em vez de soma.
export function isPagamentoUnico(d, totalParc) {
  return d.tipo !== 'assinatura' && totalParc <= 1;
}

export function calcInadimplente(dividas) {
  return dividas
    .filter(d => d.status === "inadimplente" || d.status === "vencida")
    .reduce((s, d) => s + (d.saldo || 0), 0);
}

export function calcFaturaCartoes(cartoes, mes) {
  return cartoes.reduce((s, c) => {
    const gastosMes = (c.gastos || [])
      .filter(g => g.mes === mes)
      .reduce((t, g) => t + (g.valor || 0), 0);
    return s + gastosMes;
  }, 0);
}

// ─── Estado e nível ───────────────────────────────────────────────────────────
// entradas e dividas são opcionais — permitem cálculo proporcional dívida/renda
// Comprometimento da renda: (saídas + parcelas RECORRENTES) / entradas. Fonte
// única — antes calculada inline, diferente, em 5 lugares de App.jsx. Usa só o
// recorrente, não o total de parcelas: uma liquidação pontual (ex: quitar de
// vez uma cobrança judicial) não é padrão de gasto que se repete todo mês e
// não deveria inflar essa métrica de sustentabilidade contínua.
export function calcComprometimento(entradas, saidas, parcelasRecorrentes) {
  return entradas > 0 ? (saidas + parcelasRecorrentes) / entradas : 0;
}

// Faixas únicas de comprometimento — fonte única dos cortes usados em
// calcEstado e em qualquer tela que classifique o mesmo número (antes 4
// conjuntos de faixas diferentes: .9/.65/.4, 90/70, 80/60, 30/50).
export const COMP_CRITICO = 0.9;
export const COMP_ALERTA  = 0.65;
export const COMP_ATENCAO = 0.4;

export function calcEstado(comp, inad, entradas = 0, dividas = []) {
  const dividaTotal = dividas.reduce((s, d) => s + ((d.status !== 'quitada' ? d.saldo : 0) || 0), 0);
  const ratioDivRenda = entradas > 0 ? dividaTotal / (entradas * 12) : 0;

  if (inad > 0 && ratioDivRenda > 2)    return { id: "colapso",       label: "Colapso Estrutural", cor: "#ff0040" };
  if (inad > 0 && comp > COMP_CRITICO)  return { id: "pre_colapso",   label: "Pré-Colapso",        cor: "#ff0040" };
  if (inad > 0 || comp > COMP_CRITICO)  return { id: "sobrevivencia", label: "Sobrevivência",      cor: RD };
  if (comp > COMP_ALERTA)                return { id: "reorganizacao", label: "Reorganização",      cor: AM };
  if (comp > COMP_ATENCAO)               return { id: "atencao",       label: "Atenção",            cor: GO };
  return                                        { id: "crescimento",   label: "Crescimento",        cor: G  };
}

export function calcNivel(resultadoMes) {
  if (resultadoMes < 0)    return { nivel: 0, label: "Déficit",       desc: "Corte e renegociação agora.",          cor: RD, escudo: "🪵" };
  if (resultadoMes <= 200) return { nivel: 1, label: "Sobrevida",     desc: "Bola de neve: quite a menor dívida.",  cor: AM, escudo: "🛡"  };
  if (resultadoMes <= 500) return { nivel: 2, label: "Reorganização", desc: "Aplique 50/30/20 adaptado.",           cor: GO, escudo: "⚔️" };
  if (resultadoMes <= 1000) return { nivel: 3, label: "Estabilidade", desc: "Monte reserva de emergência.",         cor: TL, escudo: "🏰" };
  return                  { nivel: 4, label: "Expansão",     desc: "Invista o excedente.",                 cor: G,  escudo: "💎" };
}

// ─── Projeção dia a dia (FIX1: âncora saldoAtual; FIX2: recebimentos + assinaturas agendados) ─
export function calcProjecao(lancs, mes, saldoAtual, recebimentos, assinaturas) {
  const total      = daysInM(mes);
  const eMesAtual  = mes === thisM();
  const hoje       = eMesAtual ? curDay() : total;
  const mapa       = {};

  for (let i = 1; i <= total; i++) mapa[i] = { entradas: 0, saidas: 0, eventos: [] };

  getMes(lancs, mes).forEach(l => {
    const dataFluxo = l.vencimento || l.dataVencimento || l.dataPagamento || l.data;
    const d = dayOfStr(dataFluxo);
    if (!d || d < 1 || d > total) return;
    if (l.tipo === "entrada") mapa[d].entradas += (l.valor || 0);
    // TRANSFER = pagamento de fatura: excluir para não double-contar com gastos do cartão
    else if (l.transaction_type !== "TRANSFER") mapa[d].saidas += (l.valor || 0);
    mapa[d].eventos.push(l);
  });

  if (eMesAtual) {
    // Injeta recebimentos agendados nos dias futuros — só renda CERTA (CLT,
    // contrato). Renda incerta (freela/PJ) não sustenta projeção de saldo:
    // contá-la aqui esconderia um "saldo fica negativo" real caso ela não entre.
    if (recebimentos) {
      recebimentos.filter(r => r.confiabilidade !== 'incerta').forEach(r => {
        const d = parseInt(r.dia);
        if (!d || d <= hoje || d > total) return;
        // Só injeta se não houver lançamento já confirmado no mesmo dia com mesma descrição
        const jaLancado = mapa[d].eventos.some(e => e.tipo === 'entrada' && e.desc === (r.descricao || 'Recebimento'));
        if (jaLancado) return;
        mapa[d].entradas += (r.valor || 0);
        mapa[d].eventos.push({ tipo: "entrada", desc: r.descricao || "Recebimento", valor: r.valor, _agendado: true });
      });
    }
    // Injeta assinaturas futuras que ainda não foram lançadas este mês
    if (assinaturas) {
      assinaturas.forEach(a => {
        const d = parseInt(a.dia) || 1;
        if (d <= hoje || d > total) return;
        const jaLancado = mapa[d].eventos.some(e => e.tipo === 'saida' && e.desc === a.nome);
        if (jaLancado) return;
        mapa[d].saidas += (a.valor || 0);
        mapa[d].eventos.push({ tipo: "saida", desc: a.nome, valor: a.valor, _agendado: true, grupoId: a.grupoId || 'g_assin' });
      });
    }
  }

  let saldo = saldoAtual || 0;
  const resultado      = [];
  let   diaZero        = null;
  const contasCriticas = [];

  if (eMesAtual) {
    for (let d = 1; d < hoje; d++) {
      resultado.push({ dia: d, saldo: null, entradas: mapa[d].entradas, saidas: mapa[d].saidas, eventos: mapa[d].eventos, passado: true });
    }
    resultado.push({ dia: hoje, saldo, entradas: mapa[hoje].entradas, saidas: mapa[hoje].saidas, eventos: mapa[hoje].eventos, hoje: true });
    for (let d = hoje + 1; d <= total; d++) {
      saldo += mapa[d].entradas - mapa[d].saidas;
      resultado.push({ dia: d, saldo, entradas: mapa[d].entradas, saidas: mapa[d].saidas, eventos: mapa[d].eventos });
      if (saldo < 0 && !diaZero) {
        diaZero = d;
        mapa[d].eventos.filter(e => e.tipo === "saida").forEach(e => contasCriticas.push(e));
      }
    }
  } else {
    for (let d = 1; d <= total; d++) {
      saldo += mapa[d].entradas - mapa[d].saidas;
      resultado.push({ dia: d, saldo, entradas: mapa[d].entradas, saidas: mapa[d].saidas, eventos: mapa[d].eventos });
      if (saldo < 0 && !diaZero) {
        diaZero = d;
        mapa[d].eventos.filter(e => e.tipo === "saida").forEach(e => contasCriticas.push(e));
      }
    }
  }

  return { resultado, diaZero, projecaoFinal: saldo, hoje, total, contasCriticas };
}

function _proximoMes(ym) {
  const [y, m] = ym.split('-').map(Number);
  const mm = m === 12 ? 1 : m + 1;
  const yy = m === 12 ? y + 1 : y;
  return `${yy}-${String(mm).padStart(2, '0')}`;
}

// ─── Projeção de fluxo de caixa em N dias (padrão 90) ────────────────────────
// Encadeia calcProjecao mês a mês em vez de duplicar a lógica de dia-a-dia —
// cada mês fechado vira o saldoAtual do próximo. Injeta parcelas de dívida
// futuras (injetarParcelasDividas), respeitando parcelasRestantes por mês
// (mesIndex) pra não fabricar parcela além do que a dívida realmente tem.
// Recebimentos/assinaturas agendados só se aplicam ao mês corrente — o mesmo
// limite que calcProjecao já tem (nenhuma renda futura é presumida recorrente
// além do que já está lançado/agendado).
export function calcProjecao90d(lancs, dividas, saldoAtual, recebimentos, assinaturas, dias = 90) {
  let mes          = thisM();
  let saldo        = saldoAtual || 0;
  const resultado  = [];
  let diaZero       = null;
  const contasCriticas = [];
  let diasAcumulados = 0;
  let mesIndex      = 0;

  while (diasAcumulados < dias) {
    const dividasAtivas   = (dividas || []).filter(d => (d.parcelasRestantes || 0) > mesIndex);
    const lancsComDividas = [...getMes(lancs, mes), ...injetarParcelasDividas(dividasAtivas, mes)];
    const proj = calcProjecao(lancsComDividas, mes, saldo, mesIndex === 0 ? recebimentos : null, mesIndex === 0 ? assinaturas : null);

    for (const dia of proj.resultado) {
      if (dia.passado || diasAcumulados >= dias) continue;
      diasAcumulados++;
      resultado.push({ ...dia, mes });
      if (dia.saldo != null && dia.saldo < 0 && diaZero === null) {
        diaZero = diasAcumulados;
        dia.eventos.filter(e => e.tipo === "saida").forEach(e => contasCriticas.push(e));
      }
    }

    saldo = proj.projecaoFinal;
    mes   = _proximoMes(mes);
    mesIndex++;
  }

  return { resultado, diaZero, projecaoFinal: saldo, dias, contasCriticas };
}

// ─── Semáforo J1/J2/J3 ───────────────────────────────────────────────────────
export function calcSemaforo(lancs, mes, saldoAtual, recebimentos) {
  if (mes !== thisM()) return null;

  const hoje    = curDay();
  // Só renda CERTA sustenta J1/J2 — um recebimento incerto no meio do
  // caminho não conta como "alívio" garantido no semáforo de segurança.
  const recs    = (recebimentos || []).filter(r => r.confiabilidade !== 'incerta').slice().sort((a, b) => a.dia - b.dia);
  let   proxRec = null;
  for (const r of recs) { if (r.dia > hoje) { proxRec = r; break; } }

  const lancMes = getMes(lancs, mes);
  let debAteRec = 0;
  // Com recebimento futuro: soma saídas entre hoje e o dia do recebimento
  // Sem recebimento futuro: soma todas as saídas futuras do mês (evita ilusão de saldo livre)
  lancMes
    .filter(l => {
      const d = dayOfStr(l.data);
      return l.tipo === "saida" && d > hoje && (proxRec ? d <= proxRec.dia : true);
    })
    .forEach(l => { debAteRec += (l.valor || 0); });

  const sJ1 = saldoAtual - debAteRec;
  const sJ2 = proxRec ? sJ1 + proxRec.valor : sJ1;
  // J3: saldoAtual já embute transações passadas; somamos apenas o que ainda vai acontecer
  // para não double-contar lançamentos que já movimentaram o banco.
  const totEFut = lancMes.filter(l => l.tipo === "entrada" && dayOfStr(l.data) > hoje).reduce((s, l) => s + (l.valor || 0), 0);
  const totSFut = lancMes.filter(l => l.tipo === "saida" && l.transaction_type !== "TRANSFER" && dayOfStr(l.data) > hoje).reduce((s, l) => s + (l.valor || 0), 0);
  const sJ3  = saldoAtual + totEFut - totSFut;

  const sc = v => v >= 0 ? "🟢" : v > -200 ? "🟡" : "🔴";
  const st = (v, p) => v >= 0 ? "Cobre até " + p : "Falta R$ " + fmt(Math.abs(v)) + " para " + p;

  return [
    { janela: "J1", label: "Hoje → próx. recebimento", saldo: sJ1, cor: sc(sJ1), status: proxRec ? st(sJ1, "dia " + proxRec.dia) : st(sJ1, "fim do mês") },
    { janela: "J2", label: "Após recebimento",          saldo: sJ2, cor: sc(sJ2), status: proxRec ? st(sJ2, "próx. vencimento") : "Nenhum recebimento agendado" },
    { janela: "J3", label: "Fechamento do mês",         saldo: sJ3, cor: sc(sJ3), status: st(sJ3, "fim do mês") },
  ];
}

// ─── Agrupamento e sugestões ─────────────────────────────────────────────────
export function calcPorGrupo(lancs, mes, grupos) {
  const r = {};
  grupos.forEach(g => { r[g.id] = 0; });
  getMes(lancs, mes).forEach(l => {
    // Mesmas exclusões de calcSaidas: só saídas reais, sem TRANSFER nem bloqueios
    if (l.tipo === "saida" && l.grupoId && r[l.grupoId] !== undefined
        && l.transaction_type !== "TRANSFER" && !l.indisponivel)
      r[l.grupoId] += (l.valor || 0);
  });
  return r;
}

export function calcSugestoes(lancs, grupos) {
  const outros = getMes(lancs, thisM()).filter(l => l.grupoId === "g_outros");
  if (outros.length < 2) return [];

  const dm = {};
  outros.forEach(l => {
    const k = (l.desc || "").toLowerCase().trim().slice(0, 20);
    if (!dm[k]) dm[k] = [];
    dm[k].push(l);
  });

  return Object.keys(dm).flatMap(k => {
    const v = dm[k];
    if (v.length < 2 || k.length <= 2) return [];
    const exists = grupos.some(g => g.nome.toLowerCase().includes(k.slice(0, 8)));
    if (exists) return [];
    return [{ key: k, items: v, total: v.reduce((s, l) => s + (l.valor || 0), 0), tipo: v[0].tipo, sugestaoNome: k.charAt(0).toUpperCase() + k.slice(1) }];
  });
}

// ─── Alertas ─────────────────────────────────────────────────────────────────
export function calcAlertas(estado, proj, resultadoMes, dividas, perfil, sugestoes, cartoes, mes) {
  const a   = [];
  const dep = (perfil?.dependentes) || 0;

  if (estado.id === "colapso")
    a.push({ nivel: "critico", icon: "☠", titulo: "Colapso Estrutural — inadimplência ativa", acao: "Ligue: 0800 644 6600. Nome e CPF. Defensoria." });

  if (proj.diaZero && proj.diaZero <= proj.total)
    a.push({ nivel: "critico", icon: "📉", titulo: "Saldo zera no dia " + proj.diaZero, acao: "Causa: " + (proj.contasCriticas.map(c => c.desc).join(", ") || "débitos do dia") });

  if (resultadoMes < (dep + 1) * 150 && resultadoMes >= 0)
    a.push({ nivel: "alto", icon: "🔴", titulo: "Resultado do mês crítico: R$ " + fmt(resultadoMes), acao: "R$ " + fmt(resultadoMes / Math.max(dep + 1, 1)) + " por pessoa. Suspenda não essenciais." });

  if (resultadoMes < 0)
    a.push({ nivel: "critico", icon: "🚨", titulo: "Resultado do mês negativo: R$ " + fmt(Math.abs(resultadoMes)), acao: "Saídas superam entradas. Revisão imediata." });

  dividas.filter(d => d.status === "vencida").forEach(d =>
    a.push({ nivel: "alto", icon: "⛔", titulo: d.nome + " — vencida", acao: "Regularizar antes de nova dívida." })
  );

  dividas.filter(d => d.status === "inadimplente").forEach(d =>
    a.push({ nivel: "critico", icon: "⚠", titulo: d.nome + " — inadimplente", acao: "Prioridade máxima de regularização." })
  );

  (cartoes || []).forEach(c => {
    const gastosMes = (c.gastos || []).filter(g => g.mes === mes).reduce((t, g) => t + (g.valor || 0), 0);
    if (!gastosMes) return;
    const diasVenc = c.diaVencimento - curDay();
    if (diasVenc >= 0 && diasVenc <= 7)
      a.push({ nivel: "alto",    icon: "💳", titulo: "Fatura " + c.nome + " vence em " + diasVenc + " dia" + (diasVenc === 1 ? "" : "s"), acao: "Fatura acumulada: R$ " + fmt(gastosMes) });
    else if (diasVenc < 0)
      a.push({ nivel: "critico", icon: "💳", titulo: "Fatura " + c.nome + " VENCIDA", acao: "Valor: R$ " + fmt(gastosMes) + ". Pague para evitar juros." });
  });

  sugestoes.forEach(s =>
    a.push({ nivel: "info", icon: "💡", titulo: '"' + s.sugestaoNome + '" aparece ' + s.items.length + "x em Outros", acao: "Criar grupo?", sugestao: s })
  );

  return a;
}

// ─── Próximo vencimento — data absoluta, injetável p/ testes ─────────────────
// @param diaVencimento — dia do mês (1-31)
// @param hoje — data de referência (default: agora). Injetável via parâmetro.
export function calcProximoVencimento(diaVencimento, hoje = new Date()) {
  const dia = parseInt(diaVencimento);
  if (!dia || dia < 1 || dia > 31) return null;

  const ano = hoje.getFullYear();
  const mes = hoje.getMonth(); // 0-indexed

  // Candidata no mês corrente
  let candidata = new Date(ano, mes, dia);

  // Se o dia já passou neste mês, avança para o próximo
  const hojeZero = new Date(ano, mes, hoje.getDate());
  if (candidata < hojeZero) {
    candidata = new Date(ano, mes + 1, dia);
  }

  // Dia inexistente no mês (ex: fev 31 → JS auto-corrige para mar)
  // Ajusta para o último dia do mês pretendido
  if (candidata.getDate() !== dia) {
    candidata = new Date(candidata.getFullYear(), candidata.getMonth(), 0);
  }

  return candidata.toISOString().slice(0, 10);
}

// ─── Detecta pagamento de uma dívida num mês — busca por _dividaId OU descrição ──
function _detectarPagamento(lancs, divida, mes, hojeStr) {
  const nomeLC = (divida.nome || '').toLowerCase();
  const nomeKey = nomeLC.slice(0, 12);
  return lancs.some(l => {
    if (l.tipo !== 'saida' || l._planejado) return false;
    const lMes = l.mes || (l.data || '').slice(0, 7);
    if (lMes !== mes) return false;
    if (hojeStr && l.data && l.data > hojeStr) return false;
    if (l._dividaId === divida.id) return true;
    if (nomeKey && l.desc && l.desc.toLowerCase().includes(nomeKey)) return true;
    return false;
  });
}

// ─── Atualiza status de dívidas com base na data real — injetável p/ testes ──
export function atualizarStatusDividas(dividas, hoje = new Date(), lancs = []) {
  const hojeZero  = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const mesAtual  = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  const hojeStr   = hojeZero.toISOString().slice(0, 10);

  const prevAno = hoje.getMonth() === 0 ? hoje.getFullYear() - 1 : hoje.getFullYear();
  const prevMes = hoje.getMonth() === 0 ? 12 : hoje.getMonth();
  const mesAnterior = `${prevAno}-${String(prevMes).padStart(2, '0')}`;

  const temLancamentos = lancs.length > 0;

  return dividas.map(d => {
    if (d.status === 'quitada') return d;

    // Pagamento único com data futura → em_dia
    if (d.dataVencimento) {
      const [y, m, day] = d.dataVencimento.split('-').map(Number);
      const dataVenc = new Date(y, m - 1, day);
      dataVenc.setHours(0, 0, 0, 0);
      const diasAtraso = Math.max(0, Math.floor((hojeZero - dataVenc) / 86_400_000));
      if (diasAtraso <= 0) {
        return { ...d, status: 'em_dia', diasAtraso: 0, proximoVencimento: d.dataVencimento,
          saldoReal: { total: d.saldo || 0, multa: 0, mora: 0, acrescimo: 0 } };
      }
      const pagou = _detectarPagamento(lancs, d, dataVenc.toISOString().slice(0, 7), hojeStr);
      if (pagou) return { ...d, status: 'em_dia', diasAtraso: 0, proximoVencimento: d.dataVencimento,
        saldoReal: { total: d.saldo || 0, multa: 0, mora: 0, acrescimo: 0 } };
      const status = diasAtraso <= 30 ? 'vencida' : 'inadimplente';
      const saldoReal = !d.isentoEncargos ? calcJurosAtraso(d.saldo || 0, diasAtraso, d.parcela || 0, d.juros || 0)
        : { total: d.saldo || 0, multa: 0, mora: 0, acrescimo: 0 };
      return { ...d, diasAtraso, status, saldoReal, proximoVencimento: d.dataVencimento };
    }

    if (!d.diaVencimento && !d.proximoVencimento) return d;

    // Pagamento detectado este mês (por _dividaId OU por nome da dívida no lançamento)
    if (_detectarPagamento(lancs, d, mesAtual, hojeStr)) {
      return { ...d, status: 'em_dia', diasAtraso: 0,
        saldoReal: { total: d.saldo || 0, multa: 0, mora: 0, acrescimo: 0 } };
    }

    // Dívida com parcelas pagas declaradas + sem evidência de não-pagamento nos lancs
    // → respeitar status em_dia (dívidas vindas do app/sync com histórico)
    if ((d.parcelasPagas || 0) > 0 && d.status === 'em_dia' && !temLancamentos) {
      return { ...d, diasAtraso: 0,
        saldoReal: { total: d.saldo || 0, multa: 0, mora: 0, acrescimo: 0 } };
    }

    // Calcular data de vencimento
    let dataVenc, proximoVencimento;
    const diaVenc = parseInt(d.diaVencimento) || 0;
    if (d.diaVencimento) {
      const diasNoMes  = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
      const diaEfetivo = Math.min(diaVenc, diasNoMes);
      dataVenc = new Date(hoje.getFullYear(), hoje.getMonth(), diaEfetivo);
      dataVenc.setHours(0, 0, 0, 0);
      proximoVencimento = calcProximoVencimento(diaVenc, hoje);
    } else {
      const [y, m, day] = d.proximoVencimento.split('-').map(Number);
      dataVenc = new Date(y, m - 1, day);
      dataVenc.setHours(0, 0, 0, 0);
      proximoVencimento = d.proximoVencimento;
    }

    let diasAtraso = Math.max(0, Math.floor((hojeZero - dataVenc) / 86_400_000));

    // Rollover: dia de vencimento deste mês ainda não passou, mas mês anterior não foi pago
    // SÓ aplica quando há lançamentos no sistema (senão respeita status declarado)
    const jaOverdue = d.status === 'vencida' || d.status === 'inadimplente';
    if (diasAtraso === 0 && temLancamentos && (jaOverdue || (d.parcelasPagas || 0) > 0)) {
      const pagouMesAnterior = _detectarPagamento(lancs, d, mesAnterior, null);
      if (!pagouMesAnterior) {
        const prevDiasNoMes  = new Date(prevAno, prevMes, 0).getDate();
        const prevDiaEfetivo = Math.min(diaVenc, prevDiasNoMes);
        const prevDataVenc   = new Date(prevAno, prevMes - 1, prevDiaEfetivo);
        prevDataVenc.setHours(0, 0, 0, 0);
        const atrasoRollover = Math.max(0, Math.floor((hojeZero - prevDataVenc) / 86_400_000));
        if (atrasoRollover > 0) diasAtraso = atrasoRollover;
      }
    }

    let status;
    if (diasAtraso <= 0)       status = 'em_dia';
    else if (diasAtraso <= 30) status = 'vencida';
    else                       status = 'inadimplente';

    const saldoReal = diasAtraso > 0 && !d.isentoEncargos
      ? calcJurosAtraso(d.saldo || 0, diasAtraso, d.parcela || 0, d.juros || 0)
      : { total: d.saldo || 0, multa: 0, mora: 0, acrescimo: 0 };

    return { ...d, diasAtraso, status, saldoReal, proximoVencimento };
  });
}

// ─── Injeta parcelas de dívidas na projeção de fluxo ─────────────────────────
// Retorna array de lançamentos sintéticos para uso em calcProjecao.
export function injetarParcelasDividas(dividas, mes) {
  const [anoMes, mesMes] = mes.split('-').map(Number);
  return (dividas || [])
    .filter(d => d.status !== 'quitada' && d.diaVencimento && (d.parcela || 0) > 0)
    .map(d => {
      const diaVenc    = parseInt(d.diaVencimento);
      const diasMes    = new Date(anoMes, mesMes, 0).getDate();
      const diaEfetivo = Math.min(diaVenc, diasMes);
      const data = `${anoMes}-${String(mesMes).padStart(2, '0')}-${String(diaEfetivo).padStart(2, '0')}`;
      return {
        id:        `_div_${d.id}_${mes}`,
        data,
        desc:      `Parcela: ${d.nome}`,
        valor:     d.parcela,
        tipo:      'saida',
        grupoId:   'g_obrig',
        _dividaId: d.id,
        _agendado: true,
      };
    });
}

// ─── Obrigações do mês ainda não pagas ────────────────────────────────────────
// "Disponível pra gastar" não é resultadoMes nem saldoAtual sozinhos — é
// saldoAtual menos o que ainda vai sair este mês e ainda não tem lançamento
// (dívida com parcela agendada, assinatura ainda não cobrada, despesa fixa do
// perfil ainda não lançada). Nunca estima: cada item vem de um dado real já
// cadastrado, igual à Lacuna de Confiabilidade — se não há dado, não entra.
const DESPESAS_FIXAS_PERFIL = [
  { campo: 'aluguel',    desc: 'Aluguel'    },
  { campo: 'aguaLuz',    desc: 'Água + luz' },
  { campo: 'mercado',    desc: 'Mercado'    },
  { campo: 'transporte', desc: 'Transporte' },
  { campo: 'saude',      desc: 'Saúde'      },
];

export function calcObrigacoesPendentes(dividas, assinaturas, perfil, lancs, mes) {
  const lancsMes = getMes(lancs, mes);
  const itens = [];

  injetarParcelasDividas(dividas, mes).forEach(sint => {
    const jaLancado = (lancs || []).some(l => l._dividaId === sint._dividaId && (l.mes || l.data?.slice(0, 7)) === mes);
    if (!jaLancado) itens.push({ nome: sint.desc, valor: sint.valor });
  });

  (assinaturas || []).forEach(a => {
    if (!(a.valor > 0)) return;
    const jaLancado = lancsMes.some(l => l.tipo === 'saida' && l.desc === a.nome);
    if (!jaLancado) itens.push({ nome: a.nome, valor: a.valor });
  });

  DESPESAS_FIXAS_PERFIL.forEach(({ campo, desc }) => {
    const valor = perfil?.[campo] || 0;
    if (valor <= 0) return;
    const jaLancado = lancsMes.some(l => l.tipo === 'saida' && l.desc === desc);
    if (!jaLancado) itens.push({ nome: desc, valor });
  });

  const total = itens.reduce((s, i) => s + i.valor, 0);
  return { total: Math.round(total * 100) / 100, itens };
}

// ─── PV de anuidade (Price) — saldo devedor real de parcelas futuras ─────────
// PMT × (1 - (1+i)^-n) / i  — valor presente das n parcelas restantes à taxa i
function pvAnuidade(pmt, n, i) {
  if (!i || i <= 0 || !n || n <= 0) return pmt * n;
  if (n === 1) return pmt / (1 + i);
  return pmt * (1 - Math.pow(1 + i, -n)) / i;
}

// ─── Dívidas — cálculo de parcela e saldo ─────────────────────────────────────
export function calcDivida(form) {
  // Assinatura é despesa recorrente perpétua, não dívida com saldo devedor —
  // tratar como pvAnuidade(n=9999) inflaria o passivo em calcPatrimonioLiquido.
  if (form.tipo === 'assinatura') {
    const parcela = parseFloat(form.parcela) || 0;
    return { parcela, saldo: 0, valorTotal: 0, saldoDevedor: 0, totalPagamentos: 0, jurosTotal: 0 };
  }
  const pagas     = parseInt(form.parcelasPagas)     || 0;
  const restantes = parseInt(form.parcelasRestantes) || 0;
  const totalParc = pagas + restantes;
  const juros     = parseFloat(form.juros) || 0;
  const taxaMes   = juros / 100;

  let parcela, saldo, valorTotal, saldoDevedor, jurosTotal;

  if (form.parcela && parseFloat(form.parcela) > 0) {
    parcela       = parseFloat(form.parcela);
    saldoDevedor  = pvAnuidade(parcela, restantes, taxaMes);
    saldo         = Math.round(saldoDevedor * 100) / 100;
    valorTotal    = parseFloat(form.valorTotal) || Math.round(pvAnuidade(parcela, totalParc, taxaMes) * 100) / 100;
    jurosTotal    = Math.round(Math.max(0, (parcela * restantes) - saldoDevedor) * 100) / 100;
  } else {
    valorTotal    = parseFloat(form.valorTotal) || 0;
    parcela       = totalParc > 0 ? valorTotal / totalParc : 0;
    saldoDevedor  = pvAnuidade(parcela, restantes, taxaMes);
    saldo         = Math.round(saldoDevedor * 100) / 100;
    jurosTotal    = Math.round(Math.max(0, (parcela * restantes) - saldoDevedor) * 100) / 100;
  }

  return { parcela, saldo, valorTotal, saldoDevedor: saldo, totalPagamentos: Math.round(parcela * restantes * 100) / 100, jurosTotal };
}

// Saldo devedor após pagar 1 parcela — mesma lógica de valor presente (Price)
// usada em calcDivida na criação. Antes, registrarPagamento recalculava o
// saldo como parcela × parcelasRestantes (nominal, sem desconto), divergindo
// do saldo inicial (PV) a cada pagamento — inconsistência contábil real, não
// só de exibição.
export function calcSaldoAposPagamento(divida) {
  const restantes = Math.max(0, (divida.parcelasRestantes || 0) - 1);
  if (restantes <= 0) return 0;
  const taxaMes = (parseFloat(divida.juros) || 0) / 100;
  return Math.round(pvAnuidade(divida.parcela || 0, restantes, taxaMes) * 100) / 100;
}

// ─── Projeção de quitação de dívida ──────────────────────────────────────────
export function calcQuitacao(divida) {
  const meses = parseInt(divida.parcelasRestantes) || 0;
  if (meses <= 0) return { meses: 0, dataEstimada: 'Quitada', totalRestante: 0 };

  const hoje    = new Date();
  const dataQ   = new Date(hoje.getFullYear(), hoje.getMonth() + meses, 1);
  const dataEstimada = dataQ.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  return { meses, dataEstimada, totalRestante: divida.saldo || 0 };
}

// ─── Viabilidade de meta financeira ──────────────────────────────────────────
// Retorna { status, score, months_remaining, required_monthly, gap }
// status: "on_track" | "at_risk" | "unachievable" | "completed"
export function calcGoalViability(goal, avgMonthlySavings = 0) {
  const remaining = (goal.target_amount || 0) - (goal.accumulated_amount || 0);

  if (remaining <= 0) return { status: "completed", score: 100, months_remaining: 0, required_monthly: 0, gap: 0 };

  const avg = Math.max(0, avgMonthlySavings);

  if (goal.target_date) {
    const ms_remaining = new Date(goal.target_date) - Date.now();
    const months_remaining = Math.max(0, Math.round(ms_remaining / 2592000000)); // 30d em ms

    if (months_remaining === 0) {
      return { status: "unachievable", score: 0, months_remaining: 0, required_monthly: null, gap: null };
    }

    const required_monthly = +(remaining / months_remaining).toFixed(2);
    const gap = +(required_monthly - avg).toFixed(2);
    const ratio = avg / required_monthly;

    let status, score;
    if (ratio >= 1) {
      status = "on_track";
      score  = Math.min(100, +(ratio * 100).toFixed(1));
    } else if (gap / required_monthly <= 0.3) {
      status = "at_risk";
      score  = Math.max(10, +(ratio * 100).toFixed(1));
    } else {
      status = "unachievable";
      score  = Math.max(0, +(ratio * 100).toFixed(1));
    }

    return { status, score, months_remaining, required_monthly, gap };
  }

  // Sem prazo: estima meses ao ritmo atual
  if (avg <= 0) return { status: "at_risk", score: 20, months_remaining: null, required_monthly: null, gap: null };

  const months_remaining = Math.ceil(remaining / avg);
  return { status: "on_track", score: 75, months_remaining, required_monthly: +avg.toFixed(2), gap: 0 };
}

// ─── Ático — nome adaptado à bandeira institucional ──────────────────────────
export function nomeAtico(bandeira) {
  if (!bandeira) return 'Ático';
  if (bandeira === 'sicredi') return 'Ático · Sicredi';
  return 'Ático';
}
// Alias de retrocompatibilidade (remover após migração completa)
export const nomeAnjo = nomeAtico;

// ─── Exportar relatório mensal ────────────────────────────────────────────────
export function exportRelatorio(lancs, perfil, mes, grupos) {
  const entradas = calcEntradas(lancs, mes);
  const saidas   = calcSaidas(lancs, mes);
  const saldo    = entradas - saidas;
  const linhas   = [];
  linhas.push('RELATÓRIO FINANCEIRO — ' + mes);
  linhas.push('Gerado em ' + new Date().toLocaleDateString('pt-BR'));
  linhas.push('');
  linhas.push('RESUMO');
  linhas.push('Entradas:    R$ ' + fmt(entradas));
  linhas.push('Saídas:      R$ ' + fmt(saidas));
  linhas.push('Saldo fluxo: R$ ' + fmt(saldo));
  if (perfil && perfil.saldoAtual != null) linhas.push('Saldo conta: R$ ' + fmt(perfil.saldoAtual));
  if (grupos && grupos.length > 0) {
    const porGrupo = calcPorGrupo(lancs, mes, grupos);
    const comSaldo = grupos.filter(g => (g.tipo === 'saida' || g.tipo === 'ambos') && (porGrupo[g.id] || 0) > 0)
      .sort((a, b) => (porGrupo[b.id] || 0) - (porGrupo[a.id] || 0));
    if (comSaldo.length > 0) {
      linhas.push('');
      linhas.push('SAÍDAS POR GRUPO');
      comSaldo.forEach(g => linhas.push('  ' + g.icone + ' ' + g.nome + ': R$ ' + fmt(porGrupo[g.id])));
    }
  }
  const mesLancs = getMes(lancs, mes);
  if (mesLancs.length > 0) {
    linhas.push('');
    linhas.push('LANÇAMENTOS (' + mesLancs.length + ')');
    mesLancs.slice(0, 30).forEach(l => linhas.push('  ' + l.data + ' ' + (l.tipo === 'entrada' ? '+' : '-') + ' R$ ' + fmt(l.valor) + ' — ' + (l.desc || '')));
    if (mesLancs.length > 30) linhas.push('  ... e mais ' + (mesLancs.length - 30) + ' lançamentos');
  }
  return linhas.join('\n');
}

// ─── Ático — análise situacional por estado financeiro ───────────────────────
export function calcAtico(estadoId, proj, resultadoMes, perfil) {
  const n = perfil?.nome || "você";
  if (estadoId === "colapso")
    return { abertura: "Você abriu. Isso já é o primeiro movimento.", corpo: "Sei que olhar para esses números exige coragem, " + n + ". A dívida total ultrapassou 2× a renda anual — você precisa de apoio especializado gratuito.", acao: "Ligue agora: 0800 644 6600 (Procon) ou acesse serasa.com.br.", cor: "#ff0040" };
  if (estadoId === "pre_colapso")
    return { abertura: "Atenção, " + n + ".", corpo: "Despesas superam a renda e há dívidas em atraso. A situação é grave mas reversível — cada dia sem ação agrava os juros.", acao: "Priorize quitar a dívida vencida de menor valor para liberar fluxo.", cor: "#ff0040" };
  if (estadoId === "sobrevivencia")
    return { abertura: "Você está aqui.", corpo: "O mês está apertado. " + (proj.diaZero ? "Atenção: saldo pode zerar no dia " + proj.diaZero + "." : "Cada gasto conta agora."), acao: "Confira os lançamentos e suspenda o que puder.", cor: RD };
  if (estadoId === "reorganizacao")
    return { abertura: "Bom dia, " + n + ".", corpo: "Fluxo sob controle. Saldo projetado ao fim do mês: R$ " + fmt(proj.projecaoFinal) + ".", acao: "Registre os gastos de hoje.", cor: AM };
  if (estadoId === "atencao")
    return { abertura: "Bom dia.", corpo: "Tudo dentro do esperado. Fique de olho nos variáveis.", acao: "Revise os lançamentos em Outros.", cor: GO };
  return   { abertura: "Bom dia.", corpo: "Sistema equilibrado. Hora de avançar.", acao: "Veja Dívidas — o que pode quitar primeiro?", cor: G };
}
export const calcAnjo = calcAtico;

// ─── IRF — Índice de Resiliência Financeira (0–1000) ─────────────────────────
export function calcIRF(snapshot) {
  const { comp = 0, inad = 0, saldo = 0, gastosMes = 0, entradas = 0, parcelas = 0, mesesOk = 0 } = snapshot;
  const c1 = Math.round(200 * Math.max(0, 1 - comp));
  const c2 = inad > 0 ? 0 : 200;
  const cobertura = gastosMes > 0 ? saldo / gastosMes : saldo > 0 ? 3 : 0;
  const c3 = Math.min(200, Math.round(cobertura / 3 * 200));
  const c4 = Math.min(200, mesesOk * 40);
  const ratioParc = entradas > 0 ? parcelas / entradas : parcelas > 0 ? 1 : 0;
  const c5 = Math.round(200 * Math.max(0, 1 - ratioParc * 2));
  const score = Math.min(1000, c1 + c2 + c3 + c4 + c5);
  const label = score >= 800 ? 'Excelente' : score >= 600 ? 'Bom' : score >= 400 ? 'Regular' : score >= 200 ? 'Frágil' : 'Crítico';
  const cor = score >= 800 ? G : score >= 600 ? TL : score >= 400 ? AM : score >= 200 ? GO : RD;
  return { score, label, cor, breakdown: { c1, c2, c3, c4, c5 } };
}

// DDO — Dias Disponíveis de Operação
export function calcDDO(saldo, gastosMes, diasMes = 30) {
  if (gastosMes <= 0) return saldo > 0 ? 999 : 0;
  return Math.max(0, Math.floor(saldo / (gastosMes / diasMes)));
}

// ─── Fantasma — custo real das decisões financeiras ──────────────────────────
export function custoPrazer(valorItem, rendaMensal, horasSemanais = 40, disponivelMensal = null) {
  if (!rendaMensal || rendaMensal <= 0) return null;
  const horasMes = horasSemanais * 4.33;
  const diasTrab = horasSemanais / 5;

  const _frase = (h, sufixo = '') => {
    const d = h / diasTrab;
    if (h < 1)   return `${Math.round(h * 60)} min de trabalho${sufixo}`;
    if (d < 1)   return `${h.toFixed(1)}h de trabalho${sufixo}`;
    return `${d.toFixed(1)} dias de trabalho${sufixo}`;
  };

  const valorHora   = rendaMensal / horasMes;
  const horas       = valorItem / valorHora;
  const dias        = horas / diasTrab;
  const percentRenda = (valorItem / rendaMensal) * 100;

  // Modo 2: com perfil de gastos — usando só o que sobra (disponível líquido)
  let fraseComPerfil = null;
  if (disponivelMensal != null && disponivelMensal > 0) {
    const valorHoraLiq = disponivelMensal / horasMes;
    const horasLiq     = valorItem / valorHoraLiq;
    fraseComPerfil     = _frase(horasLiq, ' livre');
  }

  return {
    valorHora:    Math.round(valorHora * 100) / 100,
    horas:        Math.round(horas * 10) / 10,
    dias:         Math.round(dias * 10) / 10,
    percentRenda: Math.round(percentRenda * 10) / 10,
    frase:        _frase(horas),
    fraseComPerfil,
  };
}

// Custo temporal real de uma dívida — amortização Price com juros compostos
// saldoDivida = saldo devedor atual (principal)
// parcela = PMT fixo mensal
// taxaMensal = juros mensais (se disponível)
export function custoTemporalDivida(saldoDivida, parcela, taxaMensal = 0) {
  if (!parcela || parcela <= 0 || !saldoDivida || saldoDivida <= 0) return null;
  let meses, totalPago;
  if (taxaMensal > 0 && parcela > saldoDivida * taxaMensal) {
    meses = Math.ceil(Math.log(parcela / (parcela - saldoDivida * taxaMensal)) / Math.log(1 + taxaMensal));
    totalPago = parcela * meses;
  } else {
    meses = Math.ceil(saldoDivida / parcela);
    totalPago = parcela * meses;
  }
  const jurosTotal = Math.max(0, totalPago - saldoDivida);
  return { meses, totalPago: Math.round(totalPago * 100) / 100, jurosTotal: Math.round(jurosTotal * 100) / 100 };
}

// Economia real de antecipar 1 parcela usando juros compostos (Price)
// taxa padrão = CDI mensal ~1,14%/mês (mai/2025)
// Retorno sempre { economia, meses, aviso } — antes misturava número puro
// (2 branches) com objeto (2 branches), forçando cada call site a adivinhar
// o tipo (`typeof calc === 'number' ? calc : 0`) e escondendo o aviso.
export function calcEconomiaAntecipacao(saldoAtual, parcela, taxaMensal = 0.0114) {
  if (!saldoAtual || saldoAtual <= 0 || !parcela || parcela <= 0) return { economia: 0, meses: 0, aviso: null };
  if (taxaMensal <= 0) return { economia: 0, meses: 0, aviso: null };
  // Guard: parcela que não cobre juros mensais gera Math.log(≤0) → NaN
  if (parcela <= saldoAtual * taxaMensal) return { economia: 0, meses: Infinity, aviso: 'parcela não cobre juros mensais' };
  const mesesAtual = Math.ceil(Math.log(parcela / (parcela - saldoAtual * taxaMensal)) / Math.log(1 + taxaMensal));
  const saldoNovo  = Math.max(0, saldoAtual - parcela);
  if (saldoNovo <= 0) {
    const economia = Math.round((parcela * mesesAtual - saldoAtual) * 100) / 100;
    return { economia, meses: mesesAtual, aviso: null };
  }
  const guard = parcela - saldoNovo * taxaMensal;
  if (guard <= 0) return { economia: 0, meses: mesesAtual, aviso: 'parcela não cobre juros mensais após antecipação' };
  const mesesNovo  = Math.ceil(Math.log(parcela / guard) / Math.log(1 + taxaMensal));
  const totalAtual = parcela * mesesAtual;
  const totalNovo  = parcela + parcela * mesesNovo;
  const economia   = Math.max(0, Math.round((totalAtual - totalNovo) * 100) / 100);
  return { economia, meses: mesesNovo, aviso: null };
}

// ─── Simulador de estratégias de quitação (avalanche/bola-de-neve/híbrida) ───
// Mesma ordem já usada em R_DIVIDA_ORDEM (engine/decisao.js), reimplementada
// aqui como comparador puro em vez de importar (decisao.js exporta a REGRA
// completa com fundamentação/contraindicações — este simulador só precisa da
// ordem, chamá-lo a partir de decisao.js criaria acoplamento desnecessário).
// Mantém o mesmo critério: avalanche = maior taxa primeiro, bola de neve =
// menor saldo primeiro, híbrida = taxa > 5%/mês primeiro, resto por saldo.
// Recebe os objetos já mapeados por simularQuitacao — `.taxa` é fração
// pronta (0.12), não `.juros` em pontos (12) como no shape bruto de dívida.
function _ordenarPorEstrategia(dividas, estrategia) {
  if (estrategia === 'bola_de_neve')
    return [...dividas].sort((a, b) => (a.saldo || 0) - (b.saldo || 0));
  if (estrategia === 'hibrida') {
    const alta  = dividas.filter(d => d.taxa > 0.05).sort((a, b) => b.taxa - a.taxa);
    const resto = dividas.filter(d => d.taxa <= 0.05).sort((a, b) => (a.saldo || 0) - (b.saldo || 0));
    return [...alta, ...resto];
  }
  return [...dividas].sort((a, b) => b.taxa - a.taxa); // avalanche (padrão)
}

// Simula quitação mês a mês: paga parcela mínima em todas as dívidas ativas +
// aplica valorExtra inteiro na primeira dívida da ordem da estratégia (efeito
// cascata clássico — ao quitar uma, o extra passa pra próxima automaticamente
// no mês seguinte, porque ela sai da lista `restantes`). Dívida isenta
// (juros=0 — pensão/judicial, ver calcJurosAtraso) nunca acumula juros aqui,
// mesma regra do resto do motor: nunca fabricar taxa sem taxa de mercado real.
export function simularQuitacao(dividas, valorExtra = 0, estrategia = 'avalanche', mesesMax = 60) {
  const ativos = (dividas || [])
    .filter(d => d.status !== 'quitada' && (d.saldo || 0) > 0)
    .map(d => ({ nome: d.nome, saldo: d.saldo, parcela: d.parcela || 0, taxa: d.juros > 0 ? d.juros / 100 : 0 }));

  if (ativos.length === 0) return { estrategia, mesesParaQuitarTudo: 0, quitacoes: [], totalPago: 0, totalJuros: 0, dividasRestantes: 0 };

  const ordem   = _ordenarPorEstrategia(ativos, estrategia).map(d => d.nome);
  const saldos  = Object.fromEntries(ativos.map(d => [d.nome, d.saldo]));
  const parcela = Object.fromEntries(ativos.map(d => [d.nome, d.parcela]));
  const taxa    = Object.fromEntries(ativos.map(d => [d.nome, d.taxa]));

  let restantes  = [...ordem];
  let totalPago  = 0;
  let totalJuros = 0;
  const quitacoes = [];
  let mes = 0;

  while (restantes.length > 0 && mes < mesesMax) {
    mes++;
    restantes.forEach(nome => {
      const juros = saldos[nome] * taxa[nome];
      totalJuros += juros;
      saldos[nome] += juros;
    });
    restantes.forEach(nome => {
      const pgto = Math.min(parcela[nome], saldos[nome]);
      saldos[nome] -= pgto;
      totalPago += pgto;
    });
    if (valorExtra > 0) {
      const alvo = restantes.find(nome => saldos[nome] > 0);
      if (alvo) {
        const pgto = Math.min(valorExtra, saldos[alvo]);
        saldos[alvo] -= pgto;
        totalPago += pgto;
      }
    }
    restantes = restantes.filter(nome => {
      if (saldos[nome] > 0.01) return true;
      quitacoes.push({ nome, mes });
      return false;
    });
  }

  return {
    estrategia,
    mesesParaQuitarTudo: restantes.length === 0 ? mes : null,
    quitacoes,
    totalPago:        Math.round(totalPago * 100) / 100,
    totalJuros:        Math.round(totalJuros * 100) / 100,
    dividasRestantes: restantes.length,
  };
}

// ─── Patrimônio líquido — ativos rastreados menos passivos ───────────────────
// Soma saldoAtual (conta) + ativosExtras (perfil.ativos[] — imóvel/veículo/
// investimento/outro, cadastrados pelo usuário no Centro Contábil). Nunca
// fabrica um bem que o usuário não cadastrou — ativosExtras vazio/ausente
// mantém o comportamento antigo (só saldoAtual). Ver docs/AGENDA-CENTRO-CONTABIL.md item 6.
// Total de passivos: dívidas ativas (não quitadas), usando saldoReal.total
// quando existir (já inclui encargos/atraso calculados) ou saldo puro como
// fallback. Extraído de calcPatrimonioLiquido pra ser a ÚNICA fonte de "total
// de dívidas" — antes App.jsx tinha um reduce solto (sem filtrar quitada, sem
// saldoReal) que inflava/desalinhava o total mostrado em 4 lugares da tela.
export function calcTotalPassivos(dividas) {
  return (dividas || [])
    .filter(d => d.status !== 'quitada')
    .reduce((s, d) => s + ((d.saldoReal?.total ?? d.saldo) || 0), 0);
}

export function calcPatrimonioLiquido(saldoAtual, dividas, ativosExtras) {
  const somaExtras = (ativosExtras || []).reduce((s, a) => s + (a.valor || 0), 0);
  const ativos = (saldoAtual || 0) + somaExtras;
  const passivos = calcTotalPassivos(dividas);
  return {
    ativos: Math.round(ativos * 100) / 100,
    passivos: Math.round(passivos * 100) / 100,
    liquido: Math.round((ativos - passivos) * 100) / 100,
  };
}

// ─── Obrigações por natureza — comercial vs. judicial vs. fiscal ─────────────
// Mapeia o `tipo` já existente no formulário de dívida (App.jsx) pras 3
// naturezas. 'obrigacao_legal' = judicial (pensão, indenização — já existia).
// 'tributo_fiscal' = fiscal (imposto/tributo em atraso — tipo novo). Todo o
// resto (parcelado, cartão, financiamento, etc.) é comercial por padrão —
// nunca reclassifica sem o usuário ter marcado o tipo explicitamente.
//
// `isentoEncargos` (checkbox mais antigo, independente de `tipo`) também
// marca uma dívida como judicial/legal — App.jsx:2191 já trata os dois como
// sinônimos ("podem ficar fora de sincronia"). Sem checar os dois aqui, uma
// dívida judicial cadastrada via isentoEncargos (sem o `tipo` novo marcado)
// cai em "comercial" e nunca aparece no Centro Contábil como judicial —
// bug real reportado ao vivo.
const TIPOS_JUDICIAL = ['obrigacao_legal'];
const TIPOS_FISCAL   = ['tributo_fiscal'];

export function calcObrigacoesPorNatureza(dividas) {
  const ativas = (dividas || []).filter(d => d.status !== 'quitada');
  const grupos = { comercial: [], judicial: [], fiscal: [] };
  for (const d of ativas) {
    if (TIPOS_JUDICIAL.includes(d.tipo) || d.isentoEncargos) grupos.judicial.push(d);
    else if (TIPOS_FISCAL.includes(d.tipo)) grupos.fiscal.push(d);
    else grupos.comercial.push(d);
  }
  const soma = arr => Math.round(arr.reduce((s, d) => s + ((d.saldoReal?.total ?? d.saldo) || 0), 0) * 100) / 100;
  return {
    comercial: { total: soma(grupos.comercial), qtd: grupos.comercial.length },
    judicial:  { total: soma(grupos.judicial),  qtd: grupos.judicial.length },
    fiscal:    { total: soma(grupos.fiscal),    qtd: grupos.fiscal.length },
  };
}
