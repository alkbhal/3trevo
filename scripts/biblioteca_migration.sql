-- ============================================================
-- Biblioteca TT — Migration
-- Executar no Supabase Studio > SQL Editor
-- ============================================================

-- 1. Acervo de clássicos em domínio público
CREATE TABLE IF NOT EXISTS biblioteca_acervo (
  id                  uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                text         UNIQUE NOT NULL,
  titulo              text         NOT NULL,
  autor               text         NOT NULL,
  ano_publicacao      int,
  genero              text,
  sinopse             text,
  capa_url            text,
  epub_url            text,        -- URL externa (Gutenberg) ou caminho no R2
  paginas_estimadas   int,
  fonte               text,
  fonte_url           text,
  idioma              text         DEFAULT 'pt',
  ativo               boolean      DEFAULT true,
  featured            boolean      DEFAULT false,
  created_at          timestamptz  DEFAULT now()
);

-- 2. Slots de leitura (máx 3 por email)
CREATE TABLE IF NOT EXISTS biblioteca_slots (
  id                    uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 text         NOT NULL,
  acervo_id             uuid         REFERENCES biblioteca_acervo(id) ON DELETE RESTRICT,
  slot_numero           int          NOT NULL CHECK (slot_numero IN (1, 2, 3)),
  status                text         DEFAULT 'lendo' CHECK (status IN ('lendo', 'lida')),
  progresso_percentual  numeric(5,2) DEFAULT 0,
  pagina_atual          int          DEFAULT 0,
  iniciado_em           timestamptz  DEFAULT now(),
  concluido_em          timestamptz,
  UNIQUE (email, slot_numero)
);

-- 3. Histórico de leituras concluídas
CREATE TABLE IF NOT EXISTS biblioteca_historico (
  id                       uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  email                    text         NOT NULL,
  acervo_id                uuid         REFERENCES biblioteca_acervo(id),
  slug                     text,
  titulo                   text,
  autor                    text,
  concluido_em             timestamptz  DEFAULT now(),
  tempo_leitura_minutos    int
);

-- 4. View: slots ativos enriquecidos com dados da obra
CREATE OR REPLACE VIEW biblioteca_usuario_status AS
SELECT
  s.id,
  s.email,
  s.slot_numero,
  s.status,
  s.progresso_percentual,
  s.pagina_atual,
  s.iniciado_em,
  s.concluido_em,
  a.id           AS acervo_id,
  a.slug,
  a.titulo,
  a.autor,
  a.capa_url,
  a.paginas_estimadas,
  a.sinopse
FROM biblioteca_slots s
JOIN biblioteca_acervo a ON a.id = s.acervo_id
WHERE s.status = 'lendo';

-- 5. RLS (o Worker usa service_role e ignora RLS, mas é boa prática)
ALTER TABLE biblioteca_acervo    ENABLE ROW LEVEL SECURITY;
ALTER TABLE biblioteca_slots     ENABLE ROW LEVEL SECURITY;
ALTER TABLE biblioteca_historico ENABLE ROW LEVEL SECURITY;

-- Leitura pública do acervo (sem epub_url — exposta apenas via Worker autenticado)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'biblioteca_acervo' AND policyname = 'acervo_public_select'
  ) THEN
    CREATE POLICY acervo_public_select ON biblioteca_acervo
      FOR SELECT USING (ativo = true);
  END IF;
END $$;

-- 6. Índices de performance
CREATE INDEX IF NOT EXISTS idx_bib_slots_email   ON biblioteca_slots (email);
CREATE INDEX IF NOT EXISTS idx_bib_slots_status  ON biblioteca_slots (status);
CREATE INDEX IF NOT EXISTS idx_bib_hist_email    ON biblioteca_historico (email);
CREATE INDEX IF NOT EXISTS idx_bib_acervo_ativo  ON biblioteca_acervo (ativo, featured, titulo);

-- 7. Obras iniciais (5 clássicos domínio público — URLs do Projeto Gutenberg)
INSERT INTO biblioteca_acervo (slug, titulo, autor, ano_publicacao, genero, sinopse, epub_url, paginas_estimadas, fonte, fonte_url, idioma, featured)
VALUES
  (
    'dom-casmurro',
    'Dom Casmurro',
    'Machado de Assis',
    1899,
    'Romance',
    'Bentinho, o narrador, reconstrói sua vida para provar — ou negar — que Capitu era mesmo "de ressaca". Um dos maiores romances da literatura brasileira.',
    'https://www.gutenberg.org/ebooks/55752.epub.images',
    256,
    'Projeto Gutenberg',
    'https://www.gutenberg.org/ebooks/55752',
    'pt',
    true
  ),
  (
    'memorias-postumas',
    'Memórias Póstumas de Brás Cubas',
    'Machado de Assis',
    1881,
    'Romance',
    'O primeiro defunto-autor da literatura brasileira conta sua vida após a morte, com ironia e pessimismo que inauguraram o Realismo no Brasil.',
    'https://www.gutenberg.org/ebooks/54829.epub.images',
    224,
    'Projeto Gutenberg',
    'https://www.gutenberg.org/ebooks/54829',
    'pt',
    true
  ),
  (
    'o-cortico',
    'O Cortiço',
    'Aluísio Azevedo',
    1890,
    'Romance',
    'A vida no cortiço carioca — a luta de classes, a miscigenação e o determinismo social no Brasil do século XIX. Obra máxima do Naturalismo brasileiro.',
    'https://www.gutenberg.org/ebooks/36981.epub.images',
    288,
    'Projeto Gutenberg',
    'https://www.gutenberg.org/ebooks/36981',
    'pt',
    false
  ),
  (
    'iracema',
    'Iracema',
    'José de Alencar',
    1865,
    'Romance',
    'A lenda do Ceará — o amor trágico entre a índia Iracema e o guerreiro Martim. Fundação poética da identidade brasileira.',
    'https://www.gutenberg.org/ebooks/37869.epub.images',
    160,
    'Projeto Gutenberg',
    'https://www.gutenberg.org/ebooks/37869',
    'pt',
    false
  ),
  (
    'o-guarani',
    'O Guarani',
    'José de Alencar',
    1857,
    'Romance',
    'Peri, o nobre índio, e Ceci, a filha do fidalgo português — uma história de amor e fidelidade no Brasil colonial. Marco do Romantismo nacional.',
    'https://www.gutenberg.org/ebooks/37869.epub.images',
    400,
    'Projeto Gutenberg',
    'https://www.gutenberg.org/ebooks/37869',
    'pt',
    false
  )
ON CONFLICT (slug) DO NOTHING;
