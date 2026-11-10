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

// A tabela de formatos mora só no Forge (GET /formatos); aqui ela é carregada, não copiada.
const FORGE_SEM_FORMATO = 'Sem formato: o Forge escreve um livro de 8 a 15 capítulos, como antes.';
let forgeFormatos = null; // null = ainda não carregou; [] = Forge sem a rota (versão antiga)
const FORGE_ERROS = {
  forge_nao_autorizado: 'O Forge recusou a credencial do admin. Falta gravar FORGE_ADMIN_SECRET no worker do 3Trevo e no Forge (mesmo valor).',
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
  forgeCarregarFormatos();
}

// Monta o seletor a partir da tabela do Forge; sem ela (Forge antigo ou fora do ar), fica só "Padrão".
async function forgeCarregarFormatos() {
  if (forgeFormatos && forgeFormatos.length) return forgeFormatoMudou();
  try {
    const res = await forgeApi('formatos');
    forgeFormatos = res.ok && Array.isArray(res.dados) ? res.dados : [];
  } catch (e) { forgeFormatos = []; }
  const sel = forgeEl('forge-novo-formato');
  const atual = sel.value;
  sel.replaceChildren(new Option('Padrão (livro de 8 a 15 capítulos)', ''), ...forgeFormatos.map((f) => new Option(f.rotulo, f.id)));
  sel.value = forgeFormatos.some((f) => f.id === atual) ? atual : '';
  forgeFormatoMudou();
}

// Mostra o que o formato escolhido exige (faixa de palavras, capítulos, regras do portão).
function forgeFormatoMudou() {
  const f = forgeEl('forge-novo-formato').value;
  const info = forgeEl('forge-novo-formato-info');
  if (!f) {
    info.textContent = forgeFormatos && !forgeFormatos.length
      ? `${FORGE_SEM_FORMATO} (Os formatos não carregaram: publique a versão nova do Forge.)`
      : FORGE_SEM_FORMATO;
    return;
  }
  const escolhido = (forgeFormatos || []).find((x) => x.id === f);
  info.textContent = `${escolhido ? escolhido.descricao : f} A obra só segue se atingir 85% do mínimo do formato.`;
}

// As 10 etapas do Forge, na ordem da esteira (o status do projeto diz em qual ele está).
const FORGE_ETAPAS = [
  ['intake', 'Triagem'], ['architect', 'Arquitetura'], ['researcher', 'Pesquisa'], ['writing', 'Escrita'],
  ['editing', 'Revisão'], ['design', 'Capa e design'], ['marketing', 'Marketing'], ['translation', 'Tradução'],
  ['render', 'Arquivos'], ['delivery', 'Entrega'],
];
const FORGE_EM_PRODUCAO = new Set([...FORGE_ETAPAS.map(([s]) => s), 'awaiting_character_images']);
const FORGE_FALHAS = new Set(['failed', 'rejected_format', 'rejected_quality']);
const FORGE_FILTROS = {
  todos: () => true, producao: (p) => FORGE_EM_PRODUCAO.has(p.status),
  prontos: (p) => p.status === 'complete', falhas: (p) => FORGE_FALHAS.has(p.status),
};
let forgeProjetos = [];
let forgeFiltro = 'todos';

// Ícones no traço do lucide (livro, relógio, check, alerta), desenhados aqui para não depender de biblioteca.
const FORGE_ICONES = {
  total: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
  andamento: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  ok: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
  falha: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
};
const forgeIcone = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${FORGE_ICONES[n]}</svg>`;
const forgeDias = (s) => (Date.now() - new Date(String(s).replace(' ', 'T') + 'Z')) / 864e5;

function forgeContagem(lista) {
  const prontos = lista.filter(FORGE_FILTROS.prontos);
  const falhas = lista.filter(FORGE_FILTROS.falhas);
  return {
    total: lista.length, novos30: lista.filter((p) => forgeDias(p.created_at) <= 30).length,
    producao: lista.filter(FORGE_FILTROS.producao).length, prontos: prontos.length, falhas: falhas.length,
    ultimoPronto: prontos[0], ultimaFalha: falhas[0], // a lista vem do mais novo para o mais antigo
  };
}

function forgeResumo() {
  const c = forgeContagem(forgeProjetos);
  const card = (filtro, tipo, rotulo, valor, nota, classeNota = '') => `
    <button type="button" class="fg-stat ${tipo}" data-filtro="${filtro}" aria-pressed="${forgeFiltro === filtro}" title="Mostrar só estes na lista">
      <div class="fg-stat-topo"><div><div class="fg-stat-rotulo">${rotulo}</div><div class="fg-stat-valor">${valor}</div></div>
      <span class="fg-stat-icone">${forgeIcone(tipo)}</span></div>
      <div class="fg-stat-nota ${classeNota}">${nota}</div></button>`;
  forgeEl('fg-stats').innerHTML =
    card('todos', 'total', 'Livros no Forge', c.total, c.novos30 ? `+${c.novos30} nos últimos 30 dias` : 'Nenhum novo em 30 dias', c.novos30 ? '' : 'neutra') +
    card('producao', 'andamento', 'Em produção', c.producao, c.producao ? 'O Forge está trabalhando agora' : 'Nada rodando agora', 'neutra') +
    card('prontos', 'ok', 'Prontos', c.prontos, c.ultimoPronto ? `Último em ${forgeData(c.ultimoPronto.updated_at)}` : 'Nenhum ainda', c.ultimoPronto ? '' : 'neutra') +
    card('falhas', 'falha', 'Precisam de você', c.falhas, c.falhas ? 'Falharam ou foram reprovados' : 'Nenhuma falha', c.falhas ? 'alerta' : 'neutra');

  // Esteira: quantos livros estão em cada etapa agora.
  const naEtapa = (s) => forgeProjetos.filter((p) => p.status === s || (s === 'design' && p.status === 'awaiting_character_images')).length;
  forgeEl('fg-esteira').innerHTML = FORGE_ETAPAS.map(([s, nome], i) => {
    const n = naEtapa(s);
    return `<div class="fg-etapa${n ? ' ativa' : ''}"><div class="fg-etapa-n">${i + 1}</div><div class="fg-etapa-nome">${nome}</div><div class="fg-etapa-qtd">${n}</div></div>`;
  }).join('');

  // A falha mais recente fica em destaque, com o atalho para corrigir.
  const f = c.ultimaFalha;
  const alerta = forgeEl('fg-alerta');
  alerta.style.display = f ? '' : 'none';
  if (f) {
    const id = escapeHtml(f.id);
    alerta.innerHTML = `<span class="fg-stat-icone" style="--fg-cor:rgba(255,138,128,.2);">${forgeIcone('falha')}</span>
      <div style="flex:1;min-width:0;"><div class="fg-alerta-t">Última falha: ${forgeData(f.updated_at)}</div>
      <div class="fg-alerta-s">${escapeHtml(f.tema || '(sem tema)')}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
        <button class="btn-ghost" data-acao="detalhes" data-id="${id}">Ver o motivo</button>
        ${f.status === 'failed' ? `<button class="btn btn-p" data-acao="retry" data-id="${id}">Tentar de novo</button>` : ''}
      </div></div>`;
  }
}

function forgeRenderTabela() {
  const corpo = forgeEl('forge-lista-body');
  const lista = forgeProjetos.filter(FORGE_FILTROS[forgeFiltro]);
  const rotulo = { todos: '', producao: ' em produção', prontos: ' prontos', falhas: ' com falha' }[forgeFiltro];
  if (!lista.length) {
    corpo.innerHTML = `<tr><td colspan="4">${forgeProjetos.length ? `Nenhum projeto${rotulo}.` : 'Nenhum projeto ainda. Use “+ Novo projeto”.'}</td></tr>`;
    return;
  }
  corpo.innerHTML = lista.map((p) => {
    const id = escapeHtml(p.id);
    const pronto = p.status === 'complete';
    const btn = (acao, rotulo, extra = '') => `<button class="btn-ghost" style="padding:6px 11px;font-size:13px;${extra}" data-acao="${acao}" data-id="${id}">${rotulo}</button>`;
    return `<tr>
      <td><div style="font-weight:500;">${escapeHtml(p.tema || '(sem tema)')}</div><div style="font-size:12px;color:var(--t3);font-family:monospace;">${id.slice(0, 8)}</div></td>
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
  forgeProjetos = res.dados;
  forgeResumo();
  forgeRenderTabela();
}

// Resumo do Forge no Dashboard: quatro números, cada um abre o Forge já filtrado.
async function forgeResumoDashboard() {
  const box = forgeEl('fg-mini');
  if (!box) return;
  let res;
  try { res = await forgeApi('projetos'); } catch (e) { res = { ok: false, dados: null, status: 0 }; }
  if (!res.ok || !Array.isArray(res.dados)) { box.innerHTML = `<div class="field-sub">${escapeHtml(forgeMensagemErro(res))}</div>`; return; }
  const c = forgeContagem(res.dados);
  const item = (filtro, valor, rotulo) => `<div class="fg-mini-item" role="button" tabindex="0" data-filtro-dash="${filtro}"><b>${valor}</b><span>${rotulo}</span></div>`;
  box.innerHTML = item('producao', c.producao, 'em produção') + item('prontos', c.prontos, 'prontos') +
    item('falhas', c.falhas, 'precisam de você') + item('todos', c.total, 'livros no total');
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
      ${p.error_log ? `<div style="background:rgba(255,138,128,.14);color:#ff8a80;padding:10px 12px;border-radius:3px;margin-bottom:14px;font-size:13px;white-space:pre-wrap;">${escapeHtml(p.error_log)}</div>` : ''}
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
  const autor = forgeEl('forge-novo-autor').value.trim() || undefined; // vai pro brief, pra capa e pros arquivos
  let rota, corpo;
  if (modo === 'tema') {
    const tema = forgeEl('forge-novo-tema').value.trim();
    if (tema.length < 3) { toast('Descreva o tema do livro.', 'erro'); return; }
    rota = 'novo';
    corpo = { tema, contexto: forgeEl('forge-novo-contexto').value.trim() || undefined, formato, autor };
  } else {
    const manuscrito = forgeEl('forge-novo-texto').value;
    if (manuscrito.trim().length < 200) { toast('O manuscrito precisa ter pelo menos 200 caracteres.', 'erro'); return; }
    if (!autor) { toast('Informe o autor do manuscrito.', 'erro'); return; }
    rota = 'ingerir';
    corpo = {
      manuscrito,
      titulo: forgeEl('forge-novo-titulo').value.trim() || undefined,
      modo: forgeEl('forge-novo-modo').value,
      formato,
      autor,
    };
  }
  const btn = forgeEl('forge-novo-enviar');
  btn.disabled = true;
  btn.textContent = 'Enviando…';
  try {
    const res = await forgeApi(rota, 'POST', corpo);
    if (!res.ok) { toast(forgeMensagemErro(res), 'erro'); return; }
    toast(res.dados?.message || 'Projeto enviado ao Forge.');
    ['forge-novo-tema', 'forge-novo-contexto', 'forge-novo-titulo', 'forge-novo-texto', 'forge-novo-formato', 'forge-novo-autor'].forEach((i) => { forgeEl(i).value = ''; });
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
  const b = e.target.closest('#forge-lista-body [data-acao], #fg-alerta [data-acao]');
  if (b) return forgeAcao(b.dataset.acao, b.dataset.id, b);
  const f = e.target.closest('#fg-stats [data-filtro]');
  if (f) { forgeFiltro = forgeFiltro === f.dataset.filtro ? 'todos' : f.dataset.filtro; forgeAba('lista'); forgeResumo(); forgeRenderTabela(); return; }
  const d = e.target.closest('[data-filtro-dash]');
  if (d) { forgeFiltro = d.dataset.filtroDash; irPara('forge', document.querySelector('.sb-item[onclick*="forge"]')); }
});
document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-filtro-dash]')) { e.preventDefault(); e.target.click(); }
});

// Se o admin já abriu logado (sessão guardada), o Dashboard pode ter iniciado antes deste arquivo carregar.
if (typeof token !== 'undefined' && token && forgeEl('fg-mini')?.textContent.includes('Carregando')) forgeResumoDashboard();
