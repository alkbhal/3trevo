-- ============================================================
-- Migration: registrar_resultado_sorteio
-- Fecha o draw + grava auditoria + registra vencedor, atomicamente.
-- Chamada por worker/src/routes/sorteio.ts::handleSorteio
-- Executar no SQL Editor do Supabase (uma vez)
-- ============================================================

CREATE OR REPLACE FUNCTION public.registrar_resultado_sorteio(
  p_draw_id         uuid,
  p_seed            text,
  p_algoritmo       text,
  p_numero_sorteado int,
  p_user_id         uuid,
  p_cartela         jsonb,
  p_participantes   jsonb,
  p_resultado       jsonb,
  p_hash_sha256     text,
  p_executado_em    timestamptz,
  p_premio          text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cotas_total int;
BEGIN
  -- Fecha o draw atomicamente — só avança se ainda estiver 'open'.
  -- Se outra chamada concorrente já fechou, NOT FOUND dispara o erro abaixo.
  UPDATE public.draws
  SET status = 'drawn', numero_sorteado = p_numero_sorteado
  WHERE id = p_draw_id AND status = 'open';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'draw_nao_encontrado_ou_ja_fechado';
  END IF;

  -- Auditoria imutável (draw_id é UNIQUE em draw_audits — 1 sorteio por draw)
  INSERT INTO public.draw_audits (
    draw_id, seed, algoritmo, numero_sorteado,
    cartela, participantes, resultado, hash_sha256, executado_em
  ) VALUES (
    p_draw_id, p_seed, p_algoritmo, p_numero_sorteado,
    p_cartela, p_participantes, p_resultado, p_hash_sha256, p_executado_em
  );

  -- Total de cotas do vencedor, extraído do snapshot de participantes
  SELECT (elem->>'total_numeros')::int INTO v_cotas_total
  FROM jsonb_array_elements(p_participantes) elem
  WHERE elem->>'user_id' = p_user_id::text;

  INSERT INTO public.draw_winners (
    draw_id, user_id, posicao, cotas_total, premio
  ) VALUES (
    p_draw_id, p_user_id, 1, COALESCE(v_cotas_total, 0), p_premio
  );
END;
$$;

-- Admin-only: chamada exclusivamente pelo Worker via service_role
REVOKE EXECUTE ON FUNCTION public.registrar_resultado_sorteio FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_resultado_sorteio TO service_role;
