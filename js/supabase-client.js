// js/supabase-client.js
// Instância única do Supabase — importar em todas as páginas

const SUPABASE_URL  = 'https://xfkepekffdyrtcgagwqo.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhma2VwZWtmZmR5cnRjZ2Fnd3FvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NzkyMTMsImV4cCI6MjA5MDE1NTIxM30.UtCfSrLZlJanIUMlQKE_nEr9YKIvBhPIaIdQPcQfGTI';

// supabase global vem do CDN carregado antes deste script
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// URL base das Edge Functions
const EDGE_BASE = `${SUPABASE_URL}/functions/v1`;

// Catálogo local (espelha products no banco — fallback visual)
const CATALOGO = {
  justicamento:   { titulo: 'Justiça(mento) para Orelha',              autor: 'Said Anes', genero: 'Ensaio',            emoji: '⚖️', cor: '#1a4a2e', cotas: 1,  preco: 15.35 },
  vigilante:      { titulo: 'Vigilante',                               autor: 'Said Anes', genero: 'Ficção Literária',  emoji: '🔍', cor: '#2a1a1a', cotas: 10, preco: 76.74 },
  terceiraguerra: { titulo: 'O Nascimento Silencioso da 3ª GM',         autor: 'Said Anes', genero: 'Ficção Documental', emoji: '🌐', cor: '#1a1a2e', cotas: 10, preco: 76.74 },
  antifalencia:   { titulo: 'O Guia Antifalência do Empreendedor',      autor: 'Said Anes', genero: 'Manual',           emoji: '📘', cor: '#1a2a3e', cotas: 3,  preco: 46.04 },
};
