-- ============================================================
-- Fase 1: Remover colunas Loteria Federal de draws e draw_audits
-- Executar no SQL Editor do Supabase (projeto xfkepekffdyrtcgagwqo)
-- Data: 16/06/2026
--
-- CONTEXTO: Sorteio migrado de Concurso Cultural (Lei 5.768/71)
-- para Sorteio puro interno (RNG). Campos LF não têm mais uso.
-- Regularização futura: SPA/Ministério da Fazenda (sorteio puro).
-- ============================================================

-- ── draws: remover campos Loteria Federal ──────────────────────────────────────
ALTER TABLE draws
  DROP COLUMN IF EXISTS lf_concurso,
  DROP COLUMN IF EXISTS lf_data_extracao,
  DROP COLUMN IF EXISTS lf_premios,
  DROP COLUMN IF EXISTS cota_vencedora,
  DROP COLUMN IF EXISTS formula_versao;

-- ── draw_audits: remover campo Loteria Federal ────────────────────────────────
ALTER TABLE draw_audits
  DROP COLUMN IF EXISTS lf_concurso;

-- ── Verificação pós-migração ──────────────────────────────────────────────────
-- Confirmar que as colunas foram removidas:
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'draws'
  AND column_name IN ('lf_concurso', 'lf_data_extracao', 'lf_premios', 'cota_vencedora', 'formula_versao');
-- Resultado esperado: 0 linhas

SELECT column_name
FROM information_schema.columns
WHERE table_name = 'draw_audits'
  AND column_name = 'lf_concurso';
-- Resultado esperado: 0 linhas
