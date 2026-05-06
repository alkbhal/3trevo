-- ============================================================
-- Editora Três Trevo — Schema Supabase Completo
-- Executar no SQL Editor do Supabase
-- ============================================================

-- ── PROFILES ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome        text,
  telefone    text,
  cpf         text,
  avatar_url  text,
  criado_em   timestamptz DEFAULT now()
);

-- Trigger: cria profile automaticamente no signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles(id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();

-- ── PRODUCTS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text UNIQUE NOT NULL,
  tipo        text NOT NULL DEFAULT 'ebook', -- 'ebook' | 'musica' | 'bundle'
  titulo      text NOT NULL,
  titulo_en   text,
  titulo_es   text,
  descricao   text,
  descricao_en text,
  descricao_es text,
  autor       text,
  genero      text,
  preco       numeric(10,2) NOT NULL,
  cotas       int DEFAULT 0,
  arquivo_url text,           -- URL privada no Supabase Storage
  capa_url    text,
  bg_color    text DEFAULT '#1a4a2e',
  ativo       boolean DEFAULT true,
  ordem       int DEFAULT 0,
  criado_em   timestamptz DEFAULT now()
);

-- ── PAYMENTS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  product_id       uuid REFERENCES products(id) ON DELETE SET NULL,
  mp_preference_id text,
  mp_payment_id    text,
  metodo           text,      -- 'pix' | 'credit_card' | 'boleto'
  status           text DEFAULT 'pending', -- 'pending'|'approved'|'rejected'|'refunded'|'cancelled'
  valor            numeric(10,2),
  email_pagador    text,
  vencimento       timestamptz,
  raw_mp           jsonb,
  criado_em        timestamptz DEFAULT now(),
  atualizado_em    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payments_user_id_idx ON payments(user_id);
CREATE INDEX IF NOT EXISTS payments_mp_payment_id_idx ON payments(mp_payment_id);
CREATE INDEX IF NOT EXISTS payments_status_idx ON payments(status);

-- ── PURCHASES ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchases (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  product_id  uuid REFERENCES products(id) ON DELETE SET NULL,
  payment_id  uuid REFERENCES payments(id) ON DELETE SET NULL,
  valor_pago  numeric(10,2),
  cotas       int DEFAULT 0,
  status      text DEFAULT 'active', -- 'active' | 'refunded'
  criado_em   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS purchases_user_id_idx ON purchases(user_id);

-- ── SUBSCRIPTIONS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  plano       text,           -- 'mensal' | 'trimestral' | 'anual'
  status      text DEFAULT 'active', -- 'active' | 'paused' | 'canceled'
  mp_sub_id   text,
  inicio_em   timestamptz DEFAULT now(),
  vencimento  timestamptz,
  criado_em   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx ON subscriptions(user_id);

-- ── USER_LIBRARY ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_library (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id  uuid REFERENCES products(id) ON DELETE CASCADE,
  origem      text,           -- 'purchase' | 'subscription' | 'bonus'
  origem_id   uuid,           -- purchase_id ou subscription_id
  liberado_em timestamptz DEFAULT now(),
  expira_em   timestamptz,    -- null = acesso permanente
  UNIQUE(user_id, product_id)
);

CREATE INDEX IF NOT EXISTS user_library_user_id_idx ON user_library(user_id);

-- ── DOWNLOADS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS downloads (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id  uuid REFERENCES products(id) ON DELETE CASCADE,
  token       uuid DEFAULT gen_random_uuid() UNIQUE,
  criado_em   timestamptz DEFAULT now(),
  expira_em   timestamptz DEFAULT (now() + interval '72 hours'),
  usado_em    timestamptz,
  ip          text
);

CREATE INDEX IF NOT EXISTS downloads_token_idx ON downloads(token);
CREATE INDEX IF NOT EXISTS downloads_user_id_idx ON downloads(user_id);

-- ── DRAWS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS draws (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo              text,
  status              text DEFAULT 'open', -- 'open' | 'closed' | 'drawn' | 'aguardando_qualificacao'
  data_sorteio        timestamptz,
  premio_1            text,
  premio_2            text,
  meta_tipo           text DEFAULT 'valor',    -- 'valor' | 'quantidade'
  meta_valor          numeric(12,2) DEFAULT 0, -- valor alvo em R$ ou qtd de exemplares
  meta_atual          numeric(12,2) DEFAULT 0, -- progresso atual (acumulado)
  max_numeros         int DEFAULT 100000,       -- tamanho da cartela (1..max_numeros)
  numero_sorteado     int,                      -- número da cartela que saiu no sorteio
  criado_em           timestamptz DEFAULT now()
);

-- ── DRAW_ENTRIES ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS draw_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draw_id         uuid REFERENCES draws(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  purchase_id     uuid REFERENCES purchases(id) ON DELETE CASCADE,
  cotas_base      int DEFAULT 0,
  cotas_bonus     int DEFAULT 0,
  dep_validado    boolean DEFAULT false,
  dep_texto       text,
  redes_seguidas  text[] DEFAULT '{}',
  multiplicador   numeric(3,1) DEFAULT 1.0,
  qualificado     boolean DEFAULT false,
  criado_em       timestamptz DEFAULT now(),
  UNIQUE(draw_id, purchase_id)
);

CREATE INDEX IF NOT EXISTS draw_entries_draw_id_idx ON draw_entries(draw_id);
CREATE INDEX IF NOT EXISTS draw_entries_user_id_idx ON draw_entries(user_id);

-- ── DRAW_WINNERS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS draw_winners (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draw_id     uuid REFERENCES draws(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  posicao     int,
  cotas_total int,
  premio      text,
  pago_em     timestamptz,
  criado_em   timestamptz DEFAULT now()
);

-- ── DRAW_NUMBERS ────────────────────────────────────────────
-- Cartela de números por rodada (1 a max_numeros)
CREATE TABLE IF NOT EXISTS draw_numbers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draw_id      uuid REFERENCES draws(id) ON DELETE CASCADE,
  numero       int NOT NULL CHECK (numero >= 1 AND numero <= 100000),
  user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  origem       text NOT NULL DEFAULT 'purchase', -- 'purchase' | 'manual' | 'bonus'
  purchase_id  uuid REFERENCES purchases(id) ON DELETE SET NULL,
  obs          text,                              -- nota admin para origem manual
  atribuido_em timestamptz DEFAULT now(),
  UNIQUE(draw_id, numero)
);

CREATE INDEX IF NOT EXISTS draw_numbers_draw_id_idx   ON draw_numbers(draw_id);
CREATE INDEX IF NOT EXISTS draw_numbers_user_id_idx   ON draw_numbers(user_id);
CREATE INDEX IF NOT EXISTS draw_numbers_draw_user_idx ON draw_numbers(draw_id, user_id);

ALTER TABLE draw_numbers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "draw_numbers: public read" ON draw_numbers;
CREATE POLICY "draw_numbers: public read" ON draw_numbers
  FOR SELECT USING (true);

-- ── DRAW_AUDITS ─────────────────────────────────────────────
-- Registro imutável e auditável de cada sorteio executado
CREATE TABLE IF NOT EXISTS draw_audits (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draw_id        uuid REFERENCES draws(id) UNIQUE,
  seed           text NOT NULL,
  algoritmo      text NOT NULL DEFAULT 'cartela-mulberry32',
  numero_sorteado int,                            -- número da cartela sorteado
  cartela        jsonb,                           -- [{numero, user_id, email_masked, origem}] — snapshot público da cartela
  participantes  jsonb NOT NULL,                  -- [{user_id, email_masked, numeros: [n1,n2,...], total_numeros}]
  resultado      jsonb NOT NULL,                  -- [{posicao, user_id, email_masked, numero_sorteado}]
  hash_sha256    text NOT NULL,
  executado_em   timestamptz DEFAULT now(),
  executado_por  uuid
);

CREATE INDEX IF NOT EXISTS draw_audits_draw_id_idx ON draw_audits(draw_id);

ALTER TABLE draw_audits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "draw_audits: public read" ON draw_audits;
CREATE POLICY "draw_audits: public read" ON draw_audits
  FOR SELECT USING (true);

-- ── BONUS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bonus (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo      text,
  descricao   text,
  arquivo_url text,
  ativo       boolean DEFAULT true,
  criado_em   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bonus_user_id_idx ON bonus(user_id);

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- PROFILES
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles: own" ON profiles;
CREATE POLICY "profiles: own" ON profiles
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- PRODUCTS (leitura pública para ativos)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "products: public read" ON products;
CREATE POLICY "products: public read" ON products
  FOR SELECT USING (ativo = true);

-- PAYMENTS (usuário vê só os seus)
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payments: own select" ON payments;
CREATE POLICY "payments: own select" ON payments
  FOR SELECT USING (auth.uid() = user_id);

-- PURCHASES (usuário vê só os seus)
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "purchases: own select" ON purchases;
CREATE POLICY "purchases: own select" ON purchases
  FOR SELECT USING (auth.uid() = user_id);

-- SUBSCRIPTIONS (usuário vê só as suas)
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "subscriptions: own select" ON subscriptions;
CREATE POLICY "subscriptions: own select" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- USER_LIBRARY (usuário lê os seus)
ALTER TABLE user_library ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "library: own select" ON user_library;
CREATE POLICY "library: own select" ON user_library
  FOR SELECT USING (auth.uid() = user_id);

-- DOWNLOADS (usuário lê os seus)
ALTER TABLE downloads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "downloads: own select" ON downloads;
CREATE POLICY "downloads: own select" ON downloads
  FOR SELECT USING (auth.uid() = user_id);

-- DRAWS (leitura pública)
ALTER TABLE draws ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "draws: public read" ON draws;
CREATE POLICY "draws: public read" ON draws
  FOR SELECT USING (true);

-- DRAW_ENTRIES (usuário lê e insere os seus)
ALTER TABLE draw_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "draw_entries: own select" ON draw_entries;
CREATE POLICY "draw_entries: own select" ON draw_entries
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "draw_entries: own insert" ON draw_entries;
CREATE POLICY "draw_entries: own insert" ON draw_entries
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "draw_entries: own update" ON draw_entries;
CREATE POLICY "draw_entries: own update" ON draw_entries
  FOR UPDATE USING (auth.uid() = user_id);

-- DRAW_WINNERS (leitura pública)
ALTER TABLE draw_winners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "draw_winners: public read" ON draw_winners;
CREATE POLICY "draw_winners: public read" ON draw_winners
  FOR SELECT USING (true);

-- BONUS (usuário lê os seus)
ALTER TABLE bonus ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bonus: own select" ON bonus;
CREATE POLICY "bonus: own select" ON bonus
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================================
-- SEED: Catálogo inicial (produtos)
-- ============================================================
INSERT INTO products (slug, tipo, titulo, titulo_en, descricao, autor, genero, preco, cotas, bg_color, ordem)
VALUES
  ('justicamento', 'ebook', 'Justiça(mento) para Orelha', 'Justice(ment) for the Ear',
   'Um ensaio sobre justiça, linguagem e poder. Para quem questiona o que ouve antes de repetir.',
   'Said Anes', 'Ensaio', 15.35, 1, '#1a4a2e', 1),
  ('vigilante', 'ebook', 'Vigilante', 'Vigilante',
   'Uma narrativa sobre o limite entre justiça e vingança, entre lei e consciência.',
   'Said Anes', 'Ficção Literária', 76.74, 10, '#2a1a1a', 2),
  ('terceiraguerra', 'ebook', 'O Nascimento Silencioso da 3ª Guerra Mundial', 'The Silent Birth of WWIII',
   'Como guerras modernas acontecem sem disparos — no campo da informação, economia e política.',
   'Said Anes', 'Ficção Documental', 76.74, 10, '#1a1a2e', 3),
  ('antifalencia', 'ebook', 'O Guia Antifalência do Empreendedor Iniciante', 'Anti-Bankruptcy Guide Vol.1',
   'A conta que ninguém te obriga a fazer. Custos, precificação e ponto de equilíbrio.',
   'Said Anes', 'Manual', 46.04, 3, '#1a2a3e', 4)
ON CONFLICT (slug) DO NOTHING;

-- SEED: Sorteio inicial aberto
INSERT INTO draws (titulo, status, premio_1, premio_2, meta_valor)
VALUES (
  'Rodada 1 — Programa Cultural Três Trevo',
  'open',
  '1 salário mínimo nacional (PIX em D+7)',
  'R$ 500,00 (PIX em D+7)',
  0.00
)
ON CONFLICT DO NOTHING;
