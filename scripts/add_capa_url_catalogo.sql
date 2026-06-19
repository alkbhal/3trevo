-- Adiciona coluna capa_url à tabela catalogo
-- Executar no SQL Editor do Supabase (uma vez)
ALTER TABLE catalogo ADD COLUMN IF NOT EXISTS capa_url text;
