-- ============================================================
-- Migration: revoga_execute_anon_funcoes_amigo_entregador
-- Revoga EXECUTE de anon/authenticated nas 32 funcoes SECURITY DEFINER
-- do modulo Amigo Entregador (vendas, capital, estoque, notas fiscais,
-- sorteio) — hoje chamaveis sem login nenhum via /rest/v1/rpc/ae_*,
-- protegidas so por 1 token estatico em amigo_entregador.app_config
-- comparado sem rate limit (ae_checar_token). RLS nas tabelas dessas
-- funcoes esta habilitado sem nenhuma policy (nega tudo por padrao),
-- entao essas 32 funcoes eram o unico portao de acesso publico.
--
-- Mesmo padrao ja aplicado em ae_checar_token e nas funcoes do lado
-- 3trevo (migration remota 20260929212926_revoga_execute_anon_funcoes_
-- servidor_3trevo, tambem nao espelhada em scripts/ ate esta correcao).
--
-- Pre-requisito confirmado com o usuario em 2026-09-29: nenhum cliente
-- ativo depende de acesso anonimo a este modulo (app ainda migrando
-- pro Cloudflare). Apos rodar, so service_role pode chamar essas RPCs
-- — ou seja, so um backend com a service key, nunca o app direto com
-- a anon key.
--
-- Executar no SQL Editor do Supabase (projeto xfkepekffdyrtcgagwqo).
-- ============================================================

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'ae\_%' ESCAPE '\'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;
