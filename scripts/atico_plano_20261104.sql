-- Produto do plano completo do Ático (freemium do SFDTT), criado inativo em 04/11/2026.
-- Pagamento pelo checkout do 3trevo. tipo = 'acesso_app': a entrega é o acesso ao app,
-- não um arquivo. O webhook e a função de compra ainda tratam tudo como e-book:
-- ativar o produto só depois do PR que trata 'acesso_app'.
-- Preço igual nas duas tabelas (o checkout cobra do catálogo; a biblioteca libera pelo products).
begin;
insert into catalogo (slug, titulo, autor, genero, genero_pt, descricao, preco, cotas, ativo, motivo_inativo, ordem, bg_color, emoji)
values ('atico-plano', 'Ático — plano completo', 'Editora Três Trevo', 'Finanças pessoais', 'Finanças pessoais',
  'Acesso ao plano completo do Ático: projeção, semáforo por grupo, sugestões e plano de saída. O diagnóstico é grátis.',
  19.90, 1, false, 'Criado inativo: aguarda aprovação de venda e a entrega do acesso ao app', 999, '#0f2d1a', '📊');
insert into products (slug, tipo, titulo, autor, genero, descricao, preco, cotas, ativo, ordem, bg_color)
values ('atico-plano', 'acesso_app', 'Ático — plano completo', 'Editora Três Trevo', 'Finanças pessoais',
  'Acesso ao plano completo do Ático: projeção, semáforo por grupo, sugestões e plano de saída. O diagnóstico é grátis.',
  19.90, 1, false, 999, '#0f2d1a');
commit;

-- Reversão (somente se o produto for descartado):
-- delete from products where slug = 'atico-plano';
-- delete from catalogo where slug = 'atico-plano';
