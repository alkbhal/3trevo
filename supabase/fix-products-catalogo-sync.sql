-- ============================================================
-- FIX: Sincronizar tabela products com catalogo (fonte de verdade)
-- Corrigir UTF-8 quebrado no catalogo
-- Corrigir autor "Rogerio Dias" → "Said Anes"
-- Executar no Supabase Dashboard → SQL Editor
-- Data: 2026-06-25
-- ============================================================

-- ── 1. Desativar produtos antigos com slugs mortos ──────────
UPDATE products SET ativo = false WHERE slug IN ('vigilante', 'terceiraguerra');

-- ── 2. Atualizar slug antigo "terceiraguerra" → "3a-guerra" ─
UPDATE products SET slug = '3a-guerra' WHERE slug = 'terceiraguerra';
UPDATE products SET slug = 'antes-do-app' WHERE slug = 'atico';

-- ── 3. Inserir produtos faltantes (6 que não existem) ───────
INSERT INTO products (slug, titulo, preco, cotas, autor, ativo)
VALUES
  ('habitaculos', 'Habitáculos do Fim', 76.74, 10, 'Said Anes', true),
  ('ultima-coisa', 'A Última Coisa que Ela Disse', 76.74, 10, 'Anes Said', true),
  ('caminho-rubro-vol1', 'Caminho Rubro — Vol. 1: A Engenharia da Tirania', 46.04, 3, 'Said Anes', true),
  ('caminho-rubro-vol2', 'Caminho Rubro — Vol. 2: As 7 Leis', 46.04, 3, 'Said Anes', true),
  ('caminho-rubro-vol3', 'Caminho Rubro — Vol. 3: Tiranos São Construídos', 46.04, 3, 'Said Anes', true),
  ('livre-das-dividas', 'Livre das Dívidas', 15.35, 1, 'Said Anes', true),
  ('isa-isma-tintim', 'Isa, Isma e Tintim', 15.35, 1, 'Said Anes', true),
  ('antes-do-app', 'Antes do App, o Método', 37.00, 3, 'Said Anes', true)
ON CONFLICT (slug) DO UPDATE SET
  titulo = EXCLUDED.titulo,
  preco = EXCLUDED.preco,
  cotas = EXCLUDED.cotas,
  autor = EXCLUDED.autor,
  ativo = true;

-- ── 4. Atualizar produtos existentes ────────────────────────
UPDATE products SET
  titulo = 'O Nascimento Silencioso da 3ª Guerra Mundial',
  autor = 'Said Anes',
  ativo = true
WHERE slug = '3a-guerra';

UPDATE products SET
  titulo = 'Justiça(mento) para Orelha',
  autor = 'Said Anes',
  ativo = true
WHERE slug = 'justicamento';

UPDATE products SET
  titulo = 'O Guia Antifalência do Empreendedor',
  autor = 'Said Anes',
  ativo = true
WHERE slug = 'antifalencia';

-- ── 5. Corrigir autor no catalogo ───────────────────────────
UPDATE catalogo SET autor = 'Said Anes' WHERE slug = 'antifalencia';

-- ── 6. Corrigir UTF-8 quebrado no catalogo ──────────────────
UPDATE catalogo SET
  titulo = 'O Nascimento Silencioso da 3ª Guerra Mundial',
  descricao = 'Um analista de logística percebe padrões nos dados que ninguém quer ver.',
  genero = 'Ficção Documental',
  genero_pt = 'Ficção Documental'
WHERE slug = '3a-guerra';

UPDATE catalogo SET
  titulo = 'Habitáculos do Fim',
  descricao = 'Superricos, testes globais e a corrida pelo último refúgio.',
  genero = 'Ensaio'
WHERE slug = 'habitaculos';

UPDATE catalogo SET
  titulo = 'A Última Coisa que Ela Disse',
  descricao = 'Laura descobre uma caixa no porão da mãe falecida. Dentro, escritos em sete idiomas.',
  genero = 'Ficção Literária',
  genero_pt = 'Ficção Literária'
WHERE slug = 'ultima-coisa';

UPDATE catalogo SET
  titulo = 'Caminho Rubro — Vol. 1: A Engenharia da Tirania',
  descricao = 'Como regimes autoritários são construídos por dentro.',
  genero = 'Ensaio Político',
  genero_pt = 'Ensaio Político'
WHERE slug = 'caminho-rubro-vol1';

UPDATE catalogo SET
  titulo = 'Caminho Rubro — Vol. 2: As 7 Leis',
  descricao = 'Sete mecanismos que todo regime autoritário opera.',
  genero = 'Ensaio Político',
  genero_pt = 'Ensaio Político'
WHERE slug = 'caminho-rubro-vol2';

UPDATE catalogo SET
  titulo = 'Caminho Rubro — Vol. 3: Tiranos São Construídos',
  descricao = 'Casos comparados: Hungria, Turquia, Venezuela, Brasil.',
  genero = 'Ensaio Político',
  genero_pt = 'Ensaio Político'
WHERE slug = 'caminho-rubro-vol3';

UPDATE catalogo SET
  titulo = 'Livre das Dívidas',
  descricao = '70 milhões de brasileiros negativados. Este guia mostra o caminho de volta.',
  genero = 'Finanças Pessoais',
  genero_pt = 'Finanças Pessoais'
WHERE slug = 'livre-das-dividas';

UPDATE catalogo SET
  titulo = 'Isa, Isma e Tintim',
  descricao = 'Coração, vitalidade e alegria. Três irmãos e aventuras que ensinam sem sermão.'
WHERE slug = 'isa-isma-tintim';

UPDATE catalogo SET
  titulo = 'Antes do App, o Método',
  descricao = 'O método Ático de gestão financeira pessoal.',
  genero = 'Finanças / Método',
  genero_pt = 'Finanças / Método'
WHERE slug = 'antes-do-app';

-- ── 7. Desativar vigilante no products (se ainda existir) ───
DELETE FROM products WHERE slug = 'vigilante';

-- ── VERIFICAÇÃO ─────────────────────────────────────────────
-- Rodar após executar tudo:
-- SELECT slug, titulo, autor, ativo FROM products ORDER BY slug;
-- SELECT slug, titulo, autor, genero FROM catalogo ORDER BY slug;
