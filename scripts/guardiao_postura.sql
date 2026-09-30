-- guardiao_postura — evidência SOMENTE LEITURA para o Guardião (worker/src/guardiao).
-- Devolve: quais funções da lista p_funcs ainda podem ser executadas por anon/
-- authenticated, quais nem existem mais, e quais tabelas do schema public estão
-- sem RLS. Não altera nada. Só a service_role (o worker) pode chamar.
--
-- ROLLBACK: DROP FUNCTION public.guardiao_postura(text[]);
-- (sem ela o Guardião passa a reportar 🟡 "não verificado", nunca 🟢.)

CREATE OR REPLACE FUNCTION public.guardiao_postura(p_funcs text[])
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'funcoes_expostas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('fn', f.proname, 'roles', to_jsonb(f.roles)) ORDER BY f.proname)
      FROM (
        SELECT p.proname,
               array_remove(ARRAY[
                 CASE WHEN has_function_privilege('anon', p.oid, 'execute') THEN 'anon' END,
                 CASE WHEN has_function_privilege('authenticated', p.oid, 'execute') THEN 'authenticated' END
               ], NULL) AS roles
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = ANY (p_funcs)
      ) f
      WHERE cardinality(f.roles) > 0
    ), '[]'::jsonb),
    'funcoes_ausentes', COALESCE((
      SELECT jsonb_agg(x ORDER BY x)
      FROM unnest(p_funcs) x
      WHERE NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = x
      )
    ), '[]'::jsonb),
    'tabelas_sem_rls', COALESCE((
      SELECT jsonb_agg(c.relname ORDER BY c.relname)
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.guardiao_postura(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guardiao_postura(text[]) TO service_role;
