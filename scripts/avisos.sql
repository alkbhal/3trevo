-- avisos.sql — 19/out/2026
-- Avisos para o dono e contato automático com leitores (função supabase/functions/avisos).
--   1. venda      → e-mail na hora, por gatilho em purchases (nunca bloqueia a compra)
--   2. diario     → resumo às 8h de Brasília (11h UTC) + e-mails aos leitores (item 4)
--   3. verificar  → de hora em hora: pagamento aprovado sem livro liberado e erros do Worker
--   5. mensal     → dia 1º: extrato do mês anterior (CSV) conferido com o Mercado Pago
-- Destinatário e chave ficam em avisos_config (RLS sem policies: só o service_role lê).
-- Aditivo. Reverter: ver o fim do arquivo.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create table if not exists public.avisos_config (
  unico        boolean primary key default true check (unico),
  destinatario text not null,
  chave        text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  url_funcao   text not null
);
alter table public.avisos_config enable row level security;
-- Troque DESTINATARIO@EXEMPLO pelo e-mail do dono ao aplicar (não fica no repositório).
insert into public.avisos_config (destinatario, url_funcao)
values ('DESTINATARIO@EXEMPLO', 'https://xfkepekffdyrtcgagwqo.supabase.co/functions/v1/avisos')
on conflict (unico) do update set destinatario = excluded.destinatario, url_funcao = excluded.url_funcao;

-- O que já foi avisado/enviado (evita repetir alerta ou e-mail a leitor).
create table if not exists public.avisos_enviados (
  chave      text primary key,
  tipo       text not null,
  user_id    uuid,
  enviado_em timestamptz not null default now()
);
alter table public.avisos_enviados enable row level security;

-- Chama a função avisos (assíncrono, via pg_net).
create or replace function public.avisos_chamar(p_corpo jsonb) returns bigint
  language plpgsql security definer set search_path = public, extensions as $$
declare c public.avisos_config; req bigint;
begin
  select * into c from public.avisos_config limit 1;
  if c.unico is null then return null; end if;
  select net.http_post(
    url := c.url_funcao, body := p_corpo,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-avisos-chave', c.chave),
    timeout_milliseconds := 20000) into req;
  return req;
end $$;

-- 1. Aviso de venda: dispara a cada compra registrada. Falha do aviso não afeta a compra.
create or replace function public.avisos_venda_gatilho() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public.avisos_chamar(jsonb_build_object('acao', 'venda', 'purchase_id', new.id));
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists avisos_venda on public.purchases;
create trigger avisos_venda after insert on public.purchases
  for each row execute function public.avisos_venda_gatilho();

-- Dados para os e-mails (lidos só pelo service_role).
create or replace function public.avisos_dados_venda(p_purchase uuid) returns jsonb
  language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'titulo', coalesce(pr.titulo, 'Produto'), 'valor', pu.valor_pago, 'metodo', pa.metodo,
    'mp_payment_id', pa.mp_payment_id, 'email', u.email, 'nome', u.raw_user_meta_data->>'nome',
    'criado_em', pu.criado_em, 'afiliado', pu.aff_slug)
  from purchases pu
  left join products pr on pr.id = pu.product_id
  left join payments pa on pa.id = pu.payment_id
  left join auth.users u on u.id = pu.user_id
  where pu.id = p_purchase;
$$;

-- 3. Pagamento aprovado há mais de 15 min sem compra registrada (pagou e não recebeu) + erros recentes.
create or replace function public.avisos_pendencias() returns jsonb
  language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select 'pag:' || pa.id as chave, 'pagamento_sem_livro' as tipo, pa.email_pagador as email, pa.valor,
           pa.mp_payment_id, pa.criado_em as quando, null::jsonb as detalhe
    from payments pa
    where pa.status = 'approved' and pa.criado_em > now() - interval '30 days'
      and pa.atualizado_em < now() - interval '15 minutes'
      and not exists (select 1 from purchases pu where pu.payment_id = pa.id)
    union all
    select 'log:' || l.id, l.action_type, null, null, null, l.created_at, l.details
    from audit_log l
    where l.created_at > now() - interval '2 days' and (l.action_type ilike '%erro%' or l.status <> 'ok')
  ) x;
$$;

create or replace function public.avisos_resumo(p_ini timestamptz, p_fim timestamptz) returns jsonb
  language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'vendas', coalesce((select jsonb_agg(jsonb_build_object('titulo', coalesce(pr.titulo, '—'), 'valor', pu.valor_pago,
                 'metodo', pa.metodo, 'email', u.email, 'quando', pu.criado_em) order by pu.criado_em)
               from purchases pu left join products pr on pr.id = pu.product_id
               left join payments pa on pa.id = pu.payment_id left join auth.users u on u.id = pu.user_id
               where pu.criado_em >= p_ini and pu.criado_em < p_fim), '[]'::jsonb),
    'novos_membros', (select count(*) from auth.users where created_at >= p_ini and created_at < p_fim),
    'novos_membros_idioma', coalesce((select jsonb_object_agg(i, n) from (select coalesce(raw_user_meta_data->>'idioma', 'pt') i, count(*) n
               from auth.users where created_at >= p_ini and created_at < p_fim group by 1) x), '{}'::jsonb),
    'membros_total', (select count(*) from auth.users),
    'lendo_agora', (select count(*) from leitura_livre),
    'nao_concluidos', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from payments
               where criado_em >= p_ini and criado_em < p_fim and status <> 'approved' group by 1) x), '{}'::jsonb),
    'erros', coalesce((select jsonb_agg(jsonb_build_object('tipo', action_type, 'quando', created_at, 'detalhe', details))
               from audit_log where created_at >= p_ini and created_at < p_fim
               and (action_type ilike '%erro%' or status <> 'ok')), '[]'::jsonb),
    'pendencias', public.avisos_pendencias()
  );
$$;

-- 4. Leitores a contatar (uma vez cada): boas-vindas, lembrete de leitura parada, pedido de opinião.
--    Lembrete e opinião só para quem autorizou e-mails (mala_direta = true).
create or replace function public.avisos_leitores() returns jsonb
  language sql stable security definer set search_path = public as $$
  with obras as (
    select slug, titulo, autor from biblioteca_acervo where acesso = 'bonus'
    union all select slug, titulo, autor from estante_intl
  ), c as (
    select 'bv:' || u.id as chave, 'boas_vindas' as tipo, u.id as user_id, u.email,
           u.raw_user_meta_data->>'nome' as nome, coalesce(u.raw_user_meta_data->>'idioma', 'pt') as idioma,
           null::text as titulo, null::numeric as progresso
    from auth.users u
    where u.created_at between now() - interval '26 hours' and now() - interval '30 minutes'
      and coalesce(u.email_confirmed_at, u.last_sign_in_at) is not null
      and not exists (select 1 from purchases p where p.user_id = u.id)
    union all
    select 'lb:' || l.user_id || ':' || l.acervo_slug, 'lembrete', l.user_id, u.email,
           u.raw_user_meta_data->>'nome', coalesce(u.raw_user_meta_data->>'idioma', 'pt'), o.titulo, l.progresso
    from leitura_livre l join auth.users u on u.id = l.user_id left join obras o on o.slug = l.acervo_slug
    where l.progresso > 0 and l.progresso < 100 and l.atualizado_em < now() - interval '7 days'
      and coalesce((u.raw_user_meta_data->>'mala_direta')::boolean, false)
    union all
    select 'op:' || l.user_id || ':' || l.acervo_slug, 'opiniao', l.user_id, u.email,
           u.raw_user_meta_data->>'nome', coalesce(u.raw_user_meta_data->>'idioma', 'pt'), o.titulo, l.progresso
    from leitura_livre l join auth.users u on u.id = l.user_id left join obras o on o.slug = l.acervo_slug
    where l.progresso >= 100 and coalesce((u.raw_user_meta_data->>'mala_direta')::boolean, false)
  )
  select coalesce(jsonb_agg(c), '[]'::jsonb) from c
  where c.email is not null and not exists (select 1 from avisos_enviados e where e.chave = c.chave);
$$;

-- 5. Vendas do período para o extrato.
create or replace function public.avisos_mes(p_ini timestamptz, p_fim timestamptz) returns jsonb
  language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('quando', pu.criado_em, 'titulo', coalesce(pr.titulo, '—'),
           'valor', pu.valor_pago, 'metodo', pa.metodo, 'status', pu.status, 'email', u.email,
           'mp_payment_id', pa.mp_payment_id) order by pu.criado_em), '[]'::jsonb)
  from purchases pu left join products pr on pr.id = pu.product_id
  left join payments pa on pa.id = pu.payment_id left join auth.users u on u.id = pu.user_id
  where pu.criado_em >= p_ini and pu.criado_em < p_fim;
$$;

-- Descadastro de e-mails de relacionamento (link no rodapé dos e-mails aos leitores).
create or replace function public.avisos_sair(p_user uuid) returns void
  language sql security definer set search_path = public as $$
  update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"mala_direta": false}'::jsonb
  where id = p_user;
$$;

do $$ declare f text; begin
  foreach f in array array['avisos_chamar(jsonb)', 'avisos_dados_venda(uuid)', 'avisos_resumo(timestamptz,timestamptz)',
    'avisos_pendencias()', 'avisos_leitores()', 'avisos_mes(timestamptz,timestamptz)', 'avisos_sair(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- Agenda (UTC; Brasília = UTC−3, sem horário de verão desde 2019).
select cron.schedule('avisos-diario',    '0 11 * * *', $$select public.avisos_chamar('{"acao":"diario"}'::jsonb)$$);
select cron.schedule('avisos-verificar', '17 * * * *', $$select public.avisos_chamar('{"acao":"verificar"}'::jsonb)$$);
select cron.schedule('avisos-mensal',    '5 11 1 * *', $$select public.avisos_chamar('{"acao":"mensal"}'::jsonb)$$);

-- Reverter:
--   select cron.unschedule('avisos-diario'); select cron.unschedule('avisos-verificar'); select cron.unschedule('avisos-mensal');
--   drop trigger avisos_venda on public.purchases; drop function public.avisos_venda_gatilho();
--   drop table public.avisos_enviados; drop table public.avisos_config (e as funções avisos_*).
