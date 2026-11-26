// Aba Produção do admin: dispara e acompanha a esteira de produção (scripts Python no
// GitHub Actions do tr3vo-forge: "Compor obra" gera EPUB + PDF, "Narrar obra" gera o áudio).
// Tudo passa por /api/admin/producao/*; o token do GitHub fica só no worker.
// Depende de helpers do admin.html: api(), toast(), escapeHtml().

const PROD_ERROS = {
  github_token_ausente: 'Falta configurar GH_PRODUCAO_TOKEN no worker do 3Trevo.',
  github_token_invalido: 'O token do GitHub foi recusado (expirou ou foi revogado).',
  github_sem_permissao: 'O token do GitHub não tem permissão de Actions no tr3vo-forge.',
  github_workflow_ou_repo_nao_encontrado: 'Workflow ou repositório não encontrado no GitHub.',
  github_entrada_recusada: 'O GitHub recusou a entrada (o workflow pode estar desatualizado).',
  github_indisponivel: 'O GitHub não respondeu. Tente de novo em instantes.',
  corpo_invalido: 'Dados inválidos.',
};
const PROD_ETAPAS = { compor: 'Compor EPUB + PDF', narrar: 'Narrar audiobook' };
const PROD_AUTO_MS = 15000;
let prodTimer = null;
let prodArmado = null; // { chave, ate } — publicar exige um segundo clique em até 6 s

const prodEl = (id) => document.getElementById(id);

async function prodApi(rota, metodo = 'GET', corpo = null) {
  const r = await api('/api/admin/producao/' + rota, metodo, corpo);
  const dados = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, dados };
}

function prodErro(res) {
  const d = res.dados || {};
  return PROD_ERROS[d.erro] || d.erro || ('Erro ' + res.status);
}

function prodSlug() { return prodEl('prod-obra').value; }

async function producaoAbrir() {
  const sel = prodEl('prod-obra');
  if (!sel.options.length || sel.options[0].value === '') {
    sel.innerHTML = '<option value="">Carregando…</option>';
    const res = await prodApi('obras');
    if (!res.ok) {
      sel.innerHTML = '<option value="">—</option>';
      prodEl('prod-execucoes').textContent = prodErro(res);
      return;
    }
    prodObras = res.dados.obras;
    sel.innerHTML = prodObras.map((o) =>
      `<option value="${escapeHtml(o.slug)}">${escapeHtml(o.titulo)}${o.edicao ? ' · edição ' + escapeHtml(o.edicao) : ''}</option>`
    ).join('') || '<option value="">Nenhuma obra em scripts/obras/obras.json</option>';
  }
  producaoTrocarObra();
}

function producaoTrocarObra() {
  prodMostrarPerfil(prodObras.find((o) => o.slug === prodSlug()));
  producaoListar();
}

// ── Perfil de produção (scripts/obras/perfis.json no tr3vo-forge) ────────────
let prodObras = [];
const PROD_ROTULOS = {
  'so-capa': 'Só a capa', 'vinheta': 'Vinhetas', 'cena-por-capitulo': 'Cenas por capítulo',
  'por-pagina': 'Uma por página dupla', 'diagrama': 'Diagramas',
  'refluivel': 'texto ajustável', 'pre-paginado': 'página fixa (dupla)',
  'branco': 'papel branco', 'creme': 'papel creme', 'pb': 'preto e branco', 'colorido': 'colorido',
  'unica': 'uma voz', 'narrador+personagens': 'narrador e personagens',
  'derivado': 'roteiro gerado do texto', 'revisado-humano': 'roteiro revisado por pessoa',
  'nenhuma': 'nenhuma', 'biblia-mundo': 'bíblia de mundo (ambientação)', 'factual-citada': 'factual, com fontes citadas',
  'nota-autor': 'nota do autor', 'rodape': 'notas de rodapé', 'abnt': 'ABNT',
  'referencias': 'referências', 'tabelas': 'tabelas',
};
const prodR = (v) => escapeHtml(PROD_ROTULOS[v] || String(v));

function prodMostrarPerfil(obra) {
  const el = prodEl('prod-perfil');
  if (!obra) { el.innerHTML = ''; return; }
  if (!obra.tipo || !obra.perfil) {
    el.innerHTML = `<span class="badge badge-perigo">Sem perfil</span> A obra precisa de um "tipo" válido em scripts/obras/obras.json; sem ele o compor e o narrar reprovam (portão P0).`;
    return;
  }
  const p = obra.perfil, il = p.ilustracao, im = p.impressao, au = p.audio;
  const porCap = il.por_capitulo && il.por_capitulo[1] > 0 ?` (${il.por_capitulo[0] === il.por_capitulo[1] ? il.por_capitulo[0] : il.por_capitulo.join(' a ')} por capítulo)` : '';
  const linhas = [
    ['Ilustração', `${prodR(il.densidade)}${porCap}${il.folha_personagem ? ' · folha de personagem' : ''} · até ${il.teto_custo_pct}% do custo`],
    ['Pesquisa', `${prodR(p.pesquisa)} · citação: ${prodR(p.citacao)}`],
    ['EPUB', prodR(p.epub.layout)],
    ['Impressão', `${escapeHtml(im.trim.replace('x', '×'))}" · ${prodR(im.papel)} · ${prodR(im.cor)} · corpo ${escapeHtml(String(im.corpo_pt))} pt${im.sangria ? ' · com sangria' : ''}`],
    ['Audiobook', au.entrega
      ? `${prodR(au.vozes)} · ${prodR(au.roteiro)}${au.pular.length ? ' · não lê: ' + au.pular.map(prodR).join(', ') : ''}`
      : 'não previsto'],
  ];
  const ajustes = obra.ajustes ? Object.keys(obra.ajustes) : [];
  el.innerHTML = `
    <div style="margin-bottom:8px;"><span class="badge badge-info">${escapeHtml(p.rotulo)}</span>
      ${ajustes.length ? `<span class="field-sub"> · com ajustes da obra em: ${ajustes.map(escapeHtml).join(', ')} (o compor aplica)</span>` : ''}</div>
    <table><tbody>${linhas.map(([k, v]) => `<tr><td style="width:120px;color:var(--t3);">${k}</td><td>${v}</td></tr>`).join('')}</tbody></table>`;
}

function prodAgendar(algumaRodando) {
  clearTimeout(prodTimer);
  prodTimer = null;
  if (!algumaRodando) return;
  prodTimer = setTimeout(() => {
    if (prodEl('panel-producao').classList.contains('ativo')) producaoListar(true);
  }, PROD_AUTO_MS);
}

function prodBadge(e) {
  if (e.status !== 'completed') return `<span class="badge badge-warn">${e.status === 'queued' ? 'Na fila' : 'Rodando'}</span>`;
  if (e.conclusao === 'success') return '<span class="badge badge-ok">Concluído</span>';
  if (e.conclusao === 'cancelled') return '<span class="badge badge-cinza">Cancelado</span>';
  return '<span class="badge badge-perigo">Reprovado</span>';
}

function prodData(iso) {
  const d = new Date(iso);
  return isNaN(d) ? '—' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// Só links do GitHub viram href (o dado vem de fora).
function prodLink(u) {
  try { const p = new URL(u); return p.protocol === 'https:' && p.hostname === 'github.com' ? u : null; }
  catch { return null; }
}

async function producaoListar(silencioso = false) {
  const slug = prodSlug();
  if (!slug) return;
  const el = prodEl('prod-execucoes');
  if (!silencioso) el.textContent = 'Carregando…';
  const res = await prodApi('execucoes?slug=' + encodeURIComponent(slug));
  if (!res.ok) { el.textContent = prodErro(res); return; }
  const lista = res.dados.execucoes;
  prodAgendar(lista.some((e) => e.status !== 'completed'));
  if (!lista.length) { el.textContent = 'Nenhuma execução ainda para esta obra.'; return; }
  el.innerHTML = `<table><thead><tr><th>Etapa</th><th>Destino</th><th>Situação</th><th>Início</th><th></th></tr></thead><tbody>${
    lista.map((e) => {
      const link = prodLink(e.url);
      return `<tr>
        <td>${escapeHtml(PROD_ETAPAS[e.etapa] || e.etapa)}</td>
        <td>${e.publicar ? '<strong>Publicar na loja</strong>' : 'Só conferir'}</td>
        <td>${prodBadge(e)}</td>
        <td>${prodData(e.criado)}</td>
        <td>${link ? `<a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer" class="btn-ghost" style="font-size:12px;padding:4px 10px;">Ver no GitHub</a>` : ''}</td>
      </tr>`;
    }).join('')
  }</tbody></table>`;
}

async function producaoDisparar(etapa, publicar, btn) {
  const slug = prodSlug();
  if (!slug) { toast('Escolha a obra.', 'err'); return; }
  const capitulos = etapa === 'narrar' ? prodEl('prod-capitulos').value.trim().replace(/\s+/g, '') : '';
  if (capitulos && !/^[a-z0-9-]+(,[a-z0-9-]+)*$/.test(capitulos)) {
    toast('Capítulos: ids separados por vírgula, ex.: prefacio,cap1', 'err');
    return;
  }

  // Publicar troca o que os compradores recebem: pede um segundo clique.
  const chave = `${etapa}:${slug}`;
  if (publicar && !(prodArmado && prodArmado.chave === chave && Date.now() < prodArmado.ate)) {
    prodArmado = { chave, ate: Date.now() + 6000 };
    const original = btn.textContent;
    btn.textContent = 'Clique de novo para publicar';
    setTimeout(() => { btn.textContent = original; }, 6000);
    return;
  }
  prodArmado = null;

  btn.disabled = true;
  try {
    const corpo = { slug, etapa, publicar };
    if (capitulos) corpo.capitulos = capitulos;
    const res = await prodApi('disparar', 'POST', corpo);
    if (!res.ok) { toast(prodErro(res), 'err'); return; }
    toast(`${PROD_ETAPAS[etapa]}: enviado ao GitHub${publicar ? ' (publicar)' : ''}.`, 'ok');
    // O GitHub leva alguns segundos para listar a execução nova.
    setTimeout(() => producaoListar(true), 4000);
  } finally {
    btn.disabled = false;
  }
}
