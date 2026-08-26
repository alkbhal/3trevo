/**
 * tt-client.js — Cliente único de catálogo público (Fonte Única)
 * Inclua com: <script src="/js/tt-client.js" onerror="console.error('tt-client falhou ao carregar')"></script>
 * API global: window.TTClient.getCatalogo(slug?), .formatMoney(preco), .renderCatalogo(container, onSuccess)
 *
 * Substitui o padrão anterior (cada página lendo Supabase direto com a chave anônima
 * embutida) por uma única chamada ao worker, que já usa a service key no servidor.
 * Nenhuma chave/URL do Supabase circula no cliente a partir daqui.
 */
(function () {
  'use strict';

  const API_BASE = 'https://tres-trevo-api.al-kbhal.workers.dev';
  const TIMEOUT_MS = 8000;

  async function getCatalogo(slug) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const url = slug
      ? `${API_BASE}/api/public/catalogo?slug=${encodeURIComponent(slug)}`
      : `${API_BASE}/api/public/catalogo`;
    try {
      const resp = await fetch(url, { signal: controller.signal });
      if (!resp.ok) throw new Error(`catalogo_http_${resp.status}`);
      const data = await resp.json();
      if (!Array.isArray(data)) throw new Error('catalogo_formato_invalido');
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  function formatMoney(preco) {
    return Number(preco).toFixed(2).replace('.', ',');
  }

  // Preenche `container` com loading/erro(+retry)/vazio/sucesso — poupa cada página de
  // reimplementar os 4 estados na mão (achado da auditoria: 7 blocos catch vazio, zero timeout).
  function renderCatalogo(container, onSuccess) {
    function attempt() {
      container.innerHTML = '<p class="tt-loading">Carregando…</p>';
      getCatalogo()
        .then((data) => {
          if (!data.length) {
            container.innerHTML = '<p class="tt-vazio">Nenhum título disponível no momento.</p>';
            return;
          }
          onSuccess(data);
        })
        .catch(() => {
          container.innerHTML =
            '<p class="tt-erro">Não foi possível carregar o catálogo. ' +
            '<button type="button" class="tt-retry">Tentar de novo</button></p>';
          const btn = container.querySelector('.tt-retry');
          if (btn) btn.addEventListener('click', attempt);
        });
    }
    attempt();
  }

  window.TTClient = { getCatalogo, formatMoney, renderCatalogo };
})();
