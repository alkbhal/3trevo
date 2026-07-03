-- Corrige títulos com encoding quebrado (U+FFFD) dos títulos próprios da Editora
-- na tabela biblioteca_acervo. Bytes originais foram perdidos no insert — reconstruídos
-- manualmente com base no português correto (3a-guerra já estava correto, não entra aqui).
-- Executar no Supabase Studio > SQL Editor
UPDATE biblioteca_acervo SET titulo = 'O Guia Antifalência do Empreendedor Iniciante' WHERE slug = 'antifalencia';
UPDATE biblioteca_acervo SET titulo = 'Isa, Isma e Tintim: A Série dos Três Irmãos' WHERE slug = 'isa-isma-tintim';
UPDATE biblioteca_acervo SET titulo = 'Justiça(mento) para Orelha' WHERE slug = 'justicamento';
UPDATE biblioteca_acervo SET titulo = 'Habitáculos do Fim' WHERE slug = 'habitaculos';
UPDATE biblioteca_acervo SET titulo = 'A Última Coisa que Ela Disse' WHERE slug = 'ultima-coisa';
UPDATE biblioteca_acervo SET titulo = 'Caminho Rubro — Volume 1: A Engenharia da Tirania' WHERE slug = 'caminho-rubro-vol1';
UPDATE biblioteca_acervo SET titulo = 'Caminho Rubro — Volume 2: As 7 Leis Não Escritas da Tirania' WHERE slug = 'caminho-rubro-vol2';
UPDATE biblioteca_acervo SET titulo = 'Caminho Rubro — Volume 3: Tiranos São Construídos, Não Eleitos' WHERE slug = 'caminho-rubro-vol3';
UPDATE biblioteca_acervo SET titulo = 'Livre das Dívidas — Um Guia Prático Para o Brasileiro' WHERE slug = 'livre-das-dividas';
UPDATE biblioteca_acervo SET titulo = 'Antes do App, o Método' WHERE slug = 'antes-do-app';
