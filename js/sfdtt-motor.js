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
  salarioMinimo: 1621,      // Decreto 12.797/2025 (2026)
  minimoExistencial: 600,   // Decreto 11.567/2023, mantido pelo STF em 23/04/2026
  cdiMensal: 0.0114,        // referência do SFDTT v8; atualizar com a série SGS 4391/12 do BCB
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

// ─── Núcleo SFDTT ────────────────────────────────────────────────────────────
export const COMP_CRITICO = 0.9, COMP_ALERTA = 0.65, COMP_ATENCAO = 0.4;

export function ativas(dividas) { return (dividas || []).filter((d) => num(d.saldo) > 0 && d.status !== 'quitada'); }
export function taxaMensal(d) { return d && num(d.juros) ? num(d.juros) / 100 : 0; }

export function resumo(estado) {
  const e = estado || {};
  const rendaCerta = num(e.rendaCerta), rendaIncerta = num(e.rendaIncerta);
  const ess = e.essenciais || {};
  const essencial = ['moradia', 'comida', 'contas', 'transporte', 'remedios', 'pensao'].reduce((s, k) => s + num(ess[k]), 0);
  const outros = num(e.outrosGastos);
  const dividas = ativas(e.dividas);
  const parcelas = dividas.reduce((s, d) => s + num(d.parcela), 0);
  const inad = dividas.filter((d) => d.atraso).reduce((s, d) => s + num(d.saldo), 0);
  const dividaTotal = dividas.reduce((s, d) => s + num(d.saldo), 0);
  const saidas = essencial + outros + parcelas;
  const entradas = rendaCerta;  // base sempre sem renda incerta
  return {
    rendaCerta, rendaIncerta, essencial: r2(essencial), outros: r2(outros), parcelas: r2(parcelas),
    saidas: r2(saidas), entradas: r2(entradas), sobra: r2(entradas - saidas),
    sobraComIncerta: r2(entradas + rendaIncerta - saidas),
    comp: entradas > 0 ? saidas / entradas : (saidas > 0 ? 1 : 0),
    inad: r2(inad), dividaTotal: r2(dividaTotal), saldo: Number(e.saldo) || 0,
    dividas, mesesOk: Math.max(0, e.mesesOk | 0),
  };
}

export function calcEstado(comp, inad, entradas = 0, dividaTotal = 0) {
  const ratio = entradas > 0 ? dividaTotal / (entradas * 12) : 0;
  if (inad > 0 && ratio > 2) return { id: 'colapso', label: 'Colapso Estrutural' };
  if (inad > 0 && comp > COMP_CRITICO) return { id: 'pre_colapso', label: 'Pré-Colapso' };
  if (inad > 0 || comp > COMP_CRITICO) return { id: 'sobrevivencia', label: 'Sobrevivência' };
  if (comp > COMP_ALERTA) return { id: 'reorganizacao', label: 'Reorganização' };
  if (comp > COMP_ATENCAO) return { id: 'atencao', label: 'Atenção' };
  return { id: 'crescimento', label: 'Crescimento' };
}
export function calcNivel(sobra) {
  if (sobra < 0) return { nivel: 0, label: 'Déficit', desc: 'Corte e renegociação agora.' };
  if (sobra <= 200) return { nivel: 1, label: 'Sobrevida', desc: 'Primeira vitória: a dívida certa primeiro.' };
  if (sobra <= 500) return { nivel: 2, label: 'Reorganização', desc: 'Suba um degrau da escada.' };
  if (sobra <= 1000) return { nivel: 3, label: 'Estabilidade', desc: 'Monte a reserva de emergência.' };
  return { nivel: 4, label: 'Expansão', desc: 'Invista o excedente.' };
}
export function calcIRF({ comp = 0, inad = 0, saldo = 0, gastosMes = 0, entradas = 0, parcelas = 0, mesesOk = 0 }) {
  const c1 = Math.round(200 * Math.max(0, 1 - comp));
  const c2 = inad > 0 ? 0 : 200;
  const cob = gastosMes > 0 ? Math.max(0, saldo) / gastosMes : saldo > 0 ? 3 : 0;
  const c3 = Math.min(200, Math.round((cob / 3) * 200));
  const c4 = Math.min(200, mesesOk * 40);
  const rp = entradas > 0 ? parcelas / entradas : parcelas > 0 ? 1 : 0;
  const c5 = Math.round(200 * Math.max(0, 1 - rp * 2));
  const score = Math.min(1000, c1 + c2 + c3 + c4 + c5);
  const label = score >= 800 ? 'Excelente' : score >= 600 ? 'Bom' : score >= 400 ? 'Regular' : score >= 200 ? 'Frágil' : 'Crítico';
  return { score, label, breakdown: { c1, c2, c3, c4, c5 } };
}
export function calcDDO(saldo, gastosMes, diasMes = 30) {
  if (gastosMes <= 0) return saldo > 0 ? 999 : 0;
  return Math.max(0, Math.floor(saldo / (gastosMes / diasMes)));
}

// Guardas universais do L3.5 (salário mínimo atualizado para 2026).
export function guardaUniversal(r) {
  if (r.entradas > 0 && r.dividaTotal > r.entradas * 12 * 2) return 'insolvencia_grave';
  if (r.entradas > 0 && r.entradas < r.essencial) return 'renda_subsistencia';
  if (r.entradas > 0 && r.entradas < PARAMS.salarioMinimo * 2 && r.sobra <= 0) return 'renda_subsistencia';
  return null;
}

// Perfil derivado dos dados (nunca declarado). Só muda tom e ordem.
export function detectarPerfil(r) {
  if (r.dividas.length >= 3 && r.inad > 0) return 'ansioso';
  if (r.dividas.length && r.dividas.every((d) => !num(d.juros))) return 'negador';
  return 'controlado';
}

// Prioridade legal do capítulo 5: pensão e bem em garantia antes das demais.
function prioridadeLegal(d) {
  if (d.tipo === 'pensao') return 0;
  if (d.tipo === 'agiota') return 1;
  if (d.garantia) return 2;
  return 3;
}
export function ordemDividas(r, perfil = detectarPerfil(r)) {
  const lista = r.dividas.slice();
  const bola = perfil === 'ansioso' || perfil === 'negador';
  lista.sort((a, b) => {
    const p = prioridadeLegal(a) - prioridadeLegal(b);
    if (p) return p;
    if (bola) return num(a.saldo) - num(b.saldo);
    const t = taxaMensal(b) - taxaMensal(a);
    return t || num(a.saldo) - num(b.saldo);
  });
  const taxas = lista.filter((d) => num(d.juros)).map(taxaMensal);
  const max = taxas.length ? Math.max(...taxas) : 0, min = taxas.length ? Math.min(...taxas) : 0;
  const alerta = bola && max > 0.1 && max > min * 3
    ? 'Uma dívida cobra mais de 10% ao mês: ela cresce rápido demais para esperar a vez.' : null;
  return {
    metodo: bola ? 'bola_de_neve' : 'avalanche', alerta,
    ordem: lista.map((d, i) => ({
      ordem: i + 1, id: d.id, nome: d.nome, saldo: r2(d.saldo), taxa: taxaMensal(d),
      jurosMes: r2(num(d.saldo) * taxaMensal(d)),
      motivo: prioridadeLegal(d) < 3
        ? (d.tipo === 'pensao' ? 'Pensão alimentícia: sustento de criança, cobrada com medidas duras.' : d.tipo === 'agiota' ? 'Empréstimo informal: juros ilegais e risco à segurança. Procure a Defensoria.' : 'Bem em garantia: atrasar pode custar o bem.')
        : !num(d.juros) ? 'Taxa não informada: confira no contrato ou no Registrato.'
        : bola ? 'Menor saldo: quitar gera a primeira vitória.' : 'Maior taxa: é a que mais cresce.',
    })),
    jurosMes: r2(lista.reduce((s, d) => s + num(d.saldo) * taxaMensal(d), 0)),
  };
}

export function regraReserva(r, rendaIncerta = false) {
  const meta = metaReserva(r.essencial, rendaIncerta || r.rendaIncerta > 0);
  const cara = r.dividas.find((d) => taxaMensal(d) > PARAMS.cdiMensal * 5);
  const saldo = Math.max(0, r.saldo);
  if (cara && saldo >= meta.inicial)
    return { fase: 'estancar', meta, mensagem: 'Reserva inicial formada. Agora o dinheiro extra vai para a dívida mais cara: ' + cara.nome + '.' };
  if (saldo < meta.inicial)
    return { fase: 'inicial', meta, falta: r2(meta.inicial - saldo), mensagem: 'Junte R$ ' + fmt(meta.inicial) + ' para o próximo imprevisto não voltar ao cartão.' };
  if (saldo < meta.final)
    return { fase: 'crescer', meta, falta: r2(meta.final - saldo), mensagem: 'Faltam R$ ' + fmt(meta.final - saldo) + ' para ' + meta.meses + ' meses de despesas básicas.' };
  return { fase: 'completa', meta, falta: 0, mensagem: 'Reserva completa. O excedente já pode ser investido.' };
}

export function investirOuQuitar(divida, cdi = PARAMS.cdiMensal) {
  if (!divida || !num(divida.juros)) return { acao: null, motivo: 'Sem taxa informada não dá para comparar com o CDI.' };
  const i = taxaMensal(divida);
  return i > cdi
    ? { acao: 'quitar', motivo: 'A dívida cobra ' + pct(i) + ' ao mês e a aplicação segura rende ' + pct(cdi) + '. Quitar rende mais, sem risco e sem imposto.' }
    : { acao: 'investir', motivo: 'A aplicação segura rende mais que essa dívida. Mantenha a parcela em dia e invista o excedente.' };
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
  const estadoFin = calcEstado(r.comp, r.inad, r.entradas, r.dividaTotal);
  const nivel = calcNivel(r.sobra);
  const irf = calcIRF({ comp: r.comp, inad: r.inad, saldo: r.saldo, gastosMes: r.saidas, entradas: r.entradas, parcelas: r.parcelas, mesesOk: r.mesesOk });
  const ddo = calcDDO(Math.max(0, r.saldo), r.saidas);
  const guarda = guardaUniversal(r);
  const perfil = detectarPerfil(r);
  const ordem = ordemDividas(r, perfil);
  const seq = sequestro(r.parcelas, r.entradas);
  const minEx = minimoExistencial(r.entradas, r.parcelas);
  const cabe = parcelaQueCabe(r.entradas, r.essencial, r.parcelas);
  const escada = faseEscada(r.essencial + r.outros, r.entradas, r.dividas.length > 0);
  const reserva = regraReserva(r);

  // Ações: uma lista única, ordenada por dinheiro perdido a cada semana de espera.
  const acoes = [];
  const semana = (mes) => r2((mes * 12) / 52);
  r.dividas.filter((d) => d.atraso).forEach((d) => acoes.push({
    id: 'atraso-' + d.id, urgencia: 'agora', texto: 'Pedir por escrito a proposta para ' + d.nome + ' (script 3 do livro).',
    perdaSemana: semana(num(d.saldo) * (taxaMensal(d) || 0.02)), capitulo: 6,
  }));
  if (r.dividas.some((d) => d.tipo === 'agiota')) acoes.push({ id: 'agiota', urgencia: 'agora', texto: 'Registrar boletim de ocorrência se houver ameaça e procurar a Defensoria Pública.', perdaSemana: 9e9, capitulo: 3 });
  if (minEx.abaixo && r.dividas.length) acoes.push({ id: 'superendividamento', urgencia: 'agora', texto: 'Levar os contratos à Defensoria ou ao Procon e pedir a repactuação (Lei 14.181/2021).', perdaSemana: 8e9, capitulo: 7 });
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
