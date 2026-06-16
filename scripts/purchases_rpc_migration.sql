-- ============================================================
-- Migration: registrar_compra_mp
-- Registra compra via Mercado Pago: payment + purchase +
-- user_library + download token (72h)
-- Draw_entries e distribuição de números ficam no Worker.
-- Executar no SQL Editor do Supabase.
-- ============================================================

CREATE OR REPLACE FUNCTION registrar_compra_mp(
  p_user_id      uuid,
  p_mp_payment_id text,
  p_product_slug  text,
  p_valor        numeric,
  p_metodo       text,
  p_raw_mp       jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_product_id   uuid;
  v_product_titulo text;
  v_product_cotas  int;
  v_payment_id   uuid;
  v_purchase_id  uuid;
  v_dl_token     uuid;
  v_novo         boolean := false;
BEGIN
  -- Buscar produto por slug
  SELECT id, titulo, cotas
  INTO v_product_id, v_product_titulo, v_product_cotas
  FROM products
  WHERE slug = p_product_slug AND ativo = true;

  IF v_product_id IS NULL THEN
    RETURN json_build_object('ok', false, 'erro', 'produto_nao_encontrado: ' || p_product_slug);
  END IF;

  -- Idempotência: verificar se mp_payment_id já foi processado
  SELECT id INTO v_payment_id
  FROM payments
  WHERE mp_payment_id = p_mp_payment_id;

  IF v_payment_id IS NOT NULL THEN
    -- Já processado — retornar purchase existente
    SELECT p.id INTO v_purchase_id
    FROM purchases p
    WHERE p.payment_id = v_payment_id;

    SELECT token INTO v_dl_token
    FROM downloads
    WHERE user_id = p_user_id AND product_id = v_product_id
    ORDER BY criado_em DESC LIMIT 1;

    RETURN json_build_object(
      'ok',            true,
      'purchase_id',   v_purchase_id,
      'download_token', v_dl_token,
      'ebook_titulo',  v_product_titulo,
      'cotas_base',    v_product_cotas,
      'novo',          false
    );
  END IF;

  -- Criar payment
  INSERT INTO payments (
    user_id, product_id, mp_payment_id,
    metodo, status, valor, email_pagador, raw_mp
  )
  VALUES (
    p_user_id, v_product_id, p_mp_payment_id,
    p_metodo, 'approved', p_valor, NULL, p_raw_mp
  )
  RETURNING id INTO v_payment_id;

  -- Criar purchase
  INSERT INTO purchases (
    user_id, product_id, payment_id,
    valor_pago, cotas, status
  )
  VALUES (
    p_user_id, v_product_id, v_payment_id,
    p_valor, v_product_cotas, 'active'
  )
  RETURNING id INTO v_purchase_id;

  -- Liberar na user_library (acesso permanente)
  INSERT INTO user_library (user_id, product_id, origem, origem_id)
  VALUES (p_user_id, v_product_id, 'purchase', v_purchase_id)
  ON CONFLICT (user_id, product_id) DO NOTHING;

  -- Criar token de download (UUID, 72h)
  INSERT INTO downloads (
    user_id, product_id,
    expira_em
  )
  VALUES (
    p_user_id, v_product_id,
    now() + interval '72 hours'
  )
  RETURNING token INTO v_dl_token;

  v_novo := true;

  RETURN json_build_object(
    'ok',            true,
    'payment_id',    v_payment_id,
    'purchase_id',   v_purchase_id,
    'download_token', v_dl_token,
    'ebook_titulo',  v_product_titulo,
    'cotas_base',    v_product_cotas,
    'novo',          true
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('ok', false, 'erro', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION registrar_compra_mp TO service_role;
