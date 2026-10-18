-- leitura_livre_membros.sql — 18/out/2026
-- Área de membros grátis: cada conta sem compra tem UM espaço de leitura para um clássico
-- em domínio público (biblioteca_acervo, acesso = 'bonus'). Quem compra continua com os
-- 3 espaços da Biblioteca TT (minha-biblioteca.html / worker), que não mudam.
-- A chave primária em user_id é o que garante o limite de 1 por conta.
-- Aditivo: não altera nenhuma tabela existente.

create table if not exists public.leitura_livre (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  acervo_slug   text not null,
  progresso     numeric(5,2) not null default 0 check (progresso between 0 and 100),
  iniciado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.leitura_livre enable row level security;

-- Só obras bônus ativas podem ocupar o espaço.
create or replace function public.leitura_livre_obra_valida(p_slug text) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from biblioteca_acervo a where a.slug = p_slug and a.ativo and a.acesso = 'bonus');
$$;
revoke execute on function public.leitura_livre_obra_valida(text) from public, anon;
grant execute on function public.leitura_livre_obra_valida(text) to authenticated;

create policy "leitura_livre: dono le" on public.leitura_livre
  for select to authenticated using (user_id = auth.uid());
create policy "leitura_livre: dono escolhe" on public.leitura_livre
  for insert to authenticated
  with check (user_id = auth.uid() and public.leitura_livre_obra_valida(acervo_slug));
create policy "leitura_livre: dono atualiza" on public.leitura_livre
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.leitura_livre_obra_valida(acervo_slug));
create policy "leitura_livre: dono libera" on public.leitura_livre
  for delete to authenticated using (user_id = auth.uid());

-- Reverter: drop table public.leitura_livre; drop function public.leitura_livre_obra_valida(text);
