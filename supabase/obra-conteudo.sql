-- Leitura interativa: texto das obras servido só pelo worker (/api/leitura/:slug) a quem comprou.
-- Migração aditiva. O conteúdo é carregado pelo forge (seed privado), nunca por este repositório.
create table if not exists public.obra_conteudo (
  slug        text        not null,
  ordem       int         not null,
  capitulo_id text        not null,
  conteudo    jsonb       not null,
  versao      text        not null,
  atualizado  timestamptz not null default now(),
  primary key (slug, capitulo_id)
);
create index if not exists obra_conteudo_ordem on public.obra_conteudo (slug, ordem);

-- RLS ligada e nenhuma política: anon e authenticated não leem nada; só a service key (worker).
alter table public.obra_conteudo enable row level security;
revoke all on public.obra_conteudo from anon, authenticated;
