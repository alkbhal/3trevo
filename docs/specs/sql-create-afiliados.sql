-- Tabela: afiliados
-- Executar no Supabase SQL Editor: https://app.supabase.com → project xfkepekffdyrtcgagwqo → SQL Editor
-- Schema extraído do admin.html (campos usados em select, insert, update)

CREATE TABLE IF NOT EXISTS public.afiliados (
  id                   uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  nome                 text        NOT NULL,
  email                text        NOT NULL UNIQUE,
  slug                 text        NOT NULL UNIQUE,
  percentual_comissao  numeric(5,2) NOT NULL DEFAULT 10,
  ativo                boolean     NOT NULL DEFAULT true,
  criado_em            timestamptz NOT NULL DEFAULT now()
);

-- Índice para lookup por slug (usado nas contagens de conversão)
CREATE INDEX IF NOT EXISTS afiliados_slug_idx ON public.afiliados (slug);

-- RLS: somente service_role e admins autenticados lêem/escrevem
ALTER TABLE public.afiliados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "afiliados_read_admin" ON public.afiliados
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "afiliados_write_admin" ON public.afiliados
  FOR ALL USING (auth.role() = 'authenticated');

-- Coluna aff_slug na tabela purchases (se ainda não existe)
-- Rastreia de qual afiliado veio cada compra
ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS aff_slug text REFERENCES public.afiliados(slug) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS purchases_aff_slug_idx ON public.purchases (aff_slug);
