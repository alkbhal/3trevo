// Ferramentas da edição interativa: cada tabela do livro vira uma calculadora.
// Tudo roda no aparelho; o mapa das dívidas e o orçamento podem seguir para o Ático.
import * as M from './sfdtt-motor.js';

const IMPORT_KEY = 'tt_atico_import';
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n = (v) => { const x = parseFloat(String(v ?? '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(x) && x >= 0 ? Math.min(x, 1e8) : 0; };
const R = (v) => (v < 0 ? '−R$ ' : 'R$ ') + M.fmt(Math.abs(v));
const campo = (k, rot, ph = '0,00', pre = 'R$') => `<label class="tl"><span>${rot}</span><span class="tm"><i>${pre}</i><input data-k="${k}" inputmode="decimal" placeholder="${ph}"></span></label>`;
const ler = (el) => { const o = {}; el.querySelectorAll('[data-k]').forEach((i) => { o[i.dataset.k] = i.type === 'checkbox' ? i.checked : i.value; }); return o; };
const paraAtico = (dados) => { try { localStorage.setItem(IMPORT_KEY, JSON.stringify(dados)); } catch { /* ignora */ } };

// depois: título da seção (### …) após a qual a ferramenta aparece.
export const FERRAMENTAS = [
  { id: 'autoteste', cap: 'cap1', depois: 'Atenção: você se identifica com isso?', titulo: 'Marque o que faz parte da sua vida',
    html: () => ['Cartão para comprar comida', 'Não sei o valor da próxima fatura', 'Cheque especial todo mês', 'Empréstimo para pagar empréstimo', 'Escondo compras ou dívidas', 'Pago só o mínimo', 'O salário some em 48 horas', 'Fico ansioso quando o telefone toca', 'Acho normal ter nome sujo', 'Não tenho R$ 100 guardados'].map((t, i) => `<label class="tc"><input type="checkbox" data-k="i${i}"> ${t}</label>`).join(''),
    calc: (o) => { const k = Object.values(o).filter(Boolean).length; return k === 0 ? '' : k > 3 ? `${k} itens. Este guia foi feito para você, e isso não é motivo de vergonha: é o sinal de que chegou a hora de agir.` : `${k} ${k === 1 ? 'item' : 'itens'}. Você ainda está a tempo de evitar a armadilha.`; } },
  { id: 'bola', cap: 'cap3', depois: 'O efeito bola de neve (juros compostos)', titulo: 'Faça a conta com a sua dívida',
    html: () => campo('v', 'Valor da dívida') + campo('t', 'Juros ao mês', '8', '%'),
    calc: (o) => { const v = n(o.v), t = n(o.t) / 100; if (!v || !t) return ''; const tab = M.tabelaJuros(v, t); return `<table class="tt"><tr><th>Tempo</th><th>Dívida</th><th>Juros do mês</th></tr>${tab.map((l) => `<tr><td>${l.meses} ${l.meses > 1 ? 'meses' : 'mês'}</td><td>${R(l.divida)}</td><td>${R(l.jurosDoMes)}</td></tr>`).join('')}</table><p>${M.pct(t, 2)} ao mês = ${M.pct(M.taxaAnual(t), 1)} ao ano (e não ${M.pct(t * 12, 0)}).</p>`; } },
  { id: 'taxa', cap: 'cap3', depois: 'A conta que o banco faz (e que você pode fazer também)', titulo: 'Qual é a taxa desta proposta?',
    html: () => campo('v', 'Quanto você deve hoje') + campo('p', 'Valor de cada parcela') + campo('q', 'Número de parcelas', '12', '×'),
    calc: (o) => { const v = n(o.v), p = n(o.p), q = Math.round(n(o.q)); if (!v || !p || !q) return ''; if (p * q <= v) return 'O total não passa da dívida: não há juros nesta proposta.'; const i = M.taxaImplicita(v, p, q); return `Total: <b>${R(p * q)}</b> (${R(p * q - v)} a mais). Taxa escondida: <b>${M.pct(i, 2)} ao mês</b>, ${M.pct(M.taxaAnual(i), 0)} ao ano. Peça por escrito, com o CET.`; } },
  { id: 'teto', cap: 'cap3', depois: 'Atenção: confira se o teto foi respeitado', titulo: 'O banco respeitou o teto?',
    html: () => campo('f', 'Quanto ficou sem pagar (foi para o rotativo)') + campo('j', 'Juros e encargos cobrados até agora (sem IOF)'),
    calc: (o) => { const f = n(o.f), j = n(o.j); if (!f) return ''; const t = M.tetoCartao(f, j); return t.respeitado ? `Dentro do teto: ${R(t.cobrado)} de ${R(t.teto)} permitidos.` : `<b>Acima do teto em ${R(t.excedente)}.</b> Peça explicação por escrito; sem resposta, consumidor.gov.br ou Procon.`; } },
  { id: 'sequestro', cap: 'cap3', depois: 'Você está sendo sequestrado?', titulo: 'O seu salário foi sequestrado?',
    html: () => campo('p', 'Soma das parcelas e mínimos do mês') + campo('r', 'Renda líquida'),
    calc: (o) => { const s = M.sequestro(n(o.p), n(o.r)); if (!n(o.r)) return ''; return `${M.pct(s.pct, 0)} da renda: ${String(s.dias).replace('.', ',')} dias de trabalho por mês só para o banco. ${s.alerta ? '<b>Acima de 30%: é hora de agir.</b>' : 'Abaixo da linha de alerta de 30%.'}`; } },
  { id: 'mapa', cap: 'cap5', depois: 'O mapa das dívidas', titulo: 'O seu mapa das dívidas', mapa: true },
  { id: 'cabe', cap: 'cap6', depois: 'Quanto você pode oferecer: a conta da parcela que cabe', titulo: 'A parcela que cabe',
    html: () => campo('r', 'Renda certa do mês') + campo('e', 'Essencial (casa, comida, contas, transporte, remédios, pensão)') + campo('p', 'Parcelas que você já paga'),
    calc: (o) => { if (!n(o.r)) return ''; const c = M.parcelaQueCabe(n(o.r), n(o.e), n(o.p)); return c.teto > 0 ? `Teto para todos os acordos: <b>${R(c.teto)}</b> por mês. Primeira oferta: cerca de <b>${R(c.oferta)}</b>.` : 'Hoje não sobra nada depois do essencial. Antes de negociar, feche a conta do mês (capítulo 8).'; } },
  { id: 'minimo', cap: 'cap7', depois: 'O mínimo existencial', titulo: 'Confira o mínimo existencial',
    html: () => campo('r', 'Renda líquida') + campo('p', 'Parcelas de dívidas de consumo, com o consignado'),
    calc: (o) => { if (!n(o.r)) return ''; const m = M.minimoExistencial(n(o.r), n(o.p)); return m.abaixo ? `Sobram <b>${R(m.sobra)}</b>, abaixo de ${R(m.minimo)}. Forte indício de superendividamento: procure a Defensoria ou o Procon com os contratos.` : `Sobram ${R(m.sobra)}, acima do mínimo de ${R(m.minimo)}.`; } },
  { id: 'orcamento', cap: 'cap8', depois: 'Modelo de orçamento mensal', titulo: 'O seu orçamento, com a fase da escada',
    html: () => campo('r', 'Renda certa') + campo('moradia', 'Moradia') + campo('comida', 'Mercado') + campo('contas', 'Luz, água e gás') + campo('transporte', 'Transporte') + campo('remedios', 'Remédios') + campo('pensao', 'Pensão') + campo('outros', 'Todo o resto, sem parcelas') + campo('parc', 'Parcelas de dívidas'),
    calc: (o) => { const r = n(o.r); if (!r) return ''; const ess = ['moradia', 'comida', 'contas', 'transporte', 'remedios', 'pensao'].reduce((s, k) => s + n(o[k]), 0); const nec = ess + n(o.outros); const saldo = r - nec - n(o.parc); const f = M.faseEscada(nec, r); return `Saldo do mês: <b>${R(saldo)}</b>. ${M.pct(f.pct, 0)} vai para o dia a dia: <b>fase ${f.fase}, ${f.nome}</b>.`; },
    atico: (o) => ({ rendaCerta: n(o.r), essenciais: { moradia: n(o.moradia), comida: n(o.comida), contas: n(o.contas), transporte: n(o.transporte), remedios: n(o.remedios), pensao: n(o.pensao) }, outrosGastos: n(o.outros) }) },
  { id: 'reserva', cap: 'cap9', depois: 'Quanto guardar', titulo: 'A sua meta de reserva',
    html: () => campo('d', 'Despesas básicas do mês') + `<label class="tc"><input type="checkbox" data-k="inc"> Minha renda é incerta (autônomo, bico, comissão)</label>` + campo('g', 'Quanto consegue guardar por mês'),
    calc: (o) => { if (!n(o.d)) return ''; const m = M.metaReserva(n(o.d), o.inc); const g = n(o.g); const meses = g ? Math.ceil(m.inicial / g) : 0; return `Primeira meta: <b>${R(m.inicial)}</b>${meses ? ` (em ${meses} ${meses > 1 ? 'meses' : 'mês'})` : ''}. Meta final: <b>${R(m.final)}</b>, ${m.meses} meses de despesas.`; } },
];

export function montarFerramenta(f, aoUsar) {
  const box = document.createElement('section');
  box.className = 'ferr';
  box.innerHTML = `<p class="ferr-t">Calculadora · ${esc(f.titulo)}</p>` + (f.mapa ? mapaHtml() : `<div class="ferr-c">${f.html()}</div><div class="ferr-r" aria-live="polite"></div>${f.atico ? '<button class="ferr-b" hidden>Levar para o Ático →</button>' : ''}`);
  if (f.mapa) { ligarMapa(box, aoUsar); return box; }
  const res = box.querySelector('.ferr-r'), btn = box.querySelector('.ferr-b');
  let usou = false;
  box.addEventListener('input', () => {
    const o = ler(box), out = f.calc(o);
    res.innerHTML = out; if (btn) btn.hidden = !out;
    if (out && !usou) { usou = true; aoUsar(f.id); }
  });
  if (btn) btn.onclick = () => { paraAtico(f.atico(ler(box))); location.href = '/atico/app.html'; };
  return box;
}

function linha() {
  return `<div class="mrow"><input data-m="nome" placeholder="Credor" maxlength="60" aria-label="Credor"><span class="tm"><i>R$</i><input data-m="saldo" inputmode="decimal" placeholder="valor hoje" aria-label="Valor hoje"></span><span class="tm"><i>%</i><input data-m="juros" inputmode="decimal" placeholder="juros/mês" aria-label="Juros ao mês"></span><label class="tc"><input type="checkbox" data-m="atraso"> atrasada</label></div>`;
}
function mapaHtml() { return `<div class="ferr-c" data-mapa>${linha()}${linha()}</div><button class="ferr-b sec" data-add>+ Outra dívida</button><div class="ferr-r" aria-live="polite"></div><button class="ferr-b" data-atico hidden>Levar o mapa para o Ático →</button>`; }
function ligarMapa(box, aoUsar) {
  const lista = () => [...box.querySelectorAll('.mrow')].map((r) => ({ nome: r.querySelector('[data-m=nome]').value.trim() || 'Dívida', saldo: n(r.querySelector('[data-m=saldo]').value), juros: n(r.querySelector('[data-m=juros]').value), atraso: r.querySelector('[data-m=atraso]').checked })).filter((d) => d.saldo > 0);
  let usou = false;
  const atualizar = () => {
    const ds = lista(), res = box.querySelector('.ferr-r'), b = box.querySelector('[data-atico]');
    if (!ds.length) { res.innerHTML = ''; b.hidden = true; return; }
    const total = ds.reduce((s, d) => s + d.saldo, 0), juros = ds.reduce((s, d) => s + d.saldo * d.juros / 100, 0);
    const ordem = M.ordemDividas(M.resumo({ dividas: ds.map((d, i) => ({ ...d, id: String(i) })) }), 'controlado').ordem;
    res.innerHTML = `Total: <b>${R(total)}</b>${juros ? ` · juros de <b>${R(juros)}</b> por mês` : ''}.<br>Ordem de ataque: ${ordem.map((o) => esc(o.nome)).join(' → ')}.`;
    b.hidden = false; if (!usou) { usou = true; aoUsar('mapa'); }
  };
  box.addEventListener('input', atualizar);
  box.querySelector('[data-add]').onclick = () => { box.querySelector('[data-mapa]').insertAdjacentHTML('beforeend', linha()); };
  box.querySelector('[data-atico]').onclick = () => { paraAtico({ dividas: lista() }); location.href = '/atico/app.html'; };
}
