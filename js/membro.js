/**
 * membro.js — Área de membros grátis (contas sem compra) na área do cliente.
 * Mostra: amostra grátis (EPUB no próprio site), UM espaço de leitura para um clássico em
 * domínio público (tabela leitura_livre + edge function livre-epub) e o cartão do Nema.
 * Quem compra continua com os 3 espaços da Biblioteca TT — este módulo não aparece para eles.
 *
 * Usa globais da área do cliente: sb, EDGE_BASE, usuarioAtual, capaTipografica, escHtml, toast.
 * TTMembro.renderizar(containerEl) é chamado por carregarBiblioteca() quando não há ebooks.
 */
(function () {
  'use strict';

  const AMOSTRA = {
    titulo: 'O Nascimento Silencioso da 3ª Guerra Mundial',
    autor: 'Said Anes',
    rotulo: 'Capítulo 1',
    epub: '/amostras/3a-guerra-capitulo-1.epub',
    pagina: '/obra/terceiraguerra.html',
  };

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
    return `<aside class="mb-nema" aria-label="Nema, o ponto de fidelidade da editora">
      <div class="mb-nema-selo" aria-hidden="true">N</div>
      <div class="mb-nema-texto">
        <p class="mb-nema-rotulo">Nema · ponto de fidelidade</p>
        <h4 class="mb-nema-titulo">Sua primeira compra já rende Nema</h4>
        <p>10% do valor de cada e-book volta para você em Nema, e o saldo vira desconto na próxima leitura (até metade do preço). Liberado 7 dias depois da compra.</p>
        <div class="mb-nema-acoes">
          <a class="mb-btn" href="/catalogo.html">Ver o catálogo</a>
          <a class="mb-link" href="/nema.html">Como o Nema funciona</a>
        </div>
      </div>
    </aside>`;
  }

  async function renderizar(el) {
    container = el || container;
    if (!container) return;
    container.innerHTML = '<div class="loading"><div class="loading-spinner"></div><span class="loading-txt">Carregando</span></div>';

    const [espacoR, acervoR] = await Promise.all([
      sb.from('leitura_livre').select('acervo_slug, progresso').eq('user_id', usuarioAtual.id).maybeSingle(),
      sb.from('biblioteca_acervo').select('slug, titulo, autor').eq('ativo', true).eq('acesso', 'bonus').order('titulo'),
    ]);
    const espaco = espacoR.data;
    const acervo = acervoR.data || [];
    const obra = espaco && acervo.find((o) => o.slug === espaco.acervo_slug);

    const amostra = card({
      titulo: AMOSTRA.titulo, autor: AMOSTRA.autor, slug: '3a-guerra', selo: 'Amostra grátis',
      corpo: `<div class="ebook-footer"><button class="btn-ler" data-mb="amostra">Ler o ${esc(AMOSTRA.rotulo.toLowerCase())}</button></div>`,
    });

    let classico;
    if (obra) {
      const pct = Math.round(Number(espaco.progresso) || 0);
      classico = `<div class="biblioteca-grid">${card({
        titulo: obra.titulo, autor: obra.autor, slug: obra.slug, selo: 'Seu clássico',
        corpo: `<div class="mb-progresso" aria-label="${pct}% lido"><span style="width:${pct}%"></span></div>
          <div class="mb-progresso-txt">${pct}% lido</div>
          <div class="ebook-footer">
            <button class="btn-ler" data-mb="ler" data-slug="${esc(obra.slug)}">${pct > 0 ? 'Continuar' : 'Começar a ler'}</button>
            <button class="mb-trocar" data-mb="trocar">Concluir e trocar</button>
          </div>`,
      })}</div>`;
    } else {
      classico = `<p class="mb-texto">Escolha um clássico para o seu espaço de leitura. Você lê um de cada vez e pode trocar quando terminar.</p>
        <div class="biblioteca-grid">${acervo.map((o) => card({
          titulo: o.titulo, autor: o.autor, slug: o.slug, selo: 'Domínio público',
          corpo: `<div class="ebook-footer"><button class="btn-ler" data-mb="escolher" data-slug="${esc(o.slug)}">Escolher este</button></div>`,
        })).join('')}</div>`;
    }

    container.innerHTML = `<section class="mb">
      <div class="mb-boasvindas">
        <p class="mb-rotulo">✦ Membro grátis</p>
        <h3 class="mb-titulo">Sua área de leitura na Três Trevo</h3>
        <p class="mb-texto">Comece pela amostra e escolha um clássico da literatura brasileira. Tudo no leitor da editora, com o progresso salvo.</p>
      </div>
      <h4 class="mb-secao">Amostra grátis</h4>
      <div class="biblioteca-grid">${amostra}</div>
      <h4 class="mb-secao">Clássico grátis <span class="mb-espaco">1 espaço de leitura</span></h4>
      ${classico}
      <p class="mb-nota">Membros grátis leem um clássico por vez. Quem compra qualquer livro da editora ganha três espaços na Biblioteca TT.</p>
      ${cartaoNema()}
    </section>`;
    container.querySelector('.mb').addEventListener('click', aoClicar);
  }

  async function aoClicar(e) {
    const b = e.target.closest('[data-mb]');
    if (!b) return;
    const acao = b.dataset.mb;
    if (acao === 'amostra') return abrirAmostra();
    if (acao === 'ler') return abrirClassico(b.dataset.slug, b.closest('.ebook-card').querySelector('.ebook-titulo').textContent,
      b.closest('.ebook-card').querySelector('.ebook-autor').textContent);
    if (acao === 'escolher') {
      b.disabled = true;
      const { error } = await sb.from('leitura_livre').insert({ user_id: usuarioAtual.id, acervo_slug: b.dataset.slug });
      if (error) { b.disabled = false; toast('Não foi possível escolher agora. Tente de novo.', 'erro'); return; }
      toast('Clássico adicionado ao seu espaço de leitura.');
      return renderizar();
    }
    if (acao === 'trocar') {
      if (!confirm('Concluir este clássico e liberar o espaço para outro?')) return;
      const { error } = await sb.from('leitura_livre').delete().eq('user_id', usuarioAtual.id);
      if (error) { toast('Não foi possível liberar agora. Tente de novo.', 'erro'); return; }
      return renderizar();
    }
  }

  function abrirAmostra() {
    TTLeitor.abrir({
      titulo: AMOSTRA.titulo,
      autor: AMOSTRA.autor,
      chave: 'amostra:3a-guerra',
      obterArquivo: async () => ({ epub: AMOSTRA.epub }),
      sugestao: async () => ({ rotulo: 'Gostou do capítulo?', titulo: AMOSTRA.titulo, autor: 'Livro completo · a compra rende Nema', href: AMOSTRA.pagina, acao: 'Ler o livro completo' }),
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
        if (!session) return { erro: 'Sua sessão expirou. Entre de novo para continuar lendo.' };
        const r = await fetch(`${EDGE_BASE}/livre-epub?slug=${encodeURIComponent(slug)}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          return { erro: d.error || 'Não foi possível abrir o clássico agora.' };
        }
        return { epub: await r.arrayBuffer() };
      },
      sugestao: async () => ({ rotulo: 'Da Editora Três Trevo', titulo: 'Conheça os livros da casa', autor: 'Sua primeira compra rende Nema', href: '/catalogo.html', acao: 'Ver o catálogo' }),
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
