-- Leitura interativa: texto das obras servido só pelo worker (/api/leitura/:slug) a quem comprou.
-- Migração aditiva. Fonte única: o Doc canônico da obra no Drive; o forge (scripts/obras/gerar-leitura.py)
-- deriva esta tabela. Nenhum repositório guarda o texto.
create table if not exists public.obra_conteudo (
  slug        text        not null,
  ordem       int         not null,
  capitulo_id text        not null,
  conteudo    jsonb       not null,
  versao      text        not null,
  acesso      text        not null default 'compra' check (acesso in ('livre','compra')),
  atualizado  timestamptz not null default now(),
  primary key (slug, capitulo_id)
);
create index if not exists obra_conteudo_ordem on public.obra_conteudo (slug, ordem);

-- RLS ligada e nenhuma política: anon e authenticated não leem nada; só a service key (worker).
alter table public.obra_conteudo enable row level security;
revoke all on public.obra_conteudo from anon, authenticated;

-- Aplicada em produção em 05/11/2026 sobre a tabela já existente:
-- alter table public.obra_conteudo add column if not exists acesso text not null default 'compra';
-- alter table public.obra_conteudo add constraint obra_conteudo_acesso_ck check (acesso in ('livre','compra'));
