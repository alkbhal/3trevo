// Aba Forge do admin: lista, criação e ações dos projetos do tr3vo-forge.
// Tudo passa pela ponte do worker (/api/admin/forge/*); o segredo do Forge nunca chega aqui.
// Depende de helpers do admin.html: api(), toast(), escapeHtml(), carregarForgeProjeto().

const FORGE_ESTADOS = {
  complete: ['Pronto', 'ok'], failed: ['Falhou', 'perigo'], cancelled: ['Cancelado', 'cinza'],
  intake: ['Na fila', 'info'], architect: ['Arquitetura', 'info'], researcher: ['Pesquisa', 'info'],
  writing: ['Escrevendo', 'warn'], editing: ['Revisando', 'warn'], design: ['Design', 'warn'],
  marketing: ['Marketing', 'warn'], translation: ['Tradução', 'warn'], render: ['Gerando arquivos', 'warn'],
  delivery: ['Entrega', 'warn'], awaiting_character_images: ['Aguardando imagens', 'warn'],
  rejected_format: ['Reprovada no formato', 'perigo'], rejected_quality: ['Reprovada no mercado', 'perigo'],
};

// Espelho da tabela do Forge (tr3vo-forge/lib/formats.ts): ao mudar lá, mudar aqui.
const FORGE_FORMATOS = {
  '': 'Sem formato: o Forge escreve um livro de 8 a 15 capítulos, como antes.',
  ensaio: 'Ensaio · 2 mil a 15 mil palavras (alvo 6 mil) · 5 a 8 capítulos · voz autoral com tese central.',
  novela: 'Novela · 17,5 mil a 40 mil palavras (alvo 28 mil) · 20 a 36 capítulos · ficção, não pesquisa na web.',
  'artigo-academico': 'Artigo acadêmico · 6 mil a 10 mil palavras (alvo 8 mil) · 8 seções fixas · resumo, abstract e referências ABNT montadas das fontes reais.',
};
const FORGE_ERROS = {
  forge_nao_autorizado: 'O worker do 3Trevo não tem o segredo do Forge. Na pasta worker: npx wrangler secret put FORGE_API_SECRET.',
  forge_indisponivel: 'O Forge não respondeu. Tente de novo em instantes.',
  forge_timeout: 'O Forge demorou demais para responder.',
  rota_forge_desconhecida: 'Ação desconhecida.',
  id_invalido: 'Identificador de projeto inválido.',
  payload_grande_demais: 'Texto grande demais (limite de 5 MB).',
};
const FORGE_AUTO_MS = 20000;
let forgeTimer = null;
let forgeApagarArmado = null;

const forgeEl = (id) => document.getElementById(id);

async function forgeApi(rota, metodo = 'GET', corpo = null) {
  const r = await api('/api/admin/forge/' + rota, metodo, corpo);
  const dados = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, dados };
}

function forgeMensagemErro(res) {
  const d = res.dados || {};
  if (d.erro === 'corpo_invalido') return 'Dados inválidos' + (d.detalhe ? ': ' + d.detalhe : '.');
  return FORGE_ERROS[d.erro] || d.error || d.erro || ('Erro ' + res.status);
}

function forgeBadge(status) {
  const [rotulo, tipo] = FORGE_ESTADOS[status] || [status, 'cinza'];
  return `<span class="badge badge-${tipo}">${escapeHtml(rotulo)}</span>`;
}

// D1 devolve "YYYY-MM-DD HH:MM:SS" em UTC.
function forgeData(s) {
  if (!s) return '—';
  const d = new Date(String(s).replace(' ', 'T') + 'Z');
  return isNaN(d) ? escapeHtml(s) : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function forgeAba(nome) {
  forgeEl('forge-aba-lista').style.display = nome === 'lista' ? '' : 'none';
  forgeEl('forge-aba-novo').style.display = nome === 'novo' ? '' : 'none';
  forgeEl('forge-tab-lista').className = nome === 'lista' ? 'btn btn-p' : 'btn-ghost';
  forgeEl('forge-tab-novo').className = nome === 'novo' ? 'btn btn-p' : 'btn-ghost';
}

function forgeAgendar() {
  clearInterval(forgeTimer);
  forgeTimer = null;
  if (!forgeEl('forge-auto').checked) return;
  forgeTimer = setInterval(() => {
    if (!forgeEl('panel-forge').classList.contains('ativo')) { clearInterval(forgeTimer); forgeTimer = null; return; }
    forgeListar(true);
  }, FORGE_AUTO_MS);
}

function forgeAbrir() {
  forgeAba('lista');
  forgeListar();
  forgeAgendar();
  forgeFormatoMudou();
}

// Mostra o que o formato escolhido exige (faixa de palavras, capítulos, regras do portão).
function forgeFormatoMudou() {
  const f = forgeEl('forge-novo-formato').value;
  forgeEl('forge-novo-formato-info').textContent =
    (FORGE_FORMATOS[f] ?? FORGE_FORMATOS['']) + (f ? ' A obra só segue se atingir 85% do mínimo do formato.' : '');
}

async function forgeListar(silencioso = false) {
  const corpo = forgeEl('forge-lista-body');
  const aviso = forgeEl('forge-lista-aviso');
  if (!silencioso) corpo.innerHTML = '<tr><td colspan="4">Carregando…</td></tr>';
  let res;
  try { res = await forgeApi('projetos'); } catch (e) { return; }
  if (!res.ok || !Array.isArray(res.dados)) {
    aviso.style.display = '';
    aviso.textContent = forgeMensagemErro(res);
    if (!silencioso) corpo.innerHTML = '<tr><td colspan="4">—</td></tr>';
    return;
  }
  aviso.style.display = 'none';
  if (!res.dados.length) { corpo.innerHTML = '<tr><td colspan="4">Nenhum projeto ainda. Use “+ Novo projeto”.</td></tr>'; return; }
  corpo.innerHTML = res.dados.map((p) => {
    const id = escapeHtml(p.id);
    const pronto = p.status === 'complete';
    const btn = (acao, rotulo, extra = '') => `<button class="btn-ghost" style="padding:4px 9px;font-size:12px;${extra}" data-acao="${acao}" data-id="${id}">${rotulo}</button>`;
    return `<tr>
      <td><div style="font-weight:500;">${escapeHtml(p.tema || '(sem tema)')}</div><div style="font-size:11px;color:var(--t3);font-family:monospace;">${id.slice(0, 8)}</div></td>
      <td>${forgeBadge(p.status)}</td>
      <td style="white-space:nowrap;">${forgeData(p.created_at)}</td>
      <td><div style="display:flex;gap:6px;flex-wrap:wrap;">
        ${pronto ? btn('revisar', 'Revisar e publicar') : ''}
        ${btn('detalhes', 'Detalhes')}
        ${p.status === 'failed' ? btn('retry', 'Tentar de novo') : ''}
        ${pronto ? btn('rerender', 'Refazer HTML') : ''}
        ${btn('apagar', 'Apagar', 'color:var(--danger);')}
      </div></td></tr>`;
  }).join('');
}

async function forgeAcao(acao, id, botao) {
  if (acao === 'revisar') {
    forgeEl('forge-project-id').value = id;
    carregarForgeProjeto();
    forgeEl('forge-status-area').scrollIntoView({ behavior: 'smooth' });
    return;
  }
  if (acao === 'detalhes') return forgeDetalhes(id);

  if (acao === 'apagar') {
    // Apagar é permanente (banco + arquivos): pede um segundo clique em até 5 s.
    if (forgeApagarArmado !== id) {
      forgeApagarArmado = id;
      botao.textContent = 'Confirmar apagar?';
      setTimeout(() => { if (forgeApagarArmado === id) { forgeApagarArmado = null; botao.textContent = 'Apagar'; } }, 5000);
      return;
    }
    forgeApagarArmado = null;
  }

  const rota = { retry: ['retry/' + id, 'POST'], rerender: ['rerender/' + id, 'POST'], apagar: ['projetos/' + id, 'DELETE'] }[acao];
  const ok = { retry: 'Reprocessando o projeto.', rerender: 'HTML refeito.', apagar: 'Projeto apagado.' }[acao];
  botao.disabled = true;
  try {
    const res = await forgeApi(rota[0], rota[1], rota[1] === 'POST' ? null : {});
    toast(res.ok ? ok : forgeMensagemErro(res), res.ok ? 'ok' : 'erro');
    if (res.ok) { forgeListar(true); if (acao === 'apagar') forgeEl('forge-detalhe').style.display = 'none'; }
  } finally { botao.disabled = false; }
}

async function forgeDetalhes(id) {
  const box = forgeEl('forge-detalhe');
  box.style.display = '';
  box.innerHTML = '<div class="card-body">Carregando…</div>';
  box.scrollIntoView({ behavior: 'smooth' });
  let st, cs;
  try { [st, cs] = await Promise.all([forgeApi('status/' + id), forgeApi('custos/' + id)]); } catch (e) { return; }
  if (!st.ok) { box.innerHTML = `<div class="card-body">${escapeHtml(forgeMensagemErro(st))}</div>`; return; }
  const p = st.dados;
  const caps = (p.chapters || []).map((c) =>
    `<tr><td>${escapeHtml(c.numero)}</td><td>${escapeHtml(c.titulo || '—')}</td><td>${escapeHtml(c.status || '—')}</td><td>${escapeHtml(c.veto_count ?? 0)}</td></tr>`).join('');
  const totalUsd = cs.ok && cs.dados?.total?.total_usd != null ? Number(cs.dados.total.total_usd).toFixed(4) : '—';
  const custos = cs.ok ? (cs.dados.breakdown || []).map((b) =>
    `<tr><td>${escapeHtml(b.worker)}</td><td>${escapeHtml(b.model)}</td><td>${escapeHtml(b.calls)}</td><td>US$ ${Number(b.cost_usd).toFixed(4)}</td></tr>`).join('') : '';
  // Relatório do editor para obras com formato: tamanho, diversidade lexical (MTLD, só métrica) e motivos.
  const rel = p.relatorioFormato;
  const motivos = !p.error_log && rel ? (rel.motivos || []).map((m) => `<div>• ${escapeHtml(m)}</div>`).join('') : '';
  const relatorio = rel ? `<div style="font-size:13px;margin-bottom:14px;padding:10px 12px;border-radius:3px;background:${rel.aprovado ? '#e8f5e9' : '#ffebee'};">
      <strong>Formato ${escapeHtml(rel.formato)}</strong> · ${Number(rel.palavras).toLocaleString('pt-BR')} palavras (mínimo exigido ${Number(rel.tamanho?.minimoExigido ?? 0).toLocaleString('pt-BR')}) · diversidade lexical (MTLD) ${escapeHtml(rel.lexico?.mtld ?? '—')} · ${rel.aprovado ? 'aprovada no formato' : 'reprovada no formato'}${rel.referencias ? ` · ${escapeHtml(rel.referencias)} referências` : ''}${motivos}</div>` : '';
  box.innerHTML = `
    <div class="card-hdr"><span class="card-titulo">${escapeHtml(p.tema || id)}</span>${forgeBadge(p.status)}</div>
    <div class="card-body">
      ${p.error_log ? `<div style="background:#ffebee;color:#c0392b;padding:10px 12px;border-radius:3px;margin-bottom:14px;font-size:13px;white-space:pre-wrap;">${escapeHtml(p.error_log)}</div>` : ''}
      ${relatorio}
      <div style="font-size:12px;color:var(--t3);margin-bottom:14px;">Criado ${forgeData(p.created_at)} · atualizado ${forgeData(p.updated_at)} · custo total US$ ${totalUsd}</div>
      <div style="overflow-x:auto;"><table><thead><tr><th>Cap.</th><th>Título</th><th>Estado</th><th>Vetos</th></tr></thead><tbody>${caps || '<tr><td colspan="4">Sem capítulos ainda.</td></tr>'}</tbody></table></div>
      ${custos ? `<div style="overflow-x:auto;margin-top:14px;"><table><thead><tr><th>Etapa</th><th>Modelo</th><th>Chamadas</th><th>Custo</th></tr></thead><tbody>${custos}</tbody></table></div>` : ''}
    </div>`;
}

function forgeModo(modo) {
  forgeEl('forge-modo-tema').style.display = modo === 'tema' ? '' : 'none';
  forgeEl('forge-modo-manuscrito').style.display = modo === 'manuscrito' ? '' : 'none';
}

function forgeLerArquivo(input) {
  const arq = input.files && input.files[0];
  if (!arq) return;
  const leitor = new FileReader();
  leitor.onload = () => { forgeEl('forge-novo-texto').value = String(leitor.result || ''); if (!forgeEl('forge-novo-titulo').value) forgeEl('forge-novo-titulo').value = arq.name.replace(/\.[^.]+$/, ''); };
  leitor.readAsText(arq, 'utf-8');
}

async function forgeCriar() {
  const modo = document.querySelector('input[name="forge-modo"]:checked').value;
  const formato = forgeEl('forge-novo-formato').value || undefined; // a meta de palavras vem do formato, no Forge
  let rota, corpo;
  if (modo === 'tema') {
    const tema = forgeEl('forge-novo-tema').value.trim();
    if (tema.length < 3) { toast('Descreva o tema do livro.', 'erro'); return; }
    rota = 'novo';
    corpo = { tema, contexto: forgeEl('forge-novo-contexto').value.trim() || undefined, formato };
  } else {
    const manuscrito = forgeEl('forge-novo-texto').value;
    if (manuscrito.trim().length < 200) { toast('O manuscrito precisa ter pelo menos 200 caracteres.', 'erro'); return; }
    rota = 'ingerir';
    corpo = {
      manuscrito,
      titulo: forgeEl('forge-novo-titulo').value.trim() || undefined,
      modo: forgeEl('forge-novo-modo').value,
      formato,
    };
  }
  const btn = forgeEl('forge-novo-enviar');
  btn.disabled = true;
  btn.textContent = 'Enviando…';
  try {
    const res = await forgeApi(rota, 'POST', corpo);
    if (!res.ok) { toast(forgeMensagemErro(res), 'erro'); return; }
    toast(res.dados?.message || 'Projeto enviado ao Forge.');
    ['forge-novo-tema', 'forge-novo-contexto', 'forge-novo-titulo', 'forge-novo-texto', 'forge-novo-formato'].forEach((i) => { forgeEl(i).value = ''; });
    forgeFormatoMudou();
    forgeAba('lista');
    forgeListar();
  } catch (e) {
    toast('Sem conexão com o servidor.', 'erro');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enviar ao Forge';
  }
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('#forge-lista-body [data-acao]');
  if (b) forgeAcao(b.dataset.acao, b.dataset.id, b);
});
