// Leitor interativo do "Livre das Dívidas": leitura + cenas + calculadoras + missões.
// Pontos de leitura (PL) medem o progresso; não são dinheiro, desconto nem Nema.
import { CENAS } from './leitura-cenas.js';
import { FERRAMENTAS, montarFerramenta } from './leitura-ferramentas.js';

const API = 'https://tres-trevo-api.al-kbhal.workers.dev';
const SLUG = 'livre-das-dividas', KEY = 'tt_ldd_v1', NOITE = 'tt_ldd_noite';
const $ = (s) => document.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ler = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* modo privado */ } };
const hoje = () => new Date().toISOString().slice(0, 10);

let S = Object.assign({ cap: 'prefacio', pl: 0, lidos: {}, missoes: {}, cenas: {}, ferramentas: {}, dias: [], conquistas: {} }, ler(KEY) || {});
const salvar = () => gravar(KEY, S);
let LIVRO = { indice: [], capitulos: {} }, ACESSO = 'amostra';

// ─── Markdown seguro (escapa antes de formatar) ──────────────────────────────
const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
export function md(src) {
  const out = []; const blocos = String(src).split(/\n{2,}/);
  for (const b of blocos) {
    const t = b.trim(); if (!t) continue;
    let m;
    if ((m = t.match(/^(#{3,4}) (.+)$/))) { out.push(`<h${m[1].length - 1} data-sec="${esc(m[2])}">${inline(m[2])}</h${m[1].length - 1}>`); continue; }
    if (t.startsWith('|')) {
      const ls = t.split('\n').filter((l) => !/^\|\s*:?-/.test(l) && !/^\|(\s*\|)+\s*$/.test(l));
      const rows = ls.map((l) => l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
      out.push('<div class="tw"><table>' + rows.map((r, i) => '<tr>' + r.map((c) => (i ? '<td>' : '<th>') + inline(c) + (i ? '</td>' : '</th>')).join('') + '</tr>').join('') + '</table></div>');
      continue;
    }
    if (t.startsWith('>')) { out.push(`<blockquote>${inline(t.replace(/^>\s?/gm, ''))}</blockquote>`); continue; }
    if (/^\s*- /.test(t)) { out.push('<ul>' + t.split('\n').map((l) => `<li>${inline(l.replace(/^\s*- /, ''))}</li>`).join('') + '</ul>'); continue; }
    if (/^\d+\.\s/.test(t)) { out.push('<ol>' + t.split('\n').map((l) => `<li>${inline(l.replace(/^\s*\d+\.\s+/, ''))}</li>`).join('') + '</ol>'); continue; }
    out.push(`<p>${inline(t).replace(/\n/g, '<br>')}</p>`);
  }
  return out.join('');
}

// ─── Gamificação ─────────────────────────────────────────────────────────────
const CONQUISTAS = [
  { id: 'primeiro', nome: 'Primeiro passo', desc: 'Leu o primeiro capítulo.', ok: () => S.lidos.cap1 },
  { id: 'espelho', nome: 'Olhou no espelho', desc: 'Fez o autoteste do capítulo 1.', ok: () => S.ferramentas.autoteste },
  { id: 'cena', nome: 'Decidiu com calma', desc: 'Terminou uma cena interativa.', ok: () => Object.values(S.cenas).some((c) => c.fim) },
  { id: 'monstro', nome: 'Encarou o monstro', desc: 'Montou o mapa das dívidas.', ok: () => S.ferramentas.mapa },
  { id: 'negociador', nome: 'Negociador preparado', desc: 'Calculou a parcela que cabe.', ok: () => S.ferramentas.cabe },
  { id: 'direitos', nome: 'Conhece os seus direitos', desc: 'Leu o capítulo 7.', ok: () => S.lidos.cap7 },
  { id: 'acao', nome: 'Da página para a vida', desc: 'Cumpriu 3 missões "Para fazer agora".', ok: () => Object.values(S.missoes).filter(Boolean).length >= 3 },
  { id: 'constancia', nome: 'Constância', desc: 'Leu em 3 dias seguidos.', ok: () => sequencia() >= 3 },
  { id: 'livre', nome: 'Livre', desc: 'Leu o livro inteiro.', ok: () => ['cap1', 'cap2', 'cap3', 'cap4', 'cap5', 'cap6', 'cap7', 'cap8', 'cap9'].every((c) => S.lidos[c]) },
];
function sequencia() {
  const d = [...new Set(S.dias)].sort().reverse(); let n = 0, ref = new Date(hoje());
  for (const x of d) { if (x === ref.toISOString().slice(0, 10)) { n++; ref.setDate(ref.getDate() - 1); } else break; }
  return n;
}
function ganhar(pl, motivo, ev) {
  S.pl = Math.max(0, S.pl + pl); salvar(); hud(true);
  if (pl && ev) { const f = document.createElement('span'); f.className = 'float ' + (pl > 0 ? 'up' : 'down'); f.textContent = (pl > 0 ? '+' : '−') + Math.abs(pl) + ' PL'; f.style.left = ev.x + 'px'; f.style.top = ev.y + 'px'; document.body.appendChild(f); setTimeout(() => f.remove(), 800); }
  for (const c of CONQUISTAS) if (!S.conquistas[c.id] && c.ok()) { S.conquistas[c.id] = hoje(); salvar(); aviso('Conquista: ' + c.nome); }
  if (motivo) aviso(motivo);
}
function hud(pulso) { const h = $('#hud'); h.textContent = S.pl + ' PL'; if (pulso) { h.classList.remove('pulse'); void h.offsetWidth; h.classList.add('pulse'); } }
function aviso(t) { const el = $('#aviso'); el.textContent = t; el.classList.add('on'); clearTimeout(aviso.t); aviso.t = setTimeout(() => el.classList.remove('on'), 2600); }
function progresso() {
  const caps = LIVRO.indice.filter((i) => /^cap\d/.test(i.id)); const lidos = caps.filter((i) => S.lidos[i.id]).length;
  const p = caps.length ? Math.round((lidos / caps.length) * 100) : 0;
  $('#fill').style.width = p + '%'; $('#pct').textContent = lidos + ' de ' + caps.length + ' capítulos · ' + sequencia() + ' dia(s) seguidos';
}

// ─── Cena interativa ─────────────────────────────────────────────────────────
function cena(capId, alvo) {
  const def = CENAS[capId]; if (!def) return;
  const est = S.cenas[capId] || (S.cenas[capId] = { node: def.inicio, caminho: [], pontos: 0, fim: false });
  const no = def.nodes[est.node] || def.nodes[def.inicio];
  alvo.innerHTML = `<p class="eyebrow">Cena ${String(est.caminho.length + 1).padStart(2, '0')} · ${esc(def.titulo)}</p><h3>${esc(no.title)}</h3>${md(no.content_markdown)}` +
    (no.is_terminal
      ? `<p class="fimcena">Você somou <b>${est.pontos} PL</b> nesta cena.</p><button class="ghost" data-rec>Viver a cena de novo</button>`
      : `<div class="choices">${no.choices.map((c, i) => `<button class="choice" data-i="${i}"><span class="key">${'ABC'[i]}.</span>${esc(c.label)}<span class="meta"><span class="delta ${c.pontos > 0 ? 'up' : c.pontos < 0 ? 'down' : 'flat'}">${c.pontos > 0 ? '+' : c.pontos < 0 ? '−' : ''}${Math.abs(c.pontos)} PL</span>${c.hint ? `<span>${esc(c.hint)}</span>` : ''}</span></button>`).join('')}</div>`);
  alvo.querySelectorAll('.choice').forEach((b) => b.onclick = (e) => {
    alvo.querySelectorAll('.choice').forEach((x) => (x.disabled = true));
    const c = no.choices[+b.dataset.i]; const ja = est.caminho.includes(c.id);
    est.caminho.push(c.id); est.node = c.target_node_id;
    if (!ja && !est.repetida) { est.pontos += c.pontos; ganhar(c.pontos, '', { x: e.clientX || 40, y: e.clientY || 120 }); }
    if (est.node === 'fim' || def.nodes[est.node].is_terminal) { est.fim = true; if (!est.repetida) ganhar(10, 'Cena concluída'); }
    salvar(); setTimeout(() => cena(capId, alvo), 450);
  });
  const rec = alvo.querySelector('[data-rec]');
  if (rec) rec.onclick = () => { S.cenas[capId] = { node: def.inicio, caminho: [], pontos: 0, fim: false, repetida: true }; salvar(); cena(capId, alvo); };
}

// ─── Capítulo ────────────────────────────────────────────────────────────────
function abrir(id, rolar = true) {
  const item = LIVRO.indice.find((i) => i.id === id) || LIVRO.indice[0];
  if (!item) return;
  S.cap = item.id; if (!S.dias.includes(hoje())) S.dias = S.dias.concat(hoje()).slice(-60); salvar();
  $('#titCap').textContent = item.titulo.replace(/ — .*/, '');
  const cap = LIVRO.capitulos[item.id];
  const pos = LIVRO.indice.indexOf(item), ant = LIVRO.indice[pos - 1], prox = LIVRO.indice[pos + 1];
  const nav = `<nav class="capnav">${ant ? `<button class="ghost" data-ir="${ant.id}">← ${esc(ant.titulo.replace(/ — .*/, ''))}</button>` : '<span></span>'}${prox ? `<button class="primary" data-ir="${prox.id}">${esc(prox.titulo.replace(/ — .*/, ''))} →</button>` : ''}</nav>`;
  if (!cap) { $('#app').innerHTML = `<article class="scene"><p class="eyebrow">${esc(item.titulo)}</p>${paywall()}</article>${nav}`; ligarNav(); return; }
  $('#app').innerHTML = `<article class="scene"><p class="eyebrow">${S.lidos[item.id] ? 'Lido ✓' : 'Leitura'}</p><h1>${esc(cap.titulo)}</h1>${cap.subtitulo ? `<p class="sub">${esc(cap.subtitulo)}</p>` : ''}<div class="prose">${md(cap.md)}</div><div id="fimcap"></div></article>${nav}`;
  const prose = $('.prose');
  // calculadoras depois das seções indicadas
  FERRAMENTAS.filter((f) => f.cap === item.id).forEach((f) => {
    const h = [...prose.querySelectorAll('[data-sec]')].find((x) => x.dataset.sec === f.depois);
    if (!h) return;
    let fimSec = h.nextElementSibling; while (fimSec && fimSec.nextElementSibling && !/^H[23]$/.test(fimSec.nextElementSibling.tagName)) fimSec = fimSec.nextElementSibling;
    (fimSec || h).after(montarFerramenta(f, (fid) => { if (!S.ferramentas[fid]) { S.ferramentas[fid] = hoje(); ganhar(15, 'Calculadora usada: +15 PL'); } }));
  });
  // cena antes de "Para fazer agora"
  const missaoH = [...prose.querySelectorAll('[data-sec]')].find((x) => x.dataset.sec === 'Para fazer agora');
  if (CENAS[item.id]) {
    const box = document.createElement('section'); box.className = 'cena';
    box.innerHTML = `<p class="ferr-t">Cena interativa · ${esc(CENAS[item.id].titulo)}</p><button class="primary" data-viver>${S.cenas[item.id] ? 'Continuar a cena' : 'Viver a cena'}</button>`;
    (missaoH || prose.lastElementChild).before(box);
    box.querySelector('[data-viver]').onclick = () => cena(item.id, box);
  }
  if (missaoH && missaoH.nextElementSibling) {
    const ok = document.createElement('label'); ok.className = 'missao';
    ok.innerHTML = `<input type="checkbox"${S.missoes[item.id] ? ' checked' : ''}> Fiz esta missão <span class="delta up">+20 PL</span>`;
    missaoH.nextElementSibling.after(ok);
    ok.querySelector('input').onchange = (e) => { S.missoes[item.id] = e.target.checked; ganhar(e.target.checked ? 20 : -20, e.target.checked ? 'Missão cumprida' : ''); };
  }
  // capítulo lido ao chegar ao fim
  new IntersectionObserver((ents, obs) => { if (ents[0].isIntersecting) { obs.disconnect(); if (!S.lidos[item.id]) { S.lidos[item.id] = hoje(); ganhar(10, 'Capítulo lido: +10 PL'); progresso(); } } }).observe($('#fimcap'));
  ligarNav(); progresso();
  if (rolar) window.scrollTo(0, 0);
}
function ligarNav() { document.querySelectorAll('[data-ir]').forEach((b) => (b.onclick = () => abrir(b.dataset.ir))); }
function paywall() {
  if (ACESSO === 'sem_compra') return `<div class="panel"><h2>Este capítulo é da edição completa</h2><p>Você já leu a amostra. A edição completa traz os capítulos 3 a 9, as calculadoras, as cenas e o apêndice com todas as contas.</p><p><a class="primary" href="/checkout.html?slug=${SLUG}">Ler a edição completa</a></p></div>`;
  if (ACESSO === 'erro') return `<div class="panel"><h2>Não consegui abrir agora</h2><p>A conexão falhou. Tente de novo em instantes.</p><button class="primary" onclick="location.reload()">Tentar de novo</button></div>`;
  return `<div class="panel"><h2>Continue a leitura</h2><p>Os capítulos 3 a 9 são da edição completa. Já comprou? Entre com o seu e-mail e volte aqui: a leitura continua de onde parou.</p><p style="display:flex;gap:10px;flex-wrap:wrap"><a class="primary" href="/checkout.html?slug=${SLUG}">Ler a edição completa</a><a class="ghost" href="/area-cliente.html?volta=${encodeURIComponent('/leitura/livre-das-dividas.html')}">Já comprei · entrar</a></p></div>`;
}

// ─── Menu: sumário, conquistas, ajustes ──────────────────────────────────────
function menu() {
  $('#sheetBody').innerHTML = `<h2>Sumário</h2><ul class="sum">${LIVRO.indice.map((i) => `<li><button data-ir="${i.id}" class="${i.id === S.cap ? 'atual' : ''}">${S.lidos[i.id] ? '✓ ' : ''}${esc(i.titulo)}${LIVRO.capitulos[i.id] ? '' : ' 🔒'}</button></li>`).join('')}</ul>
    <h2>Conquistas · ${Object.keys(S.conquistas).length} de ${CONQUISTAS.length}</h2><ul class="conq">${CONQUISTAS.map((c) => `<li class="${S.conquistas[c.id] ? 'ok' : ''}"><b>${esc(c.nome)}</b><span>${esc(c.desc)}</span></li>`).join('')}</ul>
    <p class="note">Pontos de leitura (PL) medem o seu progresso neste aparelho. Não são dinheiro, desconto nem Nema.</p>
    <p><a class="primary" href="/atico/app.html">Abrir o Ático com os meus números</a></p>
    <button class="ghost" id="zerar">Recomeçar do zero</button>`;
  $('#sheet').hidden = false;
  document.querySelectorAll('#sheetBody [data-ir]').forEach((b) => (b.onclick = () => { $('#sheet').hidden = true; abrir(b.dataset.ir); }));
  $('#zerar').onclick = () => { if (confirm('Apagar pontos, conquistas e respostas deste aparelho?')) { localStorage.removeItem(KEY); location.reload(); } };
}

// ─── Carga: amostra pública + edição completa para quem comprou ──────────────
async function carregar() {
  // Uma fonte só: o worker entrega o índice, os capítulos livres e, a quem comprou, o resto.
  for (let i = 0; i < 20 && !window.sb; i++) await new Promise((r) => setTimeout(r, 150));
  let token = null;
  try { const { data } = window.sb ? await window.sb.auth.getSession() : { data: {} }; token = data && data.session ? data.session.access_token : null; } catch { /* visitante */ }
  const r = await fetch(`${API}/api/leitura/${SLUG}`, token ? { headers: { Authorization: 'Bearer ' + token } } : {});
  const d = await r.json();
  if (!d.ok) throw new Error(d.erro || 'indisponivel');
  LIVRO.indice = d.indice.map((i) => ({ ...i, aberto: i.acesso === 'livre' }));
  d.capitulos.forEach((c) => (LIVRO.capitulos[c.id] = c));
  ACESSO = d.comprador ? 'completa' : d.logado ? 'sem_compra' : 'amostra';
  if (d.comprador) $('#edicao').textContent = 'Edição completa';
  abrir(S.cap, false);
}

function noite(on) { document.body.classList.toggle('night', !!on); $('#nightBtn').textContent = on ? '☀️' : '🌙'; gravar(NOITE, !!on); }
$('#nightBtn').onclick = () => noite(!document.body.classList.contains('night'));
$('#menuBtn').onclick = menu;
$('#sheet').onclick = (e) => { if (e.target.id === 'sheet' || e.target.dataset.fecha !== undefined) $('#sheet').hidden = true; };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#sheet').hidden = true; });
noite(ler(NOITE)); hud(false);
carregar().catch(() => { $('#app').innerHTML = '<p>Não consegui abrir o livro agora. Tente de novo em instantes.</p>'; });
