/**
 * admin-nfe.js — painel "Notas fiscais" do admin.html (NF-e pelo Bling)
 * Usa api() e toast() do admin.html. Rotas no Worker: src/routes/admin-nfe.ts
 */
(function () {
  'use strict';

  var ROTULOS = {
    pendente: 'Na fila', criando: 'Criando no Bling (conferir se parada)', enviada: 'Enviada à SEFAZ',
    emitida: 'Emitida', erro: 'Com erro', cancelada: 'Cancelada (reembolso)',
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function item(ok, texto, dica) {
    return '<div style="margin:4px 0">' + (ok ? '✅ ' : '⬜ ') + esc(texto) +
      (ok || !dica ? '' : ' <span style="color:var(--t3);font-size:12px">— ' + esc(dica) + '</span>') + '</div>';
  }

  window.carregarNFe = async function () {
    var cfg = document.getElementById('nfe-config');
    var fila = document.getElementById('nfe-fila');
    try {
      var d = await (await api('/api/admin/nfe/status')).json();
      if (!d.ok) throw new Error(d.erro || 'falha');
      cfg.innerHTML =
        item(d.credenciais, 'Credenciais do app Bling no Worker', 'wrangler secret put BLING_CLIENT_ID e BLING_CLIENT_SECRET') +
        item(d.conectado, 'Conta Bling autorizada', 'clique em "Conectar Bling"') +
        item(d.natureza_definida, 'Natureza de operação definida', 'BLING_NATUREZA_ID, cadastrada no Bling pelo contador') +
        item(d.emissao_ligada, 'Emissão ligada', 'NFE_ENABLED = true; até lá as notas só entram na fila');
      document.getElementById('nfe-conectar').textContent = d.conectado ? 'Reconectar Bling' : 'Conectar Bling';
      var linhas = Object.keys(d.fila || {}).map(function (k) {
        return '<tr><td>' + esc(ROTULOS[k] || k) + '</td><td style="text-align:right">' + Number(d.fila[k]) + '</td></tr>';
      }).join('');
      var erros = (d.erros || []).map(function (e) {
        return '<li style="margin:4px 0">' + esc(e.error_message || 'sem detalhe') + '</li>';
      }).join('');
      fila.innerHTML = (linhas ? '<table style="width:100%;max-width:420px">' + linhas + '</table>' : 'Nenhum pagamento na fila ainda.') +
        (erros ? '<div style="margin-top:14px;font-weight:600">Últimos erros</div><ul style="margin:6px 0 0 18px">' + erros + '</ul>' : '');
    } catch (e) {
      cfg.textContent = 'Não foi possível carregar: ' + e.message;
    }
  };

  window.conectarBling = async function () {
    try {
      var d = await (await api('/api/admin/nfe/conectar', 'POST')).json();
      if (!d.ok) return toast(d.erro || 'Falha ao conectar', 'err');
      window.open(d.url, '_blank', 'noopener');
      toast('Autorize no Bling e depois clique em Atualizar');
    } catch (e) { toast(e.message, 'err'); }
  };

  window.processarNFe = async function () {
    var btn = document.getElementById('nfe-processar');
    btn.disabled = true;
    try {
      var d = await (await api('/api/admin/nfe/processar', 'POST')).json();
      var r = d.resumo || {};
      toast(r.ativo
        ? 'Emitidas: ' + r.emitidas + ' · aguardando SEFAZ: ' + r.enviadas + ' · erros: ' + r.erros
        : 'Notas enfileiradas: ' + r.enfileiradas + ' (' + (r.motivo || 'emissão desligada') + ')', r.erros ? 'err' : 'ok');
      window.carregarNFe();
    } catch (e) { toast(e.message, 'err'); }
    btn.disabled = false;
  };
})();
