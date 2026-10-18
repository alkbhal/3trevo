/**
 * membro.js — Área de membros grátis (contas sem compra) na área do cliente.
 * Mostra: amostra grátis (só no site PT: a amostra é de um livro em português), UM espaço
 * de leitura para um clássico em domínio público do idioma da página (tabela leitura_livre
 * + edge function livre-epub; estante em js/estante.js) e o cartão do Nema.
 * Quem compra continua com os 3 espaços da Biblioteca TT — este módulo não aparece para eles.
 *
 * Usa globais da área do cliente: sb, EDGE_BASE, usuarioAtual, capaTipografica, escHtml, toast.
 * Textos: window.T (dicionário do idioma, gerado por scripts/i18n.mjs).
 * TTMembro.renderizar(containerEl) é chamado por carregarBiblioteca() quando não há ebooks.
 */
(function () {
  'use strict';

  const T = (k, v) => (window.T ? window.T(k, v) : k);
  const LANG = window.TT_LANG || 'pt';
  const PREFIXO = LANG === 'pt' ? '' : '/' + LANG;

  // A amostra é de um livro em português: só existe no site PT.
  const AMOSTRA = LANG === 'pt' ? {
    titulo: 'O Nascimento Silencioso da 3ª Guerra Mundial',
    autor: 'Said Anes',
    epub: '/amostras/3a-guerra-capitulo-1.epub',
    pagina: '/obra/terceiraguerra.html',
  } : null;

  let container = null;

  const esc = (v) => (typeof escHtml === 'function' ? escHtml(v) : String(v ?? ''));
  const capa = (t, a, s) => (typeof capaTipografica === 'function' ? capaTipografica(t, a, s) : '');

  function card({ titulo, autor, slug, selo, corpo }) {
    return `<div class="ebook-card mb-card">
      <div class="ebook-capa">${capa(titulo, autor, slug)}${selo ? `<span class="ebook-capa-genero">${esc(selo)}</span>` : ''}</div>
      <div class="ebook-body">
        <div class="ebook-titulo">${esc(titulo)}</div>
        <div class="ebook-autor">${esc(autor)}</div>
        ${corpo}
      </div>
    </div>`;
  }

  function cartaoNema() {
    return `<aside class="mb-nema" aria-label="${T('js.nema.aria')}">
      <div class="mb-nema-selo" aria-hidden="true">N</div>
      <div class="mb-nema-texto">
        <p class="mb-nema-rotulo">${T('js.nema.rotulo')}</p>
        <h4 class="mb-nema-titulo">${T('js.nema.titulo')}</h4>
        <p>${T('js.nema.texto')}</p>
        <div class="mb-nema-acoes">
          ${LANG === 'pt' ? `<a class="mb-btn" href="/catalogo.html">${T('js.nema.catalogo')}</a>` : ''}
          <a class="mb-link" href="${PREFIXO}/nema.html">${T('js.nema.como')}</a>
        </div>
      </div>
    </aside>`;
  }

  async function renderizar(el) {
    container = el || container;
    if (!container) return;
    container.innerHTML = `<div class="loading"><div class="loading-spinner"></div><span class="loading-txt">${T('js.carregando')}</span></div>`;

    const [espacoR, acervoR] = await Promise.all([
      sb.from('leitura_livre').select('acervo_slug, progresso').eq('user_id', usuarioAtual.id).maybeSingle(),
      // PT: clássicos da Biblioteca TT (acesso bônus). EN/ES: estante própria, separada para
      // que obras em outros idiomas nunca apareçam no site PT (scripts/estante_intl.sql).
      (LANG === 'pt'
        ? sb.from('biblioteca_acervo').select('slug, titulo, autor, genero, ano_publicacao, paginas_estimadas, sinopse, featured')
            .eq('ativo', true).eq('acesso', 'bonus').eq('idioma', 'pt')
        : sb.from('estante_intl').select('slug, titulo, autor, genero, ano_publicacao, paginas_estimadas, sinopse, featured')
            .eq('ativo', true).eq('idioma', LANG)
      ).order('titulo'),
    ]);
    const espaco = espacoR.data;
    const acervo = acervoR.data || [];
    const obra = espaco && acervo.find((o) => o.slug === espaco.acervo_slug);

    const amostra = AMOSTRA ? `<h4 class="mb-secao">${T('js.membro.amostra.secao')}</h4>
      <div class="biblioteca-grid">${card({
        titulo: AMOSTRA.titulo, autor: AMOSTRA.autor, slug: '3a-guerra', selo: T('js.membro.amostra.selo'),
        corpo: `<div class="ebook-footer"><button class="btn-ler" data-mb="amostra">${T('js.membro.amostra.ler')}</button></div>`,
      })}</div>` : '';

    let classico;
    if (obra) {
      const pct = Math.round(Number(espaco.progresso) || 0);
      classico = `<div class="biblioteca-grid">${card({
        titulo: obra.titulo, autor: obra.autor, slug: obra.slug, selo: T('js.membro.seu.classico'),
        corpo: `<div class="mb-progresso" aria-label="${T('js.membro.lido', { n: pct })}"><span style="width:${pct}%"></span></div>
          <div class="mb-progresso-txt">${T('js.membro.lido', { n: pct })}</div>
          <div class="ebook-footer">
            <button class="btn-ler" data-mb="ler" data-slug="${esc(obra.slug)}">${pct > 0 ? T('js.membro.continuar') : T('js.membro.comecar')}</button>
            <button class="mb-trocar" data-mb="trocar">${T('js.membro.trocar')}</button>
          </div>`,
      })}</div>`;
    } else {
      classico = `<p class="mb-texto">${T('js.membro.escolha')}</p><div class="mb-estante"></div>`;
    }

    container.innerHTML = `<section class="mb">
      <div class="mb-boasvindas">
        <p class="mb-rotulo">✦ ${T('js.membro.rotulo')}</p>
        <h3 class="mb-titulo">${T('js.membro.titulo')}</h3>
        <p class="mb-texto">${AMOSTRA ? T('js.membro.intro.pt') : T('js.membro.intro')}</p>
      </div>
      ${amostra}
      <h4 class="mb-secao">${T('js.membro.classico.secao')} <span class="mb-espaco">${T('js.membro.espaco')}</span></h4>
      ${classico}
      <p class="mb-nota">${AMOSTRA ? T('js.membro.nota') : T('js.membro.nota.intl')}</p>
      ${cartaoNema()}
    </section>`;
    container.querySelector('.mb').addEventListener('click', aoClicar);

    const estante = container.querySelector('.mb-estante');
    if (estante && window.TTEstante) {
      TTEstante.renderizar(estante, acervo, {
        rotuloAcao: T('js.membro.escolher'),
        aoEscolher: async (o) => {
          const { error } = await sb.from('leitura_livre').insert({ user_id: usuarioAtual.id, acervo_slug: o.slug });
          if (error) { toast(T('js.membro.erro.escolher'), 'erro'); return; }
          toast(T('js.membro.escolhido', { titulo: o.titulo }));
          renderizar();
        },
      });
    }
  }

  async function aoClicar(e) {
    const b = e.target.closest('[data-mb]');
    if (!b) return;
    const acao = b.dataset.mb;
    if (acao === 'amostra') return abrirAmostra();
    if (acao === 'ler') {
      const c = b.closest('.ebook-card');
      return abrirClassico(b.dataset.slug, c.querySelector('.ebook-titulo').textContent, c.querySelector('.ebook-autor').textContent);
    }
    if (acao === 'trocar') {
      if (!confirm(T('js.membro.trocar.confirma'))) return;
      const { error } = await sb.from('leitura_livre').delete().eq('user_id', usuarioAtual.id);
      if (error) { toast(T('js.membro.erro.liberar'), 'erro'); return; }
      return renderizar();
    }
  }

  function abrirAmostra() {
    TTLeitor.abrir({
      titulo: AMOSTRA.titulo,
      autor: AMOSTRA.autor,
      chave: 'amostra:3a-guerra',
      obterArquivo: async () => ({ epub: AMOSTRA.epub }),
      sugestao: async () => ({ rotulo: T('js.membro.amostra.gostou'), titulo: AMOSTRA.titulo, autor: T('js.membro.amostra.completo'), href: AMOSTRA.pagina, acao: T('js.membro.amostra.ler.completo') }),
    });
  }

  function abrirClassico(slug, titulo, autor) {
    let ultimoEnvio = 0, ultimoPct = null, enviado = null;
    const salvar = (pct) => {
      ultimoEnvio = Date.now(); enviado = pct;
      return sb.from('leitura_livre').update({ progresso: Math.min(100, Math.round(pct * 100) / 100), atualizado_em: new Date().toISOString() })
        .eq('user_id', usuarioAtual.id).then(() => {}, () => {});
    };
    TTLeitor.abrir({
      titulo, autor,
      chave: 'livre:' + slug,
      obterArquivo: async () => {
        const { data: { session } } = await sb.auth.getSession();
        if (!session) return { erro: T('js.erro.sessao') };
        const r = await fetch(`${EDGE_BASE}/livre-epub?slug=${encodeURIComponent(slug)}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!r.ok) return { erro: r.status === 401 ? T('js.erro.sessao') : T('js.membro.erro.abrir') };
        return { epub: await r.arrayBuffer() };
      },
      sugestao: LANG === 'pt'
        ? async () => ({ rotulo: T('js.membro.fim.rotulo'), titulo: T('js.membro.fim.titulo'), autor: T('js.membro.fim.nema'), href: '/catalogo.html', acao: T('js.nema.catalogo') })
        : async () => ({ rotulo: T('js.membro.fim.rotulo'), titulo: T('js.membro.fim.titulo.intl'), autor: T('js.membro.fim.nema.intl'), href: PREFIXO + '/nema.html', acao: T('js.nema.como') }),
      aoProgredir: (pct) => {
        ultimoPct = pct;
        if (pct >= 100 || Date.now() - ultimoEnvio >= 15000) salvar(pct);
      },
      aoFechar: async () => {
        if (ultimoPct !== null && ultimoPct !== enviado) await salvar(ultimoPct);
        renderizar();
      },
    });
  }

  window.TTMembro = { renderizar };
})();
