// SFDTT — motor do Ático (porte do núcleo L3.5 do repositório SFDTT, branch v8)
// Funções puras, sem DOM e sem rede. Usadas por atico/app.html, pelo leitor
// interativo do "Livre das Dívidas" e testadas em worker/tests/sfdtt-motor.test.ts.
//
// Regras herdadas do SFDTT (não negociáveis):
//  - nada é inventado: dívida sem taxa informada fica sem taxa (nunca 4%/mês "de chute");
//  - renda incerta nunca entra na base das projeções;
//  - perfil comportamental é derivado dos dados, nunca declarado pelo usuário;
//  - guardas universais (insolvência grave, renda de subsistência) bloqueiam
//    sugestões de investir ou quitar acelerado.
// Fórmulas do livro: capítulo 3 (juros compostos, Price, teto de 100%), 6 (parcela
// que cabe), 7 (mínimo existencial), 8 (escada) e 9 (reserva).

export const PARAMS = {
  minimoExistencial: 600,   // Decreto 11.567/2023, mantido pelo STF em 23/04/2026
  alertaSequestro: 0.30,    // capítulo 3
  tetoChequeEspecial: 0.08, // Resolução CMN 4.765/2019
  reservaInicial: 500,      // capítulo 9
};

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

// ─── Fórmulas do livro ───────────────────────────────────────────────────────
export function jurosCompostos(valor, taxa, meses) {
  return r2(num(valor) * Math.pow(1 + (Number(taxa) || 0), Math.max(0, meses | 0)));
}
export function tabelaJuros(valor, taxa, marcos = [1, 2, 3, 6, 12]) {
  return marcos.map((m) => {
    const divida = jurosCompostos(valor, taxa, m);
    const anterior = jurosCompostos(valor, taxa, m - 1);
    return { meses: m, divida, jurosDoMes: r2(divida - anterior) };
  });
}
export function taxaAnual(taxaMensal) { return Math.pow(1 + (Number(taxaMensal) || 0), 12) - 1; }
export function parcelaPrice(valor, taxa, n) {
  const pv = num(valor); n = Math.max(1, n | 0); const i = Number(taxa) || 0;
  if (i <= 0) return r2(pv / n);
  return r2((pv * i) / (1 - Math.pow(1 + i, -n)));
}
// Taxa mensal escondida numa proposta "n vezes de P" para uma dívida de valor PV.
export function taxaImplicita(valor, parcela, n) {
  const pv = num(valor), p = num(parcela); n = Math.max(1, n | 0);
  if (!pv || !p || p * n <= pv) return 0;
  let lo = 0, hi = 1;
  for (let k = 0; k < 200; k++) {
    const m = (lo + hi) / 2;
    if ((pv * m) / (1 - Math.pow(1 + m, -n)) < p) lo = m; else hi = m;
  }
  return (lo + hi) / 2;
}
// Lei 14.690/2023: juros + encargos do rotativo/parcelamento ≤ 100% do valor financiado (sem IOF).
export function tetoCartao(valorFinanciado, jurosCobrados) {
  const teto = r2(num(valorFinanciado));
  const cobrado = r2(num(jurosCobrados));
  return { teto, cobrado, excedente: r2(Math.max(0, cobrado - teto)), respeitado: cobrado <= teto };
}
export function sequestro(parcelas, rendaLiquida) {
  const renda = num(rendaLiquida);
  const pct = renda ? num(parcelas) / renda : (num(parcelas) ? 1 : 0);
  return { pct, dias: r2(pct * 30), alerta: pct > PARAMS.alertaSequestro };
}
export function minimoExistencial(rendaLiquida, parcelasConsumo) {
  const sobra = r2(num(rendaLiquida) - num(parcelasConsumo));
  return { sobra, minimo: PARAMS.minimoExistencial, abaixo: sobra < PARAMS.minimoExistencial };
}
export function parcelaQueCabe(rendaCerta, essencial, parcelasAtuais) {
  const teto = r2(Math.max(0, num(rendaCerta) - num(essencial) - num(parcelasAtuais)));
  return { teto, oferta: r2(teto * 2 / 3) };
}
export const ESCADA = [
  { fase: 1, nome: 'Fechando a conta', necessidades: 0.9, dividas: '5% a 10%', reserva: 'o que der' },
  { fase: 2, nome: 'Respirando', necessidades: 0.8, dividas: '15%', reserva: '5%' },
  { fase: 3, nome: 'Saindo do buraco', necessidades: 0.7, dividas: '20%', reserva: '10%' },
  { fase: 4, nome: 'Estável', necessidades: 0.6, dividas: '10%', reserva: '20%' },
  { fase: 5, nome: 'Livre', necessidades: 0.5, dividas: '0%', reserva: '30%' },
];
export function faseEscada(necessidades, renda, temDividas = true) {
  const pct = num(renda) ? num(necessidades) / num(renda) : 1;
  let f = ESCADA[0];
  for (const e of ESCADA) if (pct <= e.necessidades + 1e-9) f = e;
  if (f.fase === 5 && temDividas) f = ESCADA[3];
  return { ...f, pct };
}
export function metaReserva(despesasBasicas, rendaIncerta = false) {
  const meses = rendaIncerta ? 6 : 3;
  return { inicial: PARAMS.reservaInicial, meses, final: r2(num(despesasBasicas) * meses), maxima: r2(num(despesasBasicas) * (rendaIncerta ? 12 : 6)) };
}

// ─── Núcleo SFDTT: vem do repositório SFDTT (js/sfdtt/, cópia sem edição + lock) ───
export { calcEstado, calcNivel, calcIRF, calcDDO, COMP_CRITICO, COMP_ALERTA, COMP_ATENCAO } from './sfdtt/engine/index.js';
import { calcEstado, calcNivel, calcIRF, calcDDO } from './sfdtt/engine/index.js';
import { detectarPerfil as perfilSFDTT } from './sfdtt/engine/fiscal.js';
import { R_DIVIDA_ORDEM, R_RESERVA, R_INVESTIR_OU_QUITAR } from './sfdtt/engine/decisao.js';

export function ativas(dividas) { return (dividas || []).filter((d) => num(d.saldo) > 0 && d.status !== 'quitada'); }
export function taxaMensal(d) { return d && num(d.juros) ? num(d.juros) / 100 : 0; }
// Formato de dívida que o motor SFDTT espera (juros em pontos percentuais, status do v8).
const paraSFDTT = (d) => ({ ...d, saldo: num(d.saldo), parcela: num(d.parcela), juros: num(d.juros), status: d.atraso ? 'inadimplente' : 'em_dia' });

export function resumo(estado) {
  const e = estado || {};
  const rendaCerta = num(e.rendaCerta), rendaIncerta = num(e.rendaIncerta);
  const ess = e.essenciais || {};
  const essencial = ['moradia', 'comida', 'contas', 'transporte', 'remedios', 'pensao'].reduce((s, k) => s + num(ess[k]), 0);
  const outros = num(e.outrosGastos);
  const dividas = ativas(e.dividas).map(paraSFDTT);
  const parcelas = dividas.reduce((s, d) => s + d.parcela, 0);
  const inad = dividas.filter((d) => d.atraso).reduce((s, d) => s + d.saldo, 0);
  const dividaTotal = dividas.reduce((s, d) => s + d.saldo, 0);
  const saidas = essencial + outros + parcelas;
  const entradas = rendaCerta;  // renda incerta nunca entra na base (regra do SFDTT)
  return {
    rendaCerta, rendaIncerta, essencial: r2(essencial), outros: r2(outros), parcelas: r2(parcelas),
    saidas: r2(saidas), entradas: r2(entradas), sobra: r2(entradas - saidas),
    sobraComIncerta: r2(entradas + rendaIncerta - saidas),
    comp: entradas > 0 ? saidas / entradas : (saidas > 0 ? 1 : 0),
    inad: r2(inad), dividaTotal: r2(dividaTotal), saldo: Number(e.saldo) || 0,
    dividas, mesesOk: Math.max(0, e.mesesOk | 0),
  };
}

// Estado no formato das regras L3.5 do SFDTT.
const estadoL35 = (r, perfil, extra = {}) => ({ renda: r.entradas, fixos: r.essencial, dividas: r.dividas, perfil, despesaEssencial: r.essencial, ...extra });

export function detectarPerfil(r, irfScore) { return perfilSFDTT([], r.dividas, irfScore); }

// Prioridade legal do capítulo 5 do livro (vem antes da ordem financeira do SFDTT):
// pensão alimentícia, empréstimo informal com risco e bem em garantia nunca vão para o fim da fila.
function prioridadeLegal(d) { return d.tipo === 'pensao' ? 0 : d.tipo === 'agiota' ? 1 : d.garantia ? 2 : 3; }
const MOTIVO_LEGAL = ['Pensão alimentícia: sustento de criança, cobrada com medidas duras.', 'Empréstimo informal: juros ilegais e risco à segurança. Procure a Defensoria.', 'Bem em garantia: atrasar pode custar o bem.'];

export function ordemDividas(r, perfil) {
  const res = R_DIVIDA_ORDEM.executar(estadoL35(r, perfil));
  const jurosMes = r2(r.dividas.reduce((s, d) => s + d.saldo * taxaMensal(d), 0));
  if (res.bloqueada) return { bloqueada: true, contraindicacao: res.contraindicacao, mensagem: res.mensagem_base, recursos: res.recursos || [], ordem: [], jurosMes, alerta: null, metodo: null };
  const porNome = new Map(r.dividas.map((d) => [d.nome, d]));
  const doMotor = (res.decisao || []).map((o) => ({ ...o, d: porNome.get(o.nome) })).filter((o) => o.d);
  const legais = doMotor.filter((o) => prioridadeLegal(o.d) < 3).sort((a, b) => prioridadeLegal(a.d) - prioridadeLegal(b.d));
  const resto = doMotor.filter((o) => prioridadeLegal(o.d) === 3);
  return {
    bloqueada: false,
    metodo: /bola|Ramsey|vitória/i.test(res.principio + res.fonte) ? 'bola_de_neve' : 'avalanche',
    alerta: res.alerta || null, fonte: res.fonte,
    ordem: [...legais, ...resto].map((o, i) => ({
      ordem: i + 1, id: o.d.id, nome: o.d.nome, saldo: r2(o.d.saldo), taxa: taxaMensal(o.d), jurosMes: r2(o.d.saldo * taxaMensal(o.d)),
      motivo: prioridadeLegal(o.d) < 3 ? MOTIVO_LEGAL[prioridadeLegal(o.d)] : o.motivo,
    })),
    jurosMes,
  };
}

export function regraReserva(r, perfil) {
  const res = R_RESERVA.executar(estadoL35(r, perfil));
  const meta = metaReserva(r.essencial, r.rendaIncerta > 0);
  const saldo = Math.max(0, r.saldo);
  if (res.bloqueada && res.contraindicacao === 'divida_cara_ativa') {
    // O SFDTT manda estancar a dívida cara primeiro; o livro (cap. 9) guarda antes uma reserva inicial.
    return saldo < meta.inicial
      ? { fase: 'inicial', meta, falta: r2(meta.inicial - saldo), mensagem: 'Junte R$ ' + fmt(meta.inicial) + ' para o próximo imprevisto não voltar ao cartão; depois, todo extra vai para a dívida cara.' }
      : { fase: 'estancar', meta, mensagem: res.mensagem_base };
  }
  if (res.bloqueada) return { fase: 'bloqueada', meta, mensagem: res.mensagem_base };
  const alvo = res.decisao.alvoMinimo;
  if (saldo < meta.inicial) return { fase: 'inicial', meta, falta: r2(meta.inicial - saldo), mensagem: 'Junte R$ ' + fmt(meta.inicial) + ' para o próximo imprevisto não voltar ao cartão.' };
  if (saldo < alvo) return { fase: 'crescer', meta: { ...meta, final: alvo, meses: res.decisao.mesesMin }, falta: r2(alvo - saldo), mensagem: 'Faltam R$ ' + fmt(alvo - saldo) + ' para ' + res.decisao.mesesMin + ' meses de despesas básicas. Onde: ' + res.decisao.onde + '.' };
  return { fase: 'completa', meta, falta: 0, mensagem: 'Reserva completa. O excedente já pode ser investido.' };
}

export function investirOuQuitar(divida, r, perfil) {
  const res = R_INVESTIR_OU_QUITAR.executar({ ...estadoL35(r || { entradas: 0, essencial: 0, dividas: [] }, perfil), divida: divida ? paraSFDTT(divida) : {} });
  if (res.bloqueada) return { acao: null, motivo: res.mensagem_base };
  return { acao: res.decisao.acao, motivo: res.decisao.racional };
}

export function fmt(v) { return (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
export function pct(v, casas = 1) { return ((Number(v) || 0) * 100).toLocaleString('pt-BR', { maximumFractionDigits: casas }) + '%'; }

const FRASES = {
  colapso: 'A dívida passou de duas vezes o que você ganha num ano. Isso pede ajuda especializada e gratuita.',
  pre_colapso: 'Há conta em atraso e o mês não fecha. É grave, e tem saída: comece pela base.',
  sobrevivencia: 'O mês está apertado. Proteja o essencial antes de qualquer banco.',
  reorganizacao: 'O mês fecha, mas quase tudo já tem destino. Hora de reorganizar.',
  atencao: 'As contas estão em dia. Fique de olho no que cresce.',
  crescimento: 'Sobra dinheiro todo mês. Hora de fazer ele trabalhar.',
};

// Diagnóstico completo para a interface (Quadros 1 a 5 do contrato Ático).
export function diagnostico(estado) {
  const r = resumo(estado);
  const estadoFin = calcEstado(r.comp, r.inad, r.entradas, r.dividas);
  const nivel = calcNivel(r.sobra);
  const irf = calcIRF({ comp: r.comp, inad: r.inad, saldo: r.saldo, gastosMes: r.saidas, entradas: r.entradas, parcelas: r.parcelas, mesesOk: r.mesesOk });
  const ddo = calcDDO(Math.max(0, r.saldo), r.saidas);
  const perfil = detectarPerfil(r, irf.score);
  const ordem = ordemDividas(r, perfil);
  const guarda = ordem.bloqueada ? ordem.contraindicacao : null;
  const seq = sequestro(r.parcelas, r.entradas);
  const minEx = minimoExistencial(r.entradas, r.parcelas);
  const cabe = parcelaQueCabe(r.entradas, r.essencial, r.parcelas);
  const escada = faseEscada(r.essencial + r.outros, r.entradas, r.dividas.length > 0);
  const reserva = regraReserva(r, perfil);

  // Ações: uma lista única, ordenada por dinheiro perdido a cada semana de espera.
  const acoes = [];
  const semana = (mes) => r2((mes * 12) / 52);
  r.dividas.filter((d) => d.atraso).forEach((d) => acoes.push({
    id: 'atraso-' + d.id, urgencia: 'agora', texto: 'Pedir por escrito a proposta para ' + d.nome + ' (script 3 do livro).',
    perdaSemana: semana(num(d.saldo) * (taxaMensal(d) || 0.02)), capitulo: 6,
  }));
  if (r.dividas.some((d) => d.tipo === 'agiota')) acoes.push({ id: 'agiota', urgencia: 'agora', texto: 'Registrar boletim de ocorrência se houver ameaça e procurar a Defensoria Pública.', perdaSemana: 9e9, capitulo: 3 });
  if (minEx.abaixo && r.dividas.length) acoes.push({ id: 'superendividamento', urgencia: 'agora', texto: 'Levar os contratos à Defensoria ou ao Procon e pedir a repactuação (Lei 14.181/2021).', perdaSemana: 8e9, capitulo: 7 });
  if (ordem.bloqueada) acoes.push({ id: 'l35-' + ordem.contraindicacao, urgencia: 'agora', texto: ordem.mensagem, perdaSemana: 7e9, capitulo: 7 });
  const topo = ordem.ordem.find((o) => o.taxa > 0);
  if (topo) acoes.push({ id: 'topo-' + topo.id, urgencia: 'semana', texto: 'Atacar ' + topo.nome + ': custa R$ ' + fmt(topo.jurosMes) + ' por mês só de juros.', perdaSemana: semana(topo.jurosMes), capitulo: 5 });
  if (r.dividas.some((d) => !num(d.juros))) acoes.push({ id: 'registrato', urgencia: 'semana', texto: 'Pedir o relatório do Registrato para descobrir as taxas que faltam.', perdaSemana: 0.5, capitulo: 7 });
  if (reserva.fase === 'inicial') acoes.push({ id: 'reserva', urgencia: 'mes', texto: reserva.mensagem, perdaSemana: 0.4, capitulo: 9 });
  if (r.sobra < 0) acoes.push({ id: 'corte', urgencia: 'agora', texto: 'Cortar um gasto invisível e refazer o orçamento: faltam R$ ' + fmt(-r.sobra) + ' por mês.', perdaSemana: semana(-r.sobra), capitulo: 8 });
  if (!r.dividas.length && reserva.fase === 'completa') acoes.push({ id: 'investir', urgencia: 'mes', texto: 'Definir prazo e objetivo e investir o excedente.', perdaSemana: 0.1, capitulo: 9 });
  acoes.sort((a, b) => b.perdaSemana - a.perdaSemana);

  const pontos = [];
  if (r.inad > 0) pontos.push('R$ ' + fmt(r.inad) + ' em atraso.');
  if (r.sobra < 0) pontos.push('Faltam R$ ' + fmt(-r.sobra) + ' para fechar o mês.');
  if (seq.alerta) pontos.push(pct(seq.pct, 0) + ' da renda já sai em parcelas: ' + String(seq.dias).replace('.', ',') + ' dias de trabalho.');
  if (ordem.jurosMes > 0) pontos.push('Juros de R$ ' + fmt(ordem.jurosMes) + ' por mês.');
  if (minEx.abaixo && r.dividas.length) pontos.push('Sobram R$ ' + fmt(minEx.sobra) + ' depois das parcelas, abaixo do mínimo existencial.');
  if (ddo < 15) pontos.push('O saldo cobre ' + ddo + ' dias.');
  if (!pontos.length) pontos.push('Nenhum risco imediato.');

  return {
    resumo: r, estado: { ...estadoFin, frase: FRASES[estadoFin.id] }, nivel, irf, ddo, guarda, perfil,
    ordem, sequestro: seq, minimoExistencial: minEx, parcelaQueCabe: cabe, escada, reserva,
    pontos: pontos.slice(0, 3), acoes, acao1: acoes[0] || null,
  };
}
