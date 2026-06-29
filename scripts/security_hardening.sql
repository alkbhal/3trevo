-- ============================================================
-- SEGURANÇA — Hardening do Supabase
-- Executar no SQL Editor do Supabase (uma vez)
-- Corrige: search path injection, EXECUTE público em funções
-- admin, e view SECURITY DEFINER
-- ============================================================

-- ── 1. REVOGAR EXECUTE público em funções sensíveis ────────────────────────
-- Por padrão o PostgreSQL concede EXECUTE a PUBLIC em toda função nova.
-- Aqui revogamos de anon e authenticated para que só service_role possa chamar.

-- Funções administrativas (nunca devem ser chamáveis via anon key)
REVOKE EXECUTE ON FUNCTION public.fila_revisao_manual()           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apurar_sorteio_lf()             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.aprovar_depoimento_manual(uuid) FROM PUBLIC, anon, authenticated;

-- Funções chamadas pelo Worker via service_role — não devem ser acessíveis via PostgREST autenticado
REVOKE EXECUTE ON FUNCTION public.registrar_compra_mp(uuid, text, text, numeric, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_cliente_pedido           FROM PUBLIC, anon;

-- Funções que usuários autenticados legitimamente precisam (via service_role no Worker)
-- Mantemos revogado de anon (não autenticado), mas avaliamos authenticated caso a caso:
REVOKE EXECUTE ON FUNCTION public.consultar_participacao          FROM anon;
REVOKE EXECUTE ON FUNCTION public.submit_depoimento               FROM anon;
REVOKE EXECUTE ON FUNCTION public.creditar_questionario           FROM anon;

-- ── 2. CORRIGIR SEARCH PATH nas funções (previne search path injection) ────
-- ALTER FUNCTION ... SET search_path = '' é a forma segura e não destrói o corpo da função.

ALTER FUNCTION public.registrar_compra_mp(uuid, text, text, numeric, text, jsonb) SET search_path = '';
ALTER FUNCTION public.upsert_cliente_pedido     SET search_path = '';
ALTER FUNCTION public.consultar_participacao    SET search_path = '';
ALTER FUNCTION public.submit_depoimento         SET search_path = '';
ALTER FUNCTION public.aprovar_depoimento_manual SET search_path = '';
ALTER FUNCTION public.creditar_questionario     SET search_path = '';
ALTER FUNCTION public.apurar_sorteio_lf         SET search_path = '';
ALTER FUNCTION public.fila_revisao_manual       SET search_path = '';

-- ── 3. CORRIGIR VIEW SECURITY DEFINER ─────────────────────────────────────
-- A view biblioteca_usuario_status foi criada com SECURITY DEFINER,
-- o que bypassa RLS. Recriá-la com security_invoker=true garante que
-- ela execute com os privilégios de QUEM a chama, respeitando RLS.
-- Nota: requer PostgreSQL 15+ (disponível no Supabase atual).

DO $$
DECLARE
  v_def text;
BEGIN
  -- Captura a definição atual da view
  SELECT pg_get_viewdef('public.biblioteca_usuario_status'::regclass, true)
  INTO v_def;

  IF v_def IS NULL THEN
    RAISE NOTICE 'View biblioteca_usuario_status não encontrada — pulando.';
    RETURN;
  END IF;

  -- Recria com security_invoker (sem SECURITY DEFINER)
  EXECUTE 'CREATE OR REPLACE VIEW public.biblioteca_usuario_status
    WITH (security_invoker = true)
    AS ' || v_def;

  RAISE NOTICE 'View biblioteca_usuario_status recriada com security_invoker=true';
END;
$$;

-- ── 4. VERIFICAÇÃO após as correções ──────────────────────────────────────
-- Rode estas queries para confirmar que as permissões foram aplicadas:

-- 4a. Funções com EXECUTE ainda para anon/public (deve retornar 0 linhas para as funções acima)
SELECT routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE grantee IN ('PUBLIC','anon','authenticated')
  AND routine_name IN (
    'registrar_compra_mp','fila_revisao_manual','apurar_sorteio_lf',
    'aprovar_depoimento_manual','upsert_cliente_pedido'
  );

-- 4b. Confirmar search_path nas funções (deve mostrar '' para todas)
SELECT proname, proconfig
FROM pg_proc
WHERE proname IN (
  'registrar_compra_mp','upsert_cliente_pedido','consultar_participacao',
  'submit_depoimento','aprovar_depoimento_manual','creditar_questionario',
  'apurar_sorteio_lf','fila_revisao_manual'
)
ORDER BY proname;
