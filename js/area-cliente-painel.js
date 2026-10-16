/**
 * area-cliente-painel.js — Painel pós-login da área do cliente (modelo freemium).
 * Carregado ANTES do script inline de area-cliente.html, que chama estas funções
 * depois do login. Depende de: sb/EDGE_BASE (supabase-client.js), TTPlayer
 * (player.js), TTLeitor (leitor-tt.js) e de toast()/usuarioAtual da página.
 *
 * Início: player "Momento Uau" (trilhas da editora já no login), clássicos de
 * domínio público prontos para ler (grátis para quem tem conta) e a vitrine do
 * Clube Três Trevo com os títulos autorais que a pessoa ainda não tem.
 */
const API_TT = 'https://tres-trevo-api.al-kbhal.workers.dev';

const escPainel = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brlPainel = (v) => 'R$ ' + Number(v).toFixed(2).replace('.', ',');

// Capa tipográfica para obra sem imagem: título em serifada sobre verde e filete dourado.
function capaTipografica(titulo, autor) {
  return `<div class="capa-tipo"><span class="capa-tipo-titulo">${escPainel(titulo)}</span>${autor ? `<span class="capa-tipo-autor">${escPainel(autor)}</span>` : ''}</div>`;
}
function capaObra(o) {
  return o.capa_url
    ? `<img class="capa-img" src="${escPainel(o.capa_url)}" alt="" loading="lazy" onerror="this.outerHTML=capaTipografica(${escPainel(JSON.stringify(o.titulo || ''))},${escPainel(JSON.stringify(o.autor || ''))})">`
    : capaTipografica(o.titulo, o.autor);
}

// ── Músicas: uma consulta só, usada no Início e na aba Músicas ─────────────────
let musicasPromessa = null;
function obterMusicasLiberadas() {
  if (!musicasPromessa) {
    musicasPromessa = Promise.all([
      sb.from('musicas').select('*').eq('ativo', true).order('ordem'),
      sb.from('user_library').select('product_id').eq('user_id', usuarioAtual.id),
    ]).then(([m, lib]) => {
      const meus = new Set((lib.data || []).map((l) => l.product_id));
      return (m.data || []).filter((x) => x.gratuita || (x.produto_id && meus.has(x.produto_id)));
    }).catch(() => []);
  }
  return musicasPromessa;
}

async function renderMomentoUau() {
  const el = document.getElementById('momentoUau');
  if (!el) return;
  const faixas = (await obterMusicasLiberadas()).filter((m) => m.arquivo_url);
  if (!faixas.length) { el.hidden = true; return; }
  if (window.TTPlayer) TTPlayer.loadPlaylist(faixas);
  const f = faixas[0];
  el.hidden = false;
  el.innerHTML = `
    <button class="uau-play" type="button" aria-label="Ouvir ${escPainel(f.titulo)}" onclick="tocarMomentoUau('${escPainel(f.id)}')">
      <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true"><polygon points="7,4 20,12 7,20"/></svg>
    </button>
    <div class="uau-texto">
      <div class="uau-rotulo">Trilha exclusiva da editora</div>
      <div class="uau-titulo">${escPainel(f.titulo || 'Faixa')}</div>
      <div class="uau-sub">${escPainel(f.artista || 'Três Trevo')} · ${faixas.length} ${faixas.length === 1 ? 'faixa liberada' : 'faixas liberadas'} para você</div>
    </div>
    <button class="uau-link" type="button" onclick="irParaAba('musicas')">Ver todas →</button>`;
}
function tocarMomentoUau(id) { if (window.TTPlayer) TTPlayer.play(id); }

// ── Biblioteca Clássica: sessão de leitor a partir do login da conta ───────────
async function sessaoBiblioteca(forcarNova) {
  const email = (usuarioAtual?.email || '').toLowerCase();
  try {
    if (!forcarNova && localStorage.getItem('bib_email') === email && localStorage.getItem('bib_token')) return localStorage.getItem('bib_token');
  } catch { /* sem armazenamento: pede sessão nova */ }
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  const r = await fetch(`${API_TT}/api/biblioteca/sessao-conta`, { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } });
  const d = await r.json().catch(() => ({}));
  if (!d.ok) return null;
  try { localStorage.setItem('bib_token', d.token); localStorage.setItem('bib_email', d.email); } catch { /* idem */ }
  return d.token;
}

async function apiBiblioteca(caminho, opcoes = {}, jaTentou) {
  const token = await sessaoBiblioteca(jaTentou);
  if (!token) throw new Error('Entre novamente para acessar a biblioteca.');
  const r = await fetch(`${API_TT}${caminho}`, {
    ...opcoes,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opcoes.headers || {}) },
  });
  if (r.status === 401 && !jaTentou) return apiBiblioteca(caminho, opcoes, true); // sessão de 24h venceu
  return r.json();
}

let classicosCache = null;
async function obterClassicos(recarregar) {
  if (!classicosCache || recarregar) classicosCache = apiBiblioteca('/api/biblioteca/minha').catch((e) => ({ ok: false, erro: e.message }));
  return classicosCache;
}

function cartaoClassico(o, slot) {
  const pct = slot ? Math.round(slot.progresso_percentual ?? 0) : null;
  const bloqueado = o.acesso === 'compra' && !o.possui;
  const selo = bloqueado ? '<span class="selo selo-ouro">🔒 Avulso</span>' : (o.acesso === 'compra' ? '<span class="selo">✓ Seu</span>' : '<span class="selo">Grátis</span>');
  const acao = bloqueado
    ? `href="/checkout.html?slug=${encodeURIComponent(o.slug)}"`
    : `href="#" onclick="event.preventDefault();lerClassico('${escPainel(o.slug)}')"`;
  return `<a class="classico" ${acao}>
    <div class="classico-capa">${capaObra(o)}${selo}</div>
    <div class="classico-titulo">${escPainel(o.titulo)}</div>
    <div class="classico-autor">${escPainel(o.autor || '')}</div>
    ${pct !== null ? `<div class="classico-barra" aria-label="${pct}% lido"><span style="width:${pct}%"></span></div>` : ''}
  </a>`;
}

async function renderClassicos(destino, limite) {
  const el = document.getElementById(destino);
  if (!el) return;
  el.innerHTML = '<div class="loading"><div class="loading-spinner"></div><span class="loading-txt">Carregando</span></div>';
  const d = await obterClassicos();
  if (!d.ok) { el.innerHTML = `<p class="painel-aviso">${escPainel(d.erro || d.msg || 'Biblioteca indisponível agora. Tente em instantes.')}</p>`; return; }
  const porSlug = new Map((d.slots || []).map((s) => [s.slug, s]));
  // Obras em leitura primeiro, depois o acervo.
  const obras = [...(d.catalogo || [])].sort((a, b) => (porSlug.has(b.slug) ? 1 : 0) - (porSlug.has(a.slug) ? 1 : 0));
  const lista = limite ? obras.slice(0, limite) : obras;
  if (!lista.length) { el.innerHTML = '<p class="painel-aviso">O acervo de clássicos está sendo preparado.</p>'; return; }
  el.innerHTML = lista.map((o) => cartaoClassico(o, porSlug.get(o.slug))).join('');
  const cont = document.getElementById('classicosContador');
  if (cont) cont.textContent = `${(d.slots || []).length}/${d.slots_max || 3} em leitura`;
}

async function lerClassico(slug) {
  const d = await obterClassicos();
  const obra = (d.catalogo || []).find((o) => o.slug === slug);
  if (!obra) return;
  let slot = (d.slots || []).find((s) => s.slug === slug);
  if (!slot) {
    const sel = await apiBiblioteca('/api/biblioteca/selecionar', { method: 'POST', body: JSON.stringify({ slug }) }).catch(() => ({}));
    if (!sel.ok) { toast(sel.msg || (sel.erro === 'slots_cheios' ? 'Você já tem 3 obras abertas. Conclua uma para abrir outra.' : 'Não foi possível abrir esta obra.'), 'erro'); return; }
    slot = ((await obterClassicos(true)).slots || []).find((s) => s.slug === slug);
    renderClassicos('listaClassicos');
    renderClassicos('inicioClassicos', 6);
  }
  TTLeitor.abrir({
    titulo: obra.titulo,
    chave: `classico:${slug}`,
    obterArquivo: async () => {
      const r = await apiBiblioteca('/api/biblioteca/ler', { method: 'POST', body: JSON.stringify({ slug }) });
      if (!r.ok) throw new Error(r.msg || 'Não foi possível abrir esta obra.');
      return { url: r.stream_url, formato: 'epub' };
    },
    aoProgresso: (pct) => {
      if (!slot) return;
      apiBiblioteca('/api/biblioteca/progresso', { method: 'POST', body: JSON.stringify({ slot_id: slot.id, pagina_atual: 0, progresso_percentual: pct }) }).catch(() => {});
    },
    aoFechar: () => { obterClassicos(true); renderClassicos('listaClassicos'); renderClassicos('inicioClassicos', 6); },
  });
}

// ── Vitrine do Clube Três Trevo: autorais que a pessoa ainda não tem ───────────
async function renderVitrineClube() {
  const el = document.getElementById('vitrineClube');
  if (!el) return;
  try {
    const [cat, lib] = await Promise.all([
      fetch(`${API_TT}/api/public/catalogo`).then((r) => r.json()),
      sb.from('user_library').select('produto:product_id(slug)').eq('user_id', usuarioAtual.id),
    ]);
    const tenho = new Set((lib.data || []).map((l) => l.produto?.slug).filter(Boolean));
    const livros = (Array.isArray(cat) ? cat : []).filter((l) => !tenho.has(l.slug));
    if (!livros.length) { el.closest('.bloco-clube')?.setAttribute('hidden', ''); return; }
    el.innerHTML = livros.map((l) => `
      <div class="clube-card">
        <div class="clube-capa">${capaObra(l)}<span class="selo selo-ouro">👑 Exclusivo</span></div>
        <div class="clube-info">
          <div class="clube-titulo">${escPainel(l.titulo)}</div>
          <div class="clube-desc">${escPainel((l.descricao || '').slice(0, 110))}${(l.descricao || '').length > 110 ? '…' : ''}</div>
          <button class="clube-cta" type="button" onclick="irParaAba('clube')">Entrar no Clube Três Trevo</button>
          <a class="clube-avulso" href="/checkout.html?slug=${encodeURIComponent(l.slug)}">ou compre avulso · ${brlPainel(l.preco)}</a>
        </div>
      </div>`).join('');
  } catch {
    el.closest('.bloco-clube')?.setAttribute('hidden', '');
  }
}

function irParaAba(id) {
  const btn = document.querySelector(`.aba[data-aba="${id}"]`);
  if (btn) { trocarAba(id, btn); btn.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); window.scrollTo({ top: 0, behavior: 'smooth' }); }
}

function carregarInicio() {
  renderMomentoUau();
  renderClassicos('inicioClassicos', 6);
  renderVitrineClube();
}
