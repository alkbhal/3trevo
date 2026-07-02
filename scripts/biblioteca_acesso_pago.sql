-- Biblioteca TT: gate por compra para títulos pagos
-- Executar manualmente no Supabase SQL Editor (B5: MCP OAuth quebrado)
--
-- Contexto: biblioteca_acervo tinha 5 clássicos (bônus, qualquer comprador)
-- + 11 títulos próprios pagos desativados (ativo=false, correção anterior
-- desta sessão). Este script reativa os 11, mas agora com acesso='compra':
-- só quem comprou aquele product_id específico pode ler (checado em
-- worker/src/routes/biblioteca.ts::temAcessoProduto).

ALTER TABLE biblioteca_acervo
  ADD COLUMN IF NOT EXISTS acesso text NOT NULL DEFAULT 'bonus' CHECK (acesso IN ('bonus','compra')),
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES products(id);

UPDATE biblioteca_acervo a
SET acesso = 'compra',
    product_id = p.id,
    ativo = true
FROM products p
WHERE p.slug = a.slug
  AND a.slug IN (
    'ultima-coisa','antes-do-app','caminho-rubro-vol1','caminho-rubro-vol2',
    'caminho-rubro-vol3','habitaculos','isa-isma-tintim','justicamento',
    'livre-das-dividas','antifalencia','3a-guerra'
  );

-- Checklist:
-- [ ] SELECT slug, acesso, product_id, ativo FROM biblioteca_acervo ORDER BY acesso, slug;
--     → 5 linhas acesso='bonus' product_id=NULL, 11 linhas acesso='compra' com product_id preenchido, todas ativo=true
