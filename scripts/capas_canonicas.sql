-- Capa canônica: catalogo.capa_url é a única fonte da capa de cada livro.
-- products.capa_url (usada pela área do cliente) passa a ser só um espelho, mantido por gatilho.
-- As páginas de obra leem a capa do catalogo (scripts/capas.mjs grava a mesma URL no HTML e o CI confere).
-- Aplicada em 2026-11-04.

-- Isa e Livre: a capa da edição atual é a do site (as do catalogo eram de edições anteriores)
update catalogo set capa_url = 'https://3trevo.com.br/assets/capas/isa-isma-tintim.jpg' where slug = 'isa-isma-tintim';
update catalogo set capa_url = 'https://3trevo.com.br/assets/capas/livre-das-dividas.jpg' where slug = 'livre-das-dividas';

-- catalogo → products: toda mudança de capa no catalogo vai para products
create or replace function capa_catalogo_para_products() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update products set capa_url = new.capa_url where slug = new.slug and capa_url is distinct from new.capa_url;
  return new;
end $$;
create or replace trigger trg_capa_catalogo_para_products
  after insert or update of capa_url on catalogo
  for each row execute function capa_catalogo_para_products();

-- products: qualquer gravação de capa é substituída pela do catalogo (quando o livro existe lá)
create or replace function capa_products_do_catalogo() returns trigger
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  select capa_url into c from catalogo where slug = new.slug;
  if found then new.capa_url := c; end if;
  return new;
end $$;
create or replace trigger trg_capa_products_do_catalogo
  before insert or update of capa_url, slug on products
  for each row execute function capa_products_do_catalogo();

-- alinhamento inicial
update products p set capa_url = c.capa_url from catalogo c where c.slug = p.slug and p.capa_url is distinct from c.capa_url;
