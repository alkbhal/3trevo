// js/supabase-client.js
// Instância única do Supabase — importar em todas as páginas

const SUPABASE_URL  = 'https://xfkepekffdyrtcgagwqo.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhma2VwZWtmZmR5cnRjZ2Fnd3FvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NzkyMTMsImV4cCI6MjA5MDE1NTIxM30.UtCfSrLZlJanIUMlQKE_nEr9YKIvBhPIaIdQPcQfGTI';

// supabase global vem do CDN carregado antes deste script
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// Expose for other scripts (player.js, etc.) — single source of truth
window.SUPABASE_URL  = SUPABASE_URL;
window.SUPABASE_ANON = SUPABASE_ANON;

// URL base das Edge Functions
const EDGE_BASE = `${SUPABASE_URL}/functions/v1`;

// Catálogo local (espelha products no banco — fallback visual)
const CATALOGO = {
  justicamento:   { titulo: 'Justiça(mento) para Orelha',              autor: 'Said Anes', genero: 'Ensaio',            emoji: '⚖️', cor: '#1a4a2e', cotas: 1,  preco: 15.35 },
  vigilante:      { titulo: 'Vigilante',                               autor: 'Said Anes', genero: 'Ficção Literária',  emoji: '🔍', cor: '#2a1a1a', cotas: 10, preco: 76.74 },
  terceiraguerra: { titulo: 'O Nascimento Silencioso da 3ª GM',         autor: 'Said Anes', genero: 'Ficção Documental', emoji: '🌐', cor: '#1a1a2e', cotas: 10, preco: 76.74 },
  antifalencia:   { titulo: 'O Guia Antifalência do Empreendedor',      autor: 'Said Anes', genero: 'Manual',           emoji: '📘', cor: '#1a2a3e', cotas: 3,  preco: 46.04 },
  atico:          { titulo: 'Antes do App, o Método',                   autor: 'Said Anes', genero: 'Finanças · Método', emoji: '⚡', cor: '#1a2a1a', cotas: 3,  preco: 37.00 },
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
