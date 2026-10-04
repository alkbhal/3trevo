-- ============================================================
-- NAO EXECUTAR COMO ESTA — ver correcao abaixo (2026-09-30).
--
-- Premissa original deste script estava errada: o app do Amigo Entregador
-- roda no celular do usuario e chama estas 32 funcoes ae_* direto do
-- cliente com a chave publica (anon) do Supabase — mesma coisa que toda
-- app mobile/web faz, a chave anon nao e secreta, e embutida no build.
-- Confirmado em producao: ~125 chamadas/24h de Android reais.
--
-- Rodar o REVOKE abaixo tira o EXECUTE do papel anon e derruba o app na
-- hora (listar vendas, salvar lote, registrar movimento, catalogo — tudo
-- passa a dar erro de permissao).
--
-- A protecao real ja existe hoje: 31 das 32 funcoes conferem um token por
-- dentro via ae_checar_token (que ja esta corretamente restrito a
-- service_role — ninguem chama o checker direto). A excecao intencional e
-- ae_catalogo_publico_listar, que nao pede token porque e o catalogo
-- publico. O Security Advisor aponta essas 32 funcoes como
-- SECURITY DEFINER executavel por anon — aceito como parte do desenho
-- atual, nao como vulnerabilidade a corrigir com REVOKE.
--
-- Correcao real (Fase 2, quando a migracao pro Cloudflare avancar):
-- colocar uma Edge Function / Cloudflare Worker entre o app e o banco,
-- que passa a chamar estas funcoes com service_role. So entao revogar
-- anon faz sentido — e so entao este script (ou equivalente) deve rodar.
--
-- Ganho marginal disponivel ja agora, sem risco (app nao usa login):
-- revogar so de `authenticated` (nunca usado por este modulo). Efeito
-- pratico é baixo; documentado aqui caso o usuario queira aplicar so essa
-- parte — nao inclui `anon` no REVOKE abaixo por causa disso.
-- ============================================================

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'ae\_%' ESCAPE '\'
      AND p.proname <> 'ae_catalogo_publico_listar'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, authenticated', r.sig);
    -- anon NAO revogado — ver aviso acima.
  END LOOP;
END $$;
