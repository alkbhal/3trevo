/**
 * estante.js — Estante de clássicos em domínio público (escolha de obra).
 * Organiza as obras por gênero (prateleiras), com filtro, época, extensão e sinopse,
 * e um botão de escolha por obra. Sem dependências; textos via window.T (scripts/i18n.mjs).
 *
 * TTEstante.renderizar(el, obras, {
 *   rotuloAcao: 'Escolher este',
 *   aoEscolher: async (obra, botao) => {},
 *   bloqueada?: (obra) => motivo | null,   // ex.: espaço cheio
 * })
 * obra = { slug, titulo, autor, genero, ano_publicacao, paginas_estimadas, sinopse, featured }
 */
(function () {
  'use strict';

  const T = (k, v) => (window.T ? window.T(k, v) : k);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PALETA = [['#1e5c3a', '#0f2d1a'], ['#2a6b42', '#13361f'], ['#3d4f2a', '#1b2614'], ['#4a3a22', '#21180c']];

  function capa(o) {
    let h = 0;
    for (const ch of o.slug || o.titulo) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const [a, b] = PALETA[h % PALETA.length];
    return `<div class="es-capa" style="--es-a:${a};--es-b:${b}" aria-hidden="true">
      <span class="es-capa-ano">${esc(o.ano_publicacao || '')}</span>
      <span class="es-capa-titulo">${esc(o.titulo)}</span>
      <span class="es-capa-filete"></span>
      <span class="es-capa-autor">${esc(o.autor)}</span>
    </div>`;
  }

  function romano(n) {
    return [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']].reduce((acc, [v, r]) => { while (n >= v) { acc += r; n -= v; } return acc; }, '');
  }
  function epoca(ano) {
    if (!ano) return '';
    const s = Math.floor((ano - 1) / 100) + 1;
    const n = (window.TT_LANG || 'pt') === 'en'
      ? s + ([, 'st', 'nd', 'rd'][s % 100 > 10 && s % 100 < 14 ? 0 : s % 10] || 'th')
      : romano(s);
    return T('js.estante.seculo', { n });
  }

  function cartao(o, opcoes) {
    const bloqueio = opcoes.bloqueada ? opcoes.bloqueada(o) : null;
    const meta = [o.ano_publicacao, o.paginas_estimadas ? T('js.estante.paginas', { n: o.paginas_estimadas }) : '']
      .filter(Boolean).map(esc).join(' · ');
    return `<article class="es-obra" data-slug="${esc(o.slug)}">
      ${capa(o)}
      <div class="es-info">
        <h5 class="es-titulo">${esc(o.titulo)}</h5>
        <p class="es-autor">${esc(o.autor)}</p>
        ${meta ? `<p class="es-meta">${meta}</p>` : ''}
        ${o.sinopse ? `<details class="es-sinopse"><summary>${T('js.estante.sobre')}</summary><p>${esc(o.sinopse)}</p></details>` : ''}
        <button type="button" class="btn-ler es-escolher" data-slug="${esc(o.slug)}"${bloqueio ? ` disabled title="${esc(bloqueio)}"` : ''}>${esc(opcoes.rotuloAcao)}</button>
      </div>
    </article>`;
  }

  function renderizar(el, obras, opcoes) {
    if (!obras.length) {
      el.innerHTML = `<p class="es-vazia">${T('js.estante.vazia')}</p>`;
      return;
    }
    const generos = [...new Set(obras.map((o) => o.genero || T('js.estante.outros')))].sort((a, b) => a.localeCompare(b));
    const destaque = obras.filter((o) => o.featured);
    let filtro = 'todos';

    function prateleiras() {
      const grupos = filtro === 'todos' ? generos : [filtro];
      return grupos.map((g) => {
        const lista = obras.filter((o) => (o.genero || T('js.estante.outros')) === g)
          .sort((a, b) => (a.ano_publicacao || 0) - (b.ano_publicacao || 0));
        if (!lista.length) return '';
        const anos = lista.map((o) => o.ano_publicacao).filter(Boolean);
        const faixa = anos.length ? (epoca(Math.min(...anos)) === epoca(Math.max(...anos)) ? epoca(anos[0]) : `${epoca(Math.min(...anos))} – ${epoca(Math.max(...anos))}`) : '';
        return `<section class="es-prateleira">
          <header class="es-prateleira-topo"><h4>${esc(g)}</h4><span>${lista.length === 1 ? T('js.estante.obra1') : T('js.estante.obras', { n: lista.length })}${faixa ? ' · ' + esc(faixa) : ''}</span></header>
          <div class="es-linha">${lista.map((o) => cartao(o, opcoes)).join('')}</div>
        </section>`;
      }).join('');
    }

    el.innerHTML = `<div class="es">
      ${destaque.length && generos.length > 1 ? `<p class="es-dica">${T('js.estante.dica', { titulos: destaque.slice(0, 2).map((o) => esc(o.titulo)).join(' · ') })}</p>` : ''}
      ${generos.length > 1 ? `<div class="es-filtros" role="group" aria-label="${T('js.estante.filtro')}">
        <button type="button" class="es-filtro ativo" data-genero="todos" aria-pressed="true">${T('js.estante.todos')}</button>
        ${generos.map((g) => `<button type="button" class="es-filtro" data-genero="${esc(g)}" aria-pressed="false">${esc(g)}</button>`).join('')}
      </div>` : ''}
      <div class="es-prateleiras">${prateleiras()}</div>
    </div>`;

    el.onclick = async (e) => {
      const f = e.target.closest('.es-filtro');
      if (f) {
        filtro = f.dataset.genero;
        el.querySelectorAll('.es-filtro').forEach((b) => {
          const ativo = b === f;
          b.classList.toggle('ativo', ativo);
          b.setAttribute('aria-pressed', String(ativo));
        });
        el.querySelector('.es-prateleiras').innerHTML = prateleiras();
        return;
      }
      const b = e.target.closest('.es-escolher');
      if (b && !b.disabled) {
        const obra = obras.find((o) => o.slug === b.dataset.slug);
        b.disabled = true;
        try { await opcoes.aoEscolher(obra, b); } finally { if (document.body.contains(b)) b.disabled = false; }
      }
    };
  }

  window.TTEstante = { renderizar };
})();
