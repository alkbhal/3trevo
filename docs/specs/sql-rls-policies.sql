-- Migrações RLS aplicadas via Supabase MCP em 2026-06-08
-- Projeto: xfkepekffdyrtcgagwqo (3trevo-producao)

-- ============================================================
-- Migração 1: afiliados_indexes_fk_policies
-- Índices, FK e policies da tabela afiliados (tabela já existia)
-- ============================================================

CREATE INDEX IF NOT EXISTS afiliados_slug_idx ON public.afiliados (slug);
CREATE INDEX IF NOT EXISTS purchases_aff_slug_idx ON public.purchases (aff_slug);

-- FK purchases.aff_slug -> afiliados.slug
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND tc.table_name = 'purchases'
      AND kcu.column_name = 'aff_slug'
  ) THEN
    ALTER TABLE public.purchases
      ADD CONSTRAINT purchases_aff_slug_fkey
      FOREIGN KEY (aff_slug) REFERENCES public.afiliados(slug) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  CREATE POLICY "afiliados_read_admin" ON public.afiliados
    FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "afiliados_write_admin" ON public.afiliados
    FOR ALL USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- Migração 2: rls_enable_4_tables_with_policies
-- RLS nas 4 tabelas expostas (notas_fiscais, gdpr_requests,
-- audit_log, draw_audits). service_role bypassa RLS por design.
-- ============================================================

-- notas_fiscais: leitura pelo admin; escrita via service_role (bypass)
ALTER TABLE public.notas_fiscais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nf_select_authenticated"
  ON public.notas_fiscais FOR SELECT
  USING (auth.role() = 'authenticated');

-- gdpr_requests: usuário vê/insere os próprios; admin gerencia status
ALTER TABLE public.gdpr_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gdpr_select_own_or_admin"
  ON public.gdpr_requests FOR SELECT
  USING (auth.uid() = user_id OR auth.role() = 'authenticated');

CREATE POLICY "gdpr_insert_own"
  ON public.gdpr_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "gdpr_update_admin"
  ON public.gdpr_requests FOR UPDATE
  USING (auth.role() = 'authenticated');

-- audit_log: leitura pelo admin; escrita via service_role (bypass)
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_select_authenticated"
  ON public.audit_log FOR SELECT
  USING (auth.role() = 'authenticated');

-- draw_audits: leitura pública (transparência legal — auditoria-sorteio.html)
ALTER TABLE public.draw_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "draw_audits_select_public"
  ON public.draw_audits FOR SELECT
  USING (true);
