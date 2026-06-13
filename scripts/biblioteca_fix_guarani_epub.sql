-- Corrige epub_url de O Guarani (usava mesma URL de Iracema por engano)
-- Executar no Supabase Studio > SQL Editor
UPDATE biblioteca_acervo
SET
  epub_url  = 'https://www.gutenberg.org/ebooks/67724.epub.images',
  fonte_url = 'https://www.gutenberg.org/ebooks/67724'
WHERE slug = 'o-guarani';
