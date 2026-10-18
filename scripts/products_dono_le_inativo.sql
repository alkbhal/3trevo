-- products_dono_le_inativo.sql — 18/out/2026
-- Achado: a área do cliente mostrava 3 itens como "Ebook", sem título nem autor.
-- Causa: os 3 volumes de "Caminho Rubro" estão com ativo = false, e a única policy de
-- leitura de products é "products: public read" (ativo = true). O join
-- user_library -> products voltava NULL para quem já tinha comprado esses títulos.
-- Correção aditiva (não altera nem remove a policy existente): quem tem o produto na
-- própria biblioteca continua lendo a ficha dele, mesmo depois de despublicado.
-- Compatível com a versão atual e a nova do site (pode ser aplicada antes da troca).

create policy "products: dono le o que comprou"
  on public.products
  for select
  to authenticated
  using (
    exists (
      select 1 from public.user_library ul
      where ul.product_id = products.id
        and ul.user_id = auth.uid()
    )
  );

-- Reverter: drop policy "products: dono le o que comprou" on public.products;
