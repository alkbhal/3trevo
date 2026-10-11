-- Nema (N$) — fase 0: ponto de fidelidade fechado da Editora Três Trevo.
-- Compra de e-book gera Nema; o saldo vale como desconto na recompra.
-- Sem valor em dinheiro, sem transferência entre pessoas, sem sorteio.
-- Migração só aditiva: não altera nenhuma tabela ou função existente.

-- Parâmetros num lugar só (mudar aqui muda a regra inteira).
create table if not exists public.nema_parametros (
  chave text primary key,
  valor numeric not null,
  descricao text not null
);
insert into public.nema_parametros (chave, valor, descricao) values
  ('valor_nema_reais', 0.50, 'Quanto 1 Nema vale de desconto, em reais'),
  ('taxa_digital',     0.10, 'Fração da receita de produto digital que vira Nema (reserva)'),
  ('teto_resgate',     0.50, 'Fração máxima do preço que pode ser paga com Nema'),
  ('dias_carencia',    7,    'Dias até o crédito ficar disponível (prazo de arrependimento do CDC)'),
  ('reserva_minutos',  120,  'Minutos que um resgate fica reservado esperando o pagamento')
on conflict (chave) do nothing;

-- Razão: só acrescenta linhas. Saldo é sempre a soma.
create table if not exists public.nema_movimentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  tipo text not null check (tipo in ('credito_compra','resgate','estorno_credito','devolucao_resgate','ajuste')),
  quantidade numeric(12,2) not null check (quantidade <> 0),
  status text not null default 'confirmado' check (status in ('reservado','confirmado','cancelado')),
  disponivel_em timestamptz not null default now(),
  expira_em timestamptz,
  purchase_id uuid references public.purchases(id),
  reserva_ref uuid,
  mp_payment_id text,
  valor_referencia numeric(12,2),
  criado_em timestamptz not null default now()
);
create unique index if not exists nema_um_credito_por_compra on public.nema_movimentos (purchase_id) where tipo = 'credito_compra';
create unique index if not exists nema_um_estorno_por_compra on public.nema_movimentos (purchase_id) where tipo = 'estorno_credito';
create unique index if not exists nema_uma_devolucao_por_resgate on public.nema_movimentos (reserva_ref) where tipo = 'devolucao_resgate';
create unique index if not exists nema_reserva_unica on public.nema_movimentos (reserva_ref) where tipo = 'resgate';
create index if not exists nema_mov_user on public.nema_movimentos (user_id);

alter table public.nema_movimentos enable row level security;
alter table public.nema_parametros enable row level security;
drop policy if exists nema_le_o_proprio on public.nema_movimentos;
create policy nema_le_o_proprio on public.nema_movimentos for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists nema_parametros_leitura on public.nema_parametros;
create policy nema_parametros_leitura on public.nema_parametros for select to anon, authenticated using (true);

create or replace function public.nema_param(p_chave text) returns numeric
language sql stable security definer set search_path = '' as $$
  select valor from public.nema_parametros where chave = p_chave
$$;

-- Saldo: disponível (pode gastar), pendente (em carência) e reservado (checkout aberto).
create or replace function public.nema_saldo(p_user uuid)
returns table (disponivel numeric, pendente numeric, reservado numeric)
language sql stable security definer set search_path = '' as $$
  select
    coalesce(sum(m.quantidade) filter (where
      (m.status = 'confirmado' and (m.quantidade < 0 or m.disponivel_em <= now()))
      or (m.status = 'reservado' and m.expira_em > now())), 0)::numeric(12,2),
    coalesce(sum(m.quantidade) filter (where m.status = 'confirmado' and m.quantidade > 0 and m.disponivel_em > now()), 0)::numeric(12,2),
    coalesce(-sum(m.quantidade) filter (where m.status = 'reservado' and m.expira_em > now()), 0)::numeric(12,2)
  from public.nema_movimentos m
  where m.user_id = p_user
$$;

-- Crédito de compra: 10% do valor pago, convertido a R$ 0,50 por Nema, disponível após a carência.
create or replace function public.nema_creditar_compra(p_user uuid, p_purchase uuid, p_valor_pago numeric)
returns json language plpgsql security definer set search_path = '' as $$
declare v_qtd numeric(12,2);
begin
  v_qtd := round(p_valor_pago * public.nema_param('taxa_digital') / public.nema_param('valor_nema_reais'), 2);
  if p_user is null or p_purchase is null or v_qtd <= 0 then
    return json_build_object('ok', true, 'quantidade', 0);
  end if;
  insert into public.nema_movimentos (user_id, tipo, quantidade, disponivel_em, purchase_id, valor_referencia)
  values (p_user, 'credito_compra', v_qtd, now() + make_interval(days => public.nema_param('dias_carencia')::int), p_purchase, p_valor_pago)
  on conflict do nothing;
  return json_build_object('ok', true, 'quantidade', v_qtd);
end $$;

-- Reserva no checkout: trava por usuário para não gastar o mesmo saldo duas vezes.
create or replace function public.nema_reservar(p_user uuid, p_preco numeric)
returns json language plpgsql security definer set search_path = '' as $$
declare
  v_disp numeric(12,2);
  v_valor numeric := public.nema_param('valor_nema_reais');
  v_teto_reais numeric;
  v_qtd numeric(12,2);
  v_ref uuid := gen_random_uuid();
begin
  perform pg_advisory_xact_lock(hashtext('nema:' || p_user::text));
  select disponivel into v_disp from public.nema_saldo(p_user);
  -- Teto: metade do preço, e o Mercado Pago exige cobrar pelo menos R$ 1,00.
  v_teto_reais := least(p_preco * public.nema_param('teto_resgate'), p_preco - 1);
  v_qtd := least(v_disp, floor(v_teto_reais / v_valor * 100) / 100);
  if v_qtd is null or v_qtd <= 0 then
    return json_build_object('ok', true, 'quantidade', 0, 'desconto', 0);
  end if;
  insert into public.nema_movimentos (user_id, tipo, quantidade, status, expira_em, reserva_ref, valor_referencia)
  values (p_user, 'resgate', -v_qtd, 'reservado', now() + make_interval(mins => public.nema_param('reserva_minutos')::int), v_ref, round(v_qtd * v_valor, 2));
  return json_build_object('ok', true, 'quantidade', v_qtd, 'desconto', round(v_qtd * v_valor, 2), 'reserva_ref', v_ref);
end $$;

create or replace function public.nema_cancelar_reserva(p_ref uuid)
returns void language sql security definer set search_path = '' as $$
  update public.nema_movimentos set status = 'cancelado' where reserva_ref = p_ref and tipo = 'resgate' and status = 'reservado'
$$;

-- Pagamento aprovado: a reserva vira gasto definitivo (mesmo se o prazo da reserva tiver passado).
create or replace function public.nema_confirmar_resgate(p_ref uuid, p_mp_payment text, p_purchase uuid)
returns json language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  update public.nema_movimentos
     set status = 'confirmado', mp_payment_id = p_mp_payment, purchase_id = coalesce(purchase_id, p_purchase)
   where reserva_ref = p_ref and tipo = 'resgate' and status in ('reservado','cancelado');
  get diagnostics v_n = row_count;
  return json_build_object('ok', true, 'confirmados', v_n);
end $$;

-- Reembolso (CDC art. 49): tira o Nema que a compra gerou e devolve o Nema que foi usado nela.
create or replace function public.nema_estornar_compra(p_purchase uuid)
returns json language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select * from public.nema_movimentos where purchase_id = p_purchase and tipo = 'credito_compra' and status = 'confirmado' loop
    insert into public.nema_movimentos (user_id, tipo, quantidade, purchase_id, valor_referencia)
    values (r.user_id, 'estorno_credito', -r.quantidade, p_purchase, r.valor_referencia) on conflict do nothing;
  end loop;
  for r in select * from public.nema_movimentos where purchase_id = p_purchase and tipo = 'resgate' and status = 'confirmado' loop
    insert into public.nema_movimentos (user_id, tipo, quantidade, reserva_ref, valor_referencia)
    values (r.user_id, 'devolucao_resgate', -r.quantidade, r.reserva_ref, r.valor_referencia) on conflict do nothing;
  end loop;
  return json_build_object('ok', true);
end $$;

-- Quanto a editora deve em desconto (para separar a reserva em reais).
create or replace view public.nema_reserva_devida with (security_invoker = true) as
  select coalesce(sum(quantidade) filter (where status = 'confirmado'), 0)::numeric(12,2) as nema_em_circulacao,
         round(coalesce(sum(quantidade) filter (where status = 'confirmado'), 0) * public.nema_param('valor_nema_reais'), 2) as reserva_devida_reais
  from public.nema_movimentos;

-- Só o worker (service role) movimenta Nema.
revoke all on function public.nema_saldo(uuid), public.nema_creditar_compra(uuid, uuid, numeric), public.nema_reservar(uuid, numeric),
  public.nema_cancelar_reserva(uuid), public.nema_confirmar_resgate(uuid, text, uuid), public.nema_estornar_compra(uuid), public.nema_param(text)
  from public, anon, authenticated;
revoke all on public.nema_reserva_devida from anon, authenticated;
grant execute on function public.nema_saldo(uuid), public.nema_creditar_compra(uuid, uuid, numeric), public.nema_reservar(uuid, numeric),
  public.nema_cancelar_reserva(uuid), public.nema_confirmar_resgate(uuid, text, uuid), public.nema_estornar_compra(uuid), public.nema_param(text)
  to service_role;
grant select on public.nema_reserva_devida to service_role;
