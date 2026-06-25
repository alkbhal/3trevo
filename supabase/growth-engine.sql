-- ============================================================
-- GROWTH ENGINE — Schema
-- Tabelas de leads, eventos, campanhas, métricas e email sequence
-- Executar no Supabase Dashboard → SQL Editor
-- Data: 2026-06-25
-- ============================================================

-- ── UTM attribution em pedidos (additive, safe) ─────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pedidos') THEN
    ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS utm_source text;
    ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS utm_medium text;
    ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS utm_campaign text;
    ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS lead_id uuid;
    ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS campaign_id uuid;
  END IF;
END $$;

-- ── LEADS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email        text UNIQUE NOT NULL,
  nome         text,
  whatsapp     text,
  source       text DEFAULT 'organic',
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  utm_content  text,
  utm_term     text,
  status       text DEFAULT 'novo',
  score        int  DEFAULT 0,
  unsub_token  uuid DEFAULT gen_random_uuid(),
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leads_email_idx  ON leads(email);
CREATE INDEX IF NOT EXISTS leads_status_idx ON leads(status);

-- ── LEAD_EVENTS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lead_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lead_id     uuid REFERENCES leads(id) ON DELETE SET NULL,
  anon_id     text,
  event_type  text NOT NULL,
  page        text,
  utm_source  text,
  utm_medium  text,
  utm_campaign text,
  props       jsonb DEFAULT '{}'::jsonb,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_events_type_idx ON lead_events(event_type, created_at);
CREATE INDEX IF NOT EXISTS lead_events_camp_idx ON lead_events(utm_campaign, created_at);
CREATE INDEX IF NOT EXISTS lead_events_anon_idx ON lead_events(anon_id);

-- ── CAMPAIGNS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaigns (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  utm_campaign text UNIQUE NOT NULL,
  channel      text NOT NULL,
  budget_daily numeric(10,2) DEFAULT 0,
  budget_total numeric(10,2) DEFAULT 0,
  spent        numeric(10,2) DEFAULT 0,
  revenue      numeric(10,2) DEFAULT 0,
  tier         int DEFAULT 1,
  status       text DEFAULT 'active',
  paused_reason text,
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS campaigns_status_idx ON campaigns(status);

-- ── CAMPAIGN_DAILY ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_daily (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  date        date NOT NULL,
  impressions int DEFAULT 0,
  clicks      int DEFAULT 0,
  leads       int DEFAULT 0,
  conversions int DEFAULT 0,
  spend       numeric(10,2) DEFAULT 0,
  revenue     numeric(10,2) DEFAULT 0,
  roi         numeric(8,2)  DEFAULT 0,
  UNIQUE (campaign_id, date)
);
CREATE INDEX IF NOT EXISTS campaign_daily_date_idx ON campaign_daily(date);

-- ── EMAIL_SEQUENCE ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_sequence (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lead_id       uuid REFERENCES leads(id) ON DELETE CASCADE,
  sequence_step int NOT NULL,
  scheduled_at  timestamptz NOT NULL,
  sent_at       timestamptz,
  opened_at     timestamptz,
  clicked_at    timestamptz,
  tag           text,
  UNIQUE (lead_id, sequence_step)
);
CREATE INDEX IF NOT EXISTS email_seq_due_idx ON email_sequence(scheduled_at) WHERE sent_at IS NULL;

-- ── EMAIL_TEMPLATES ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_templates (
  id       int PRIMARY KEY,
  tag      text UNIQUE NOT NULL,
  subject  text NOT NULL,
  html     text NOT NULL
);

INSERT INTO email_templates (id, tag, subject, html) VALUES
(0, 'lead_magnet', 'Aqui está seu capítulo gratuito', '<p>Olá {{nome}},</p><p>Seu primeiro capítulo de <strong>O Nascimento Silencioso da 3ª Guerra Mundial</strong> está pronto.</p><p><a href="{{link}}">Baixar capítulo →</a></p><p>Boa leitura!<br>Editora Três Trevo</p>'),
(1, 'nurture_1', 'O que acontece no capítulo 4 mudou minha forma de pensar', '<p>{{nome}},</p><p>"Quando ele cruzou os dados de logística com as rotas militares, tudo fez sentido."</p><p>Esse é o momento em que o protagonista entende o que está acontecendo — e não consegue mais voltar atrás.</p><p><a href="https://3trevo.com.br/catalogo.html">Ver o catálogo completo →</a></p>'),
(2, 'nurture_2', 'Você sabia que pode concorrer a R$6.000 lendo?', '<p>{{nome}},</p><p>Cada ebook da Editora Três Trevo dá direito a participar do Programa Cultural:</p><ol><li>Compre um ebook</li><li>Leia e escreva o que achou</li><li>Concorra a prêmios de R$500 a R$6.000</li></ol><p>Simples assim. <a href="https://3trevo.com.br/#programa">Saiba mais →</a></p>'),
(3, 'nurture_3', 'Faltam poucos dias para o sorteio', '<p>{{nome}},</p><p>A próxima rodada do Programa Cultural está chegando. Quem já adquiriu e validou seu depoimento está participando.</p><p><a href="https://3trevo.com.br/catalogo.html">Garantir minha participação →</a></p>'),
(4, 'nurture_4', 'Última chance — e um presente', '<p>{{nome}},</p><p>Ainda dá tempo de entrar nesta rodada. E para quem adquirir hoje, acesso ao acervo da Biblioteca Clássica TT está incluso.</p><p><a href="https://3trevo.com.br/catalogo.html">Adquirir agora →</a></p><p>Garantia de 7 dias — não gostou, devolvemos.</p>')
ON CONFLICT (tag) DO NOTHING;

-- ── RLS (service-role-only) ─────────────────────────────────
ALTER TABLE leads          ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns      ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_sequence ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
