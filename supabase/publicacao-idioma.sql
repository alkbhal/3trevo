-- Publicação por idioma (spec docs/specs/publicacao-por-idioma-v2.md).
-- Migração só aditiva: nenhum produto existente muda (D4 — o acervo atual fica na
-- biblioteca pt-BR pelo DEFAULT). Rodar no SQL Editor ANTES de publicar o worker
-- que lê catalogo.idioma.

-- ── Idioma e origem no catálogo e em products ──────────────────────────────
alter table public.catalogo add column if not exists idioma text not null default 'pt-BR';
alter table public.catalogo add column if not exists forge_project_id uuid unique;
alter table public.products add column if not exists idioma text not null default 'pt-BR';
alter table public.products add column if not exists forge_project_id uuid unique;
do $$ begin
  alter table public.catalogo add constraint catalogo_idioma_loja check (idioma in ('pt-BR','en-US','es-ES'));
exception when duplicate_object then null; end $$;
create index if not exists catalogo_idioma_ativo on public.catalogo (idioma, ativo);

-- ── Proposta: estado atual de cada livro do forge ──────────────────────────
-- Uma linha por projeto do forge (reenvio não duplica — N5). Mudar estado é
-- PATCH condicional no worker; o histórico fica em publicacao_registros.
create table if not exists public.publicacao_propostas (
  forge_project_id  uuid primary key,
  parent_project_id uuid,
  idioma        text not null,
  slug          text not null unique,
  titulo        text not null,
  descricao     text not null default '',
  arquivo_ref   text not null check (arquivo_ref ~ '^forge:[0-9a-f-]{36}/(epub|pdf|html)$'),
  estado        text not null check (estado in ('rascunho','pronto_para_aprovacao','publicado','recusado','despublicado')),
  motivos       jsonb not null default '[]',
  preco         numeric(10,2),
  precificacao  jsonb,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  -- N1: nada pronto ou publicado sem preço do motor.
  constraint proposta_com_preco check (estado not in ('pronto_para_aprovacao','publicado') or preco is not null)
);
create index if not exists publicacao_propostas_estado on public.publicacao_propostas (estado);

-- ── Registro de decisões: só acréscimo (R7, N8) ────────────────────────────
create table if not exists public.publicacao_registros (
  id                  bigint generated always as identity primary key,
  forge_project_id    uuid not null,
  evento              text not null check (evento in ('proposta','rascunho','reenvio_ignorado','aprovacao','publicacao','recusa','despublicacao','aviso_reavaliacao')),
  estado              text,
  preco               numeric(10,2),
  comparaveis         jsonb not null default '[]',
  cotacoes            jsonb not null default '{}',
  componentes_liquido jsonb,
  estimados           jsonb not null default '[]',
  versao_politica     text not null,
  versao_guardiao     text not null,
  decidido_por        text not null,
  motivo              text,
  criado_em           timestamptz not null default now()
);
create index if not exists publicacao_registros_projeto on public.publicacao_registros (forge_project_id, criado_em);
create index if not exists publicacao_registros_evento on public.publicacao_registros (evento);

create or replace function public.publicacao_registros_imutavel() returns trigger
language plpgsql as $$
begin
  raise exception 'publicacao_registros é só acréscimo: mudança vira registro novo';
end $$;
drop trigger if exists publicacao_registros_sem_update on public.publicacao_registros;
create trigger publicacao_registros_sem_update before update or delete on public.publicacao_registros
  for each row execute function public.publicacao_registros_imutavel();

-- ── PTAX gravada à parte (D1) ──────────────────────────────────────────────
create table if not exists public.cotacoes_ptax (
  moeda     text not null check (moeda ~ '^[A-Z]{3}$'),
  data      date not null,
  taxa      numeric(12,6) not null check (taxa > 0),
  fonte     text not null,
  gravada_em timestamptz not null default now(),
  primary key (moeda, data)
);

-- ── Insumos de preço do dono (§9) ──────────────────────────────────────────
-- valor null = não informado: o motor diz o que falta e o livro fica em rascunho.
-- Nada aqui é inventado: o que não foi medido começa vazio ou marcado como estimado.
create table if not exists public.precificacao_parametros (
  chave         text primary key,
  valor         numeric,
  estado        text not null check (estado in ('medido','estimado','nao_informado')),
  fonte         text,
  descricao     text not null,
  atualizado_em timestamptz not null default now()
);
insert into public.precificacao_parametros (chave, valor, estado, fonte, descricao) values
  ('variavel_por_exemplar', null, 'nao_informado', null, 'Custo de produção por exemplar em R$ (IA, imagens, pesquisa, armazenamento)'),
  ('imposto_pct',           null, 'nao_informado', null, 'Imposto sobre a venda, % — depende do regime tributário (pendência §9.1)'),
  ('taxa_pagamento_pct',    null, 'nao_informado', null, 'Taxa do Mercado Pago, % — trocar pela real por meio de pagamento (pendência §9.3)'),
  ('taxa_pagamento_fixa',   0,    'estimado',      'sem tarifa fixa por venda até conferir na conta', 'Tarifa fixa por venda, R$'),
  ('estorno_pct',           null, 'nao_informado', null, 'Estornos/reembolsos, % — começa estimado (pendência §9.3)'),
  ('desconto_loja_pct',     0,    'medido',        'oferta sem cupom bancado pela loja', 'Desconto bancado pela loja, % do preço cheio'),
  ('fixo_mensal',           null, 'nao_informado', null, 'Custos fixos do mês em R$ (pendência §9.4) — vira meta de vendas, não preço'),
  ('producao_da_obra',      null, 'nao_informado', null, 'Custo de produzir a obra uma vez, R$ — diluído pelas vendas'),
  ('autor_com_historico',   0,    'medido',        'sem vendas registradas do autor', '1 = autor com histórico de vendas (faixa mediana–p75); 0 = sem (p25–mediana)')
on conflict (chave) do nothing;

-- Só o worker (service role) lê e escreve. Nenhuma política para anon/authenticated.
alter table public.publicacao_propostas enable row level security;
alter table public.publicacao_registros enable row level security;
alter table public.cotacoes_ptax enable row level security;
alter table public.precificacao_parametros enable row level security;
