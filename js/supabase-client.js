// js/supabase-client.js
// Instância única do Supabase — importar em todas as páginas

const SUPABASE_URL  = 'https://xfkepekffdyrtcgagwqo.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhma2VwZWtmZmR5cnRjZ2Fnd3FvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NzkyMTMsImV4cCI6MjA5MDE1NTIxM30.UtCfSrLZlJanIUMlQKE_nEr9YKIvBhPIaIdQPcQfGTI';

// supabase global vem do CDN carregado antes deste script
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// Expose for other scripts (player.js, etc.) — single source of truth
window.SUPABASE_URL  = SUPABASE_URL;
window.SUPABASE_ANON = SUPABASE_ANON;
window.sb             = sb;

// URL base das Edge Functions
const EDGE_BASE = `${SUPABASE_URL}/functions/v1`;

// Catálogo local (espelha products no banco — fallback visual). Usado em 2 lugares:
// (1) checkout.html só cai aqui se a query ao vivo falhar de verdade (rede fora);
// (2) area-cliente.html usa como metadado de gênero pra agrupar a biblioteca do
// cliente, incluindo títulos já INATIVOS que alguém comprou no passado -- por isso
// as 5 entradas de títulos inativos continuam aqui de propósito, só com preço/cotas
// corrigidos pro valor real (estavam congelados desde uma edição antiga do HTML,
// nunca atualizados quando o preço mudou no admin). Ver commit desta correção.
const CATALOGO = {
  '3a-guerra':          { titulo: 'O Nascimento Silencioso da 3ª Guerra Mundial', autor: 'Said Anes', genero: 'Ficção Documental', cotas: 10, preco: 35.00 },
  habitaculos:          { titulo: 'Habitáculos do Fim',                           autor: 'Said Anes', genero: 'Ensaio',            cotas: 10, preco: 35.00 },
  'ultima-coisa':       { titulo: 'A Última Coisa que Ela Disse',                 autor: 'Anes Said', genero: 'Ficção Literária',  cotas: 10, preco: 35.00 },
  'caminho-rubro-vol1': { titulo: 'Caminho Rubro — Vol. 1: A Engenharia da Tirania', autor: 'Said Anes', genero: 'Ensaio Político', cotas: 3, preco: 29.90 },
  'caminho-rubro-vol2': { titulo: 'Caminho Rubro — Vol. 2: As 7 Leis',           autor: 'Said Anes', genero: 'Ensaio Político',   cotas: 3,  preco: 29.90 },
  'caminho-rubro-vol3': { titulo: 'Caminho Rubro — Vol. 3: Tiranos São Construídos', autor: 'Said Anes', genero: 'Ensaio Político', cotas: 3, preco: 29.90 },
  justicamento:         { titulo: 'Justiça(mento) para Orelha',                   autor: 'Said Anes', genero: 'Ensaio',            cotas: 1,  preco: 10.00 },
  antifalencia:         { titulo: 'O Guia Antifalência do Empreendedor Iniciante', autor: 'Said Anes', genero: 'Manual',          cotas: 3,  preco: 29.90 },
  'livre-das-dividas':  { titulo: 'Livre das Dívidas',                            autor: 'Said Anes', genero: 'Finanças Pessoais', cotas: 1,  preco: 15.35 },
  'isa-isma-tintim':    { titulo: 'Isa, Isma e Tintim',                           autor: 'Said Anes', genero: 'Infantojuvenil',   cotas: 1,  preco: 19.90 },
  'antes-do-app':       { titulo: 'Antes do App, o Método',                       autor: 'Said Anes', genero: 'Finanças / Método', cotas: 3,  preco: 29.90 },
};

// Catálogo live do Supabase (sobrepõe hardcoded quando disponível)
window.CATALOGO_LIVE = null;

async function carregarCatalogo() {
  try {
    const { data } = await sb.from('catalogo').select('slug,titulo,preco,cotas,ativo').eq('ativo', true);
    if (data && data.length) {
      window.CATALOGO_LIVE = {};
      data.forEach(p => {
        if (typeof p.slug === 'string' && p.slug.length > 0 && typeof p.preco === 'number' && p.preco >= 0) {
          window.CATALOGO_LIVE[p.slug] = p;
        }
      });
      if (!Object.keys(window.CATALOGO_LIVE).length) window.CATALOGO_LIVE = null;
    }
  } catch (e) { /* fallback to hardcoded CATALOGO */ }
}

function getCatalogo() {
  return window.CATALOGO_LIVE || CATALOGO;
}

carregarCatalogo();
