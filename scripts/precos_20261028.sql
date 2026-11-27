-- Preços decididos pelo dono em 28/10/2026 (etapa 2b da linha de produção).
-- catalogo é o que o checkout cobra; products é o que libera a compra depois do pagamento:
-- as duas tabelas têm de ter o mesmo preço. Cotas seguem cotasPorPreco (admin-catalog.ts):
-- até R$ 20 = 1, até R$ 30 = 3, acima = 10.
--
-- Antes (lido no banco em 28/10/2026):
--   antifalencia  catalogo 29.90 (3 cotas) | products 46.04 (3 cotas)
--   3a-guerra     catalogo 35.00 (10)      | products 76.74 (10)

begin;
update public.catalogo set preco = 19.90, cotas = 1 where slug = 'antifalencia';
update public.products set preco = 19.90, cotas = 1 where slug = 'antifalencia';
update public.products set preco = 35.00 where slug = '3a-guerra';
commit;

-- Reversão:
-- begin;
-- update public.catalogo set preco = 29.90, cotas = 3 where slug = 'antifalencia';
-- update public.products set preco = 46.04, cotas = 3 where slug = 'antifalencia';
-- update public.products set preco = 76.74 where slug = '3a-guerra';
-- commit;
