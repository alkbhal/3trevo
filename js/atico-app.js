// Ático — interface do SFDTT (contrato de interface v1.0: 5 quadros, zero fricção).
// Local-first: nada sai do aparelho. Motor = SFDTT (js/sfdtt, cópia sem edição). O plano pago,
// o histórico e o Morning Brief existem num lugar só: o Ático completo (SFDTT, finintel.com.br).
import * as M from './sfdtt-motor.js';

const ATICO_COMPLETO = 'https://finintel.com.br/';
const KEY = 'tt_atico_v1', IMPORT_KEY = 'tt_atico_import', TEMA = 'tt_atico_tema';
const $ = (s) => document.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const R = (v) => (v < 0 ? '−R$ ' : 'R$ ') + M.fmt(Math.abs(v));
const ler = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* modo privado */ } };
const novo = () => ({ etapa: 1, rendaCerta: 0, rendaIncerta: 0, saldo: 0, essenciais: {}, outrosGastos: 0, dividas: [], mesesOk: 0, feitos: {}, historico: [] });
const dinheiro = (v) => { const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) && n >= 0 ? Math.min(n, 1e8) : 0; };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

let S = Object.assign(novo(), ler(KEY) || {});
const salvar = () => gravar(KEY, S);

// Dados que o leitor do livro preparou (mapa das dívidas e orçamento): entram sem digitar de novo.
(function importarDoLivro() {
  const imp = ler(IMPORT_KEY);
  if (!imp) return;
  if (Array.isArray(imp.dividas) && imp.dividas.length) S.dividas = imp.dividas.slice(0, 30).map((d) => ({ id: uid(), nome: String(d.nome || 'Dívida').slice(0, 60), saldo: dinheiro(d.saldo), parcela: dinheiro(d.parcela), juros: dinheiro(d.juros), atraso: !!d.atraso, tipo: d.tipo, garantia: !!d.garantia }));
  if (imp.rendaCerta) S.rendaCerta = dinheiro(imp.rendaCerta);
  if (imp.essenciais) for (const k in imp.essenciais) S.essenciais[k] = dinheiro(imp.essenciais[k]);
  if (imp.outrosGastos) S.outrosGastos = dinheiro(imp.outrosGastos);
  try { localStorage.removeItem(IMPORT_KEY); } catch { /* ignora */ }
  salvar();
  setTimeout(() => toast('Trouxemos os números que você anotou no livro.'), 400);
})();

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 3200); }
function campo(id, rotulo, valor, dica) {
  return `<label class="f" for="${id}">${rotulo}</label><div class="money"><span>R$</span><input id="${id}" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${valor ? M.fmt(valor) : ''}"></div>${dica ? `<p class="hint">${dica}</p>` : ''}`;
}
const passos = (n) => `<div class="steps" aria-label="Pergunta ${n} de 3">${[1, 2, 3].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</div>`;
const v = (id) => dinheiro(($('#' + id) || {}).value || 0);

// ─── Onboarding: 3 perguntas ─────────────────────────────────────────────────
function etapa1() {
  $('#app').innerHTML = `<section class="fade">${passos(1)}
    <h1>Quanto cai na sua conta por mês?</h1><p class="sub">Só o que é certo: salário, aposentadoria, benefício. Leva 1 minuto e não pede cadastro.</p>
    ${campo('rc', 'Renda certa (líquida)', S.rendaCerta)}
    ${campo('ri', 'Renda que pode faltar (bico, comissão, hora extra)', S.rendaIncerta, 'Fica fora da conta principal: se faltar, o plano continua de pé.')}
    ${campo('sd', 'Quanto tem na conta hoje', S.saldo)}
    <p style="margin-top:20px"><button class="btn lg" id="ok1">Continuar</button></p></section>`;
  $('#rc').focus();
  $('#ok1').onclick = () => { S.rendaCerta = v('rc'); S.rendaIncerta = v('ri'); S.saldo = v('sd'); if (!S.rendaCerta && !S.rendaIncerta) return toast('Diga quanto entra por mês.'); S.etapa = 2; salvar(); etapa2(); };
}
function etapa2() {
  const e = S.essenciais;
  $('#app').innerHTML = `<section class="fade">${passos(2)}
    <h1>Quanto custa o básico?</h1><p class="sub">Na ordem do capítulo 5 do livro: o que vem antes de qualquer banco. Deixe em branco o que não tiver.</p>
    <div class="grid2">${campo('mo', 'Moradia', e.moradia)}${campo('co', 'Comida', e.comida)}${campo('ct', 'Água, luz e gás', e.contas)}${campo('tr', 'Transporte para trabalhar', e.transporte)}${campo('re', 'Remédios', e.remedios)}${campo('pe', 'Pensão alimentícia', e.pensao)}</div>
    ${campo('ou', 'Todo o resto (celular, escola, lazer…)', S.outrosGastos, 'Sem as parcelas de dívidas: elas vêm na próxima pergunta.')}
    <p style="margin-top:20px;display:flex;gap:10px"><button class="btn sec" id="volta">Voltar</button><button class="btn lg" id="ok2">Continuar</button></p></section>`;
  $('#volta').onclick = () => { S.etapa = 1; salvar(); etapa1(); };
  $('#ok2').onclick = () => { S.essenciais = { moradia: v('mo'), comida: v('co'), contas: v('ct'), transporte: v('tr'), remedios: v('re'), pensao: v('pe') }; S.outrosGastos = v('ou'); S.etapa = 3; salvar(); etapa3(); };
}
function linhaDivida(d, i) {
  return `<div class="divrow" data-i="${i}">
    <input class="in" data-k="nome" placeholder="Nome (ex.: cartão do banco X)" value="${esc(d.nome)}" maxlength="60" aria-label="Nome da dívida">
    <div class="grid2" style="margin-top:8px">
      <div class="money"><span>R$</span><input data-k="saldo" inputmode="decimal" placeholder="quanto deve" value="${d.saldo ? M.fmt(d.saldo) : ''}" aria-label="Quanto deve"></div>
      <div class="money"><span>R$</span><input data-k="parcela" inputmode="decimal" placeholder="parcela/mês" value="${d.parcela ? M.fmt(d.parcela) : ''}" aria-label="Parcela por mês"></div>
      <div class="money"><span>%</span><input data-k="juros" inputmode="decimal" placeholder="juros ao mês (se souber)" value="${d.juros ? String(d.juros).replace('.', ',') : ''}" aria-label="Juros ao mês"></div>
      <select class="in" data-k="tipo" aria-label="Tipo"><option value="">Tipo</option>${[['cartao', 'Cartão'], ['cheque', 'Cheque especial'], ['emprestimo', 'Empréstimo'], ['consignado', 'Consignado'], ['loja', 'Loja/carnê'], ['pensao', 'Pensão atrasada'], ['agiota', 'Agiota/informal'], ['outro', 'Outro']].map(([k, n]) => `<option value="${k}"${d.tipo === k ? ' selected' : ''}>${n}</option>`).join('')}</select>
    </div>
    <label class="toggle"><input type="checkbox" data-k="atraso"${d.atraso ? ' checked' : ''}> Está atrasada</label>
    <label class="toggle"><input type="checkbox" data-k="garantia"${d.garantia ? ' checked' : ''}> Tem um bem em garantia (carro, moto, casa)</label>
    <button class="link" data-del="${i}">Remover</button></div>`;
}
function lerDividas() {
  document.querySelectorAll('.divrow').forEach((row) => {
    const d = S.dividas[+row.dataset.i]; if (!d) return;
    row.querySelectorAll('[data-k]').forEach((el) => {
      const k = el.dataset.k;
      d[k] = el.type === 'checkbox' ? el.checked : (k === 'nome' || k === 'tipo') ? el.value.trim().slice(0, 60) : dinheiro(el.value);
    });
  });
}
function etapa3() {
  if (!S.dividas.length) S.dividas.push({ id: uid(), nome: '' });
  $('#app').innerHTML = `<section class="fade">${passos(3)}
    <h1>Quais dívidas você tem?</h1><p class="sub">Se não souber a taxa, deixe em branco: o Ático nunca inventa um número. O Registrato, do Banco Central, mostra tudo de graça.</p>
    <div id="divs">${S.dividas.map(linhaDivida).join('')}</div>
    <button class="btn sec" id="mais">+ Outra dívida</button>
    <p style="margin-top:20px;display:flex;gap:10px;flex-wrap:wrap"><button class="btn sec" id="volta">Voltar</button><button class="btn lg" id="ok3" style="flex:1">Ver o meu diagnóstico</button></p>
    <button class="link" id="sem">Não tenho dívidas</button></section>`;
  $('#mais').onclick = () => { lerDividas(); S.dividas.push({ id: uid(), nome: '' }); salvar(); etapa3(); };
  $('#divs').onclick = (e) => { const i = e.target.dataset.del; if (i === undefined) return; lerDividas(); S.dividas.splice(+i, 1); salvar(); etapa3(); };
  $('#volta').onclick = () => { lerDividas(); S.etapa = 2; salvar(); etapa2(); };
  $('#ok3').onclick = () => { lerDividas(); S.dividas = S.dividas.filter((d) => d.saldo > 0).map((d) => ({ ...d, nome: d.nome || 'Dívida' })); S.etapa = 4; salvar(); painel(); };
  $('#sem').onclick = () => { S.dividas = []; S.etapa = 4; salvar(); painel(); };
}

// ─── Assistente Ático: voz e respostas (determinísticas, a partir do motor) ──
const VOZ = {
  colapso: 'Você abriu os números. Isso já é o primeiro movimento.',
  pre_colapso: 'Respira. É grave e é reversível, um passo por vez.',
  sobrevivencia: 'Você está aqui, e isso conta. Vamos proteger a base.',
  reorganizacao: 'O mês fecha. Agora é fazer sobrar.',
  atencao: 'Tudo em dia. Vale ficar de olho no que cresce.',
  crescimento: 'Sobra dinheiro. Hora de fazer ele trabalhar por você.',
};
function responder(q, D) {
  const r = D.resumo, cart = r.dividas.find((d) => d.tipo === 'cartao');
  if (q === 'minimo') return 'Pagar só o mínimo joga o resto no rotativo, que passa de 400% ao ano, mas só por um mês. Na fatura seguinte, ou você paga tudo ou o banco precisa oferecer um parcelamento, e juros e encargos somados não podem passar de 100% do valor financiado (Lei 14.690/2023). Se o mínimo vai faltar para o aluguel ou a comida, pague primeiro a base (capítulo 5).' + (cart && cart.juros ? ' O seu cartão custa ' + R(cart.saldo * cart.juros / 100) + ' por mês de juros.' : '');
  if (q === 'guardar') { const g = D.reserva; return g.fase === 'inicial' ? 'Primeiro uma reserva pequena: ' + g.mensagem + ' Depois disso, o dinheiro extra vai para a dívida mais cara.' : g.mensagem; }
  if (q === 'investir') { if (D.guarda) return 'Agora não: ' + (D.guarda === 'insolvencia_grave' ? 'a dívida passou de duas vezes a renda do ano. Procure a Defensoria Pública e peça a repactuação.' : 'a renda está toda no básico. O foco é proteger a base.'); const topo = D.ordem.ordem.find((o) => o.taxa > 0); return topo ? M.investirOuQuitar({ nome: topo.nome, saldo: topo.saldo, juros: topo.taxa * 100 }, D.resumo, D.perfil).motivo : D.reserva.fase === 'completa' ? 'Sim: reserva completa e sem dívidas caras. Defina prazo e objetivo antes de escolher onde.' : D.reserva.mensagem; }
  if (q === 'super') { const m = D.minimoExistencial; return m.abaixo && r.dividas.length ? 'Depois das parcelas sobram ' + R(m.sobra) + ', abaixo dos ' + R(m.minimo) + ' do mínimo existencial. Isso é um forte indício de superendividamento: leve os contratos à Defensoria ou ao Procon e peça a conciliação com todos os credores (Lei 14.181/2021).' : 'Pelos seus números, sobram ' + R(m.sobra) + ' depois das parcelas, acima do mínimo existencial de ' + R(m.minimo) + '. O caminho é negociar uma a uma, na ordem do plano.'; }
  if (q === 'oferta') { const c = D.parcelaQueCabe; return c.teto > 0 ? 'O seu teto para todos os acordos juntos é ' + R(c.teto) + ' por mês. Comece oferecendo ' + R(c.oferta) + ' ao primeiro credor, por escrito, e nunca aceite a primeira proposta na hora (capítulo 6).' : 'Hoje não sobra nada para acordos depois do básico. Antes de negociar, feche a conta do mês: corte um gasto invisível ou busque uma renda extra (capítulo 8).'; }
  return '';
}

// ─── Painel (Quadros 1 a 5) ──────────────────────────────────────────────────
const status = (nivel) => `<span class="st ${nivel}">${{ bom: 'Bom', atencao: 'Atenção', critico: 'Crítico' }[nivel]}</span>`;
function painel() {
  const D = M.diagnostico(S), r = D.resumo;
  const compNivel = r.comp > M.COMP_CRITICO ? 'critico' : r.comp > M.COMP_ALERTA ? 'atencao' : 'bom';
  const ddoNivel = D.ddo < 10 ? 'critico' : D.ddo < 30 ? 'atencao' : 'bom';
  const cards = [
    `<div class="kpi"><span class="t">Sobrou este mês</span><span class="v">${R(r.sobra)}</span>${status(r.sobra < 0 ? 'critico' : r.sobra < 200 ? 'atencao' : 'bom')}<span class="i">${esc(D.nivel.label)} · ${esc(D.nivel.desc)}</span>${r.rendaIncerta ? `<span class="i">Com a renda incerta: ${R(r.sobraComIncerta)}</span>` : ''}</div>`,
    `<div class="kpi"><span class="t">Fôlego do caixa</span><span class="v">${D.ddo >= 999 ? '—' : D.ddo + ' dias'}</span>${status(ddoNivel)}<span class="i">Quanto tempo o saldo de hoje paga as contas.</span></div>`,
    `<div class="kpi"><span class="t">Comprometimento</span><span class="v">${M.pct(r.comp, 0)}</span>${status(compNivel)}<span class="i">${M.pct(r.comp, 0)} do que entra já tem destino.</span></div>`,
  ];
  if (r.parcelas) cards.push(`<div class="kpi"><span class="t">Parcelas do mês</span><span class="v">${R(r.parcelas)}</span>${status(D.sequestro.alerta ? 'critico' : 'bom')}<span class="i">${String(D.sequestro.dias).replace('.', ',')} dias de trabalho por mês.</span></div>`);
  if (r.inad) cards.push(`<div class="kpi"><span class="t">Em atraso</span><span class="v">${R(r.inad)}</span>${status('critico')}<span class="i">Negocie por escrito, na ordem do plano.</span><button class="link" data-ir="q4">Ver o que fazer</button></div>`);
  if (r.dividas.length && D.minimoExistencial.abaixo) cards.push(`<div class="kpi"><span class="t">Mínimo existencial</span><span class="v">${R(D.minimoExistencial.sobra)}</span>${status('critico')}<span class="i">Abaixo de ${R(D.minimoExistencial.minimo)}: você pode pedir repactuação.</span></div>`);
  const meta = D.reserva.meta, temR = Math.max(0, r.saldo);
  cards.push(`<div class="kpi"><span class="t">Reserva de emergência</span><span class="v">${R(temR)}</span><div class="bar" title="${M.pct(Math.min(1, temR / (meta.final || 1)), 0)} da meta"><i style="width:${Math.min(100, (temR / (meta.final || 1)) * 100)}%"></i></div><span class="i">${esc(D.reserva.mensagem)}</span></div>`);

  const sem = [1, 2, 3].map((k) => r.saldo + r.sobra * k);
  const top3 = Object.entries({ Moradia: S.essenciais.moradia, Comida: S.essenciais.comida, 'Água, luz e gás': S.essenciais.contas, Transporte: S.essenciais.transporte, Remédios: S.essenciais.remedios, Pensão: S.essenciais.pensao, 'Todo o resto': S.outrosGastos, Parcelas: r.parcelas }).filter(([, x]) => x > 0).sort((a, b) => b[1] - a[1]);
  const acoes = D.acoes.map((a) => `<li class="${S.feitos[a.id] ? 'feito' : ''}"><input type="checkbox" data-feito="${esc(a.id)}"${S.feitos[a.id] ? ' checked' : ''} aria-label="Marcar como feito"><div><span class="u ${a.urgencia}">${{ agora: 'Agora', semana: 'Esta semana', mes: 'Este mês' }[a.urgencia]}</span><div class="tx">${esc(a.texto)}</div><small class="sub">Capítulo ${a.capitulo} do livro${a.perdaSemana > 1 && a.perdaSemana < 1e6 ? ' · cada semana de espera custa ' + R(a.perdaSemana) : ''}</small></div></li>`).join('');
  const feitas = D.acoes.filter((a) => S.feitos[a.id]).length;

  $('#app').innerHTML = `<div class="fade">
  <section class="card" id="q1" aria-label="Diagnóstico">
    <p class="voz">${esc(VOZ[D.estado.id])}</p>
    <h1 class="estado">${esc(D.estado.frase)}</h1>
    <div class="irf"><b>${D.irf.score}</b><span>${esc(D.irf.label)}</span><span class="selo">Nota de resiliência · 0 a 1000</span></div>
    <ul class="pontos">${D.pontos.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
    ${D.acao1 ? `<button class="btn lg" data-ir="q4">${esc(D.acao1.texto)}</button>` : ''}
  </section>
  <section class="cards" id="q2" aria-label="Visão rápida">${cards.join('')}</section>
  <section class="card q3" aria-label="Estudo da situação">
    <h2>Como o mês está andando</h2>
    <div class="sem">${['Fim deste mês', 'Fim do próximo', 'Daqui a 3 meses'].map((t, i) => `<div class="${sem[i] >= 0 ? 'pos' : 'neg'}" title="Saldo de hoje + o que sobra (ou falta) por mês">${t}<b>${R(sem[i])}</b></div>`).join('')}</div>
    <p>${r.sobra < 0 ? 'Todo mês faltam ' + R(-r.sobra) + '. Por que importa: o buraco vai para o cartão. O que fazer: um corte e uma renda extra, como a Joana no capítulo 8.' : 'Sobra ' + R(r.sobra) + ' por mês. O que fazer: dê um destino a esse dinheiro antes de gastar.'}</p>
    ${r.dividas.length && D.ordem.bloqueada ? `<h3>Dívidas</h3><p>${esc(D.ordem.mensagem)}</p><ul class="ordem">${D.ordem.recursos.map((x) => `<li><div><b>${esc(x.nome)}</b><small>${esc(x.desc)}</small></div><div class="mono">${esc(x.contato)}</div></li>`).join('')}</ul>` : ''}${r.dividas.length && !D.ordem.bloqueada ? `<h3>Dívidas: a ordem de ataque</h3><p>${D.ordem.metodo === 'avalanche' ? 'Primeiro a que mais cresce: você paga menos juros no total.' : 'Primeiro a menor: a primeira vitória dá fôlego para seguir.'}${D.ordem.alerta ? ' ' + esc(D.ordem.alerta) : ''}</p>
    <ul class="ordem">${D.ordem.ordem.map((o) => `<li><div><b>${o.ordem}. ${esc(o.nome)}</b><small>${esc(o.motivo)}</small></div><div class="mono">${R(o.saldo)}${o.jurosMes ? `<small>${R(o.jurosMes)}/mês de juros</small>` : ''}</div></li>`).join('')}</ul>` : ''}
    <h3>Para onde vai o dinheiro</h3>${top3.slice(0, 3).map(([n, x]) => `<p>${esc(n)} <span class="mono">${R(x)}</span> · ${M.pct(r.entradas ? x / r.entradas : 0, 0)} da renda</p><div class="bar"><i style="width:${Math.min(100, r.entradas ? (x / r.entradas) * 100 : 0)}%"></i></div>`).join('')}
    <p>Escada do capítulo 8: <b>fase ${D.escada.fase} · ${esc(D.escada.nome)}</b> (${M.pct(D.escada.pct, 0)} da renda vai para o dia a dia).</p>
  </section>
  <section class="card" id="q4" aria-label="Ações"><h2>O que fazer, na ordem</h2><p class="sub">${feitas} de ${D.acoes.length} feitas. Ordenado pelo dinheiro que se perde a cada semana de espera.</p><ul class="lista">${acoes || '<li>Nenhuma ação urgente. Siga registrando o mês.</li>'}</ul></section>
  <section class="card" aria-label="Pergunte ao Ático"><h2>Pergunte ao Ático</h2>
    <div class="ask">${[['minimo', 'Pago só o mínimo do cartão?'], ['oferta', 'Quanto posso oferecer num acordo?'], ['guardar', 'Guardo ou pago a dívida?'], ['investir', 'Já posso investir?'], ['super', 'Estou superendividado?']].map(([k, t]) => `<button class="chip" data-q="${k}">${t}</button>`).join('')}</div><div id="resp"></div></section>
  <section class="card" aria-label="Detalhamento"><h2>Detalhes e simulações</h2>
    <details><summary>Como calculamos a nota de resiliência</summary><div class="corpo">Cinco partes de até 200 pontos: comprometimento da renda (${D.irf.breakdown.c1}), contas em dia (${D.irf.breakdown.c2}), reserva em meses (${D.irf.breakdown.c3}), meses seguidos sem faltar dinheiro (${D.irf.breakdown.c4}) e peso das parcelas (${D.irf.breakdown.c5}). Fórmula do SFDTT, a mesma em todas as versões.</div></details>
    <details><summary>Qual é a taxa desta proposta?</summary><div class="corpo"><div class="grid2"><div class="money"><span>R$</span><input id="sv" inputmode="decimal" placeholder="dívida hoje"></div><div class="money"><span>R$</span><input id="sp" inputmode="decimal" placeholder="valor da parcela"></div><div class="money"><span>×</span><input id="sn" inputmode="numeric" placeholder="nº de parcelas"></div></div><p id="sr" class="resp" hidden></p></div></details>
    <details><summary>Quanto a dívida cresce sem pagamento</summary><div class="corpo"><div class="grid2"><div class="money"><span>R$</span><input id="jv" inputmode="decimal" placeholder="valor"></div><div class="money"><span>%</span><input id="jt" inputmode="decimal" placeholder="juros ao mês"></div></div><p id="jr" class="resp" hidden></p></div></details>
    <div class="lock"><p><b>Quer acompanhar mês a mês?</b> Histórico, fechamento do mês, Morning Brief e análise por IA ficam no Ático completo, com o mesmo motor.</p><p style="margin-top:10px"><a class="btn" href="${ATICO_COMPLETO}" rel="noopener">Abrir o Ático completo</a></p></div>
    <details><summary>Imprimir o meu plano</summary><div class="corpo"><button class="btn sec" onclick="window.print()">Imprimir ou salvar em PDF</button></div></details>
    <p style="margin-top:12px;display:flex;gap:12px;flex-wrap:wrap"><button class="link" id="editar">Corrigir meus números</button><button class="link" id="zerar">Apagar tudo deste aparelho</button></p>
  </section></div>`;
  ligar(D);
}
function ligar(D) {
  document.querySelectorAll('[data-ir]').forEach((b) => b.onclick = () => document.getElementById(b.dataset.ir).scrollIntoView({ behavior: 'smooth' }));
  document.querySelectorAll('[data-feito]').forEach((c) => c.onchange = () => { S.feitos[c.dataset.feito] = c.checked; salvar(); if (c.checked) toast('Feito. Um passo a menos.'); painel(); });
  document.querySelectorAll('[data-q]').forEach((b) => b.onclick = () => { $('#resp').innerHTML = `<p class="resp fade">${esc(responder(b.dataset.q, D))}</p>`; });
  const sim = () => { const pv = v('sv'), p = v('sp'), n = parseInt($('#sn').value, 10) || 0, o = $('#sr'); if (!pv || !p || !n) return (o.hidden = true); const i = M.taxaImplicita(pv, p, n); o.hidden = false; o.textContent = p * n <= pv ? 'Sem juros: o total (' + R(p * n) + ') não passa da dívida.' : 'Total: ' + R(p * n) + ' (' + R(p * n - pv) + ' de juros). Taxa escondida: ' + M.pct(i, 2) + ' ao mês, ' + M.pct(M.taxaAnual(i), 0) + ' ao ano. Peça a proposta por escrito com o CET antes de aceitar.'; };
  ['sv', 'sp', 'sn'].forEach((id) => $('#' + id).oninput = sim);
  const cres = () => { const val = v('jv'), t = v('jt') / 100, o = $('#jr'); if (!val || !t) return (o.hidden = true); o.hidden = false; o.textContent = 'Em 6 meses: ' + R(M.jurosCompostos(val, t, 6)) + '. Em 12 meses: ' + R(M.jurosCompostos(val, t, 12)) + '. Isso é ' + M.pct(M.taxaAnual(t), 0) + ' ao ano, não ' + M.pct(t * 12, 0) + '.'; };
  ['jv', 'jt'].forEach((id) => $('#' + id).oninput = cres);
  $('#editar').onclick = () => { S.etapa = 1; salvar(); etapa1(); };
  $('#zerar').onclick = () => { if (!confirm('Apagar todos os seus números deste aparelho?')) return; S = novo(); salvar(); etapa1(); };
}

// ─── Tema ─────────────────────────────────────────────────────────────────────
function tema(t) { if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }
$('#btnTema').onclick = () => { const atual = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); const n = atual === 'dark' ? 'light' : 'dark'; tema(n); gravar(TEMA, n); };
tema(ler(TEMA));

({ 1: etapa1, 2: etapa2, 3: etapa3 }[S.etapa] || painel)();
