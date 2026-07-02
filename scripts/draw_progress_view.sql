-- QW5: view draw_progress para o endpoint /api/admin/draw/progress
-- Executar manualmente no Supabase SQL Editor (B5: MCP OAuth quebrado)

ALTER TABLE draws
  ADD COLUMN IF NOT EXISTS data_limite date;

CREATE OR REPLACE VIEW draw_progress AS
SELECT
  d.id            AS draw_id,
  d.titulo,
  d.status,
  d.max_numeros   AS meta_cotas,
  d.data_limite,
  COUNT(dn.numero)                                         AS cotas_vendidas,
  ROUND(COUNT(dn.numero)::numeric / NULLIF(d.max_numeros,0)*100,1) AS pct,
  d.max_numeros - COUNT(dn.numero)                         AS cotas_restantes
FROM draws d
LEFT JOIN draw_numbers dn ON dn.draw_id = d.id
GROUP BY d.id, d.titulo, d.status, d.max_numeros, d.data_limite;

-- Checklist:
-- [ ] SELECT * FROM draw_progress LIMIT 1;
