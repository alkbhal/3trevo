-- Nema v1 — fundação do Regulamento Geral (etapa 7 da linha de produção, decisão do dono de 26/10/2026).
-- Adesão uma vez por versão do regulamento, histórico consultável, liga/desliga do uso do saldo.
--
-- Entra DESLIGADA: exige_aceite = 0 e nenhuma versão publicada. Enquanto for assim, o sistema
-- se comporta exatamente como antes. Ligar (etapa 9, depois da tela de aceite e do texto revisado
-- pelo jurídico): publicar a versão em nema_regulamentos e pôr exige_aceite = 1.
--
-- Regras do dono aplicadas aqui:
--  - consultar saldo e histórico nunca exige aceite (nema_saldo e nema_extrato não checam);
--  - usar o saldo exige o aceite da versão vigente (nema_reservar);
--  - o crédito de uma compra é sempre registrado: quem ainda não aceitou não perde nada, só não usa
--    até aceitar (nenhum confisco, nada retroativo);
--  - toda mudança de parâmetro fica registrada (nema_parametros_historico).
-- Migração aditiva: só cria tabelas/funções e troca nema_reservar por uma versão que, com os
-- parâmetros padrão, devolve o mesmo resultado de antes.

insert into public.nema_parametros (chave, valor, descricao) values
  ('exige_aceite',  0, '1 = usar o saldo exige o aceite da versão vigente do Regulamento Geral; 0 = ainda não exige'),
  ('resgate_ativo', 1, '1 = abatimento com Nema no checkout ligado; 0 = desligado (emergência)')
on conflict (chave) do nothing;

-- Trilha de auditoria dos parâmetros.
create table if not exists public.nema_parametros_historico (
  id bigint generated always as identity primary key,
  chave text not null,
  valor_antes numeric,
  valor_depois numeric,
  alterado_em timestamptz not null default now(),
  alterado_por text not null default current_user
);
alter table public.nema_parametros_historico enable row level security;

create or replace function public.nema_parametros_registrar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.nema_parametros_historico (chave, valor_antes, valor_depois)
  values (coalesce(new.chave, old.chave),
          case when tg_op = 'INSERT' then null else old.valor end,
          case when tg_op = 'DELETE' then null else new.valor end);
  return coalesce(new, old);
end $$;
drop trigger if exists nema_parametros_auditoria on public.nema_parametros;
create trigger nema_parametros_auditoria after insert or update or delete on public.nema_parametros
  for each row execute function public.nema_parametros_registrar();

-- Versões do Regulamento Geral. Publicada + vigente_desde <= agora = versão vigente.
create table if not exists public.nema_regulamentos (
  versao int primary key check (versao > 0),
  titulo text not null,
  url text not null,
  hash_sha256 text check (hash_sha256 is null or hash_sha256 ~ '^[0-9a-f]{64}$'),
  vigente_desde timestamptz not null,
  publicado boolean not null default false,
  criado_em timestamptz not null default now()
);
alter table public.nema_regulamentos enable row level security;
drop policy if exists nema_regulamentos_leitura on public.nema_regulamentos;
create policy nema_regulamentos_leitura on public.nema_regulamentos for select to anon, authenticated using (publicado);

-- Aceites: um por leitor e versão, com data e hora e origem. Só acrescenta.
create table if not exists public.nema_aceites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  versao int not null references public.nema_regulamentos(versao),
  aceito_em timestamptz not null default now(),
  origem text not null check (origem in ('area_cliente', 'checkout')),
  unique (user_id, versao)
);
alter table public.nema_aceites enable row level security;
drop policy if exists nema_aceites_le_o_proprio on public.nema_aceites;
create policy nema_aceites_le_o_proprio on public.nema_aceites for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.nema_versao_vigente() returns int
language sql stable security definer set search_path = '' as $$
  select max(versao) from public.nema_regulamentos where publicado and vigente_desde <= now()
$$;

-- true quando não há versão vigente (nada a aceitar) ou quando o leitor aceitou a vigente.
create or replace function public.nema_aceite_ok(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when public.nema_versao_vigente() is null then true
    else exists (select 1 from public.nema_aceites a where a.user_id = p_user and a.versao = public.nema_versao_vigente())
  end
$$;

-- Registra o aceite da versão vigente. Repetir não duplica (idempotente).
create or replace function public.nema_aceitar(p_user uuid, p_versao int, p_origem text)
returns json language plpgsql security definer set search_path = '' as $$
declare v_vig int := public.nema_versao_vigente();
begin
  if p_user is null then return json_build_object('ok', false, 'erro', 'login_necessario'); end if;
  if v_vig is null or p_versao is distinct from v_vig then
    return json_build_object('ok', false, 'erro', 'versao_nao_vigente', 'vigente', v_vig);
  end if;
  insert into public.nema_aceites (user_id, versao, origem) values (p_user, p_versao, p_origem)
  on conflict (user_id, versao) do nothing;
  return json_build_object('ok', true, 'versao', v_vig);
end $$;

-- Histórico (extrato) do leitor, o mais novo primeiro. Consulta livre, sem exigir aceite.
create or replace function public.nema_extrato(p_user uuid, p_limite int default 100)
returns table (criado_em timestamptz, tipo text, quantidade numeric, status text, disponivel_em timestamptz, purchase_id uuid)
language sql stable security definer set search_path = '' as $$
  select m.criado_em, m.tipo, m.quantidade, m.status, m.disponivel_em, m.purchase_id
  from public.nema_movimentos m
  where m.user_id = p_user
  order by m.criado_em desc
  limit least(greatest(coalesce(p_limite, 100), 1), 500)
$$;

-- Reserva no checkout: igual à fase 0, mais o liga/desliga e a exigência de aceite.
-- Sem saldo liberado, devolve quantidade 0 com o motivo: a compra segue, só sem o abatimento.
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
  if coalesce(public.nema_param('resgate_ativo'), 1) = 0 then
    return json_build_object('ok', true, 'quantidade', 0, 'desconto', 0, 'motivo', 'desligado');
  end if;
  if coalesce(public.nema_param('exige_aceite'), 0) = 1 and not public.nema_aceite_ok(p_user) then
    return json_build_object('ok', true, 'quantidade', 0, 'desconto', 0, 'motivo', 'precisa_aceite');
  end if;
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

-- Só o worker (service role) chama as funções.
revoke all on function public.nema_versao_vigente(), public.nema_aceite_ok(uuid), public.nema_aceitar(uuid, int, text),
  public.nema_extrato(uuid, int), public.nema_reservar(uuid, numeric), public.nema_parametros_registrar()
  from public, anon, authenticated;
grant execute on function public.nema_versao_vigente(), public.nema_aceite_ok(uuid), public.nema_aceitar(uuid, int, text),
  public.nema_extrato(uuid, int), public.nema_reservar(uuid, numeric)
  to service_role;

-- Reversão (volta à fase 0; os aceites registrados se perdem):
-- drop function if exists public.nema_aceitar(uuid, int, text), public.nema_extrato(uuid, int),
--   public.nema_aceite_ok(uuid), public.nema_versao_vigente();
-- drop table if exists public.nema_aceites, public.nema_regulamentos;
-- drop trigger if exists nema_parametros_auditoria on public.nema_parametros;
-- drop function if exists public.nema_parametros_registrar();
-- drop table if exists public.nema_parametros_historico;
-- delete from public.nema_parametros where chave in ('exige_aceite', 'resgate_ativo');
-- e recriar public.nema_reservar como em supabase/nema.sql.
