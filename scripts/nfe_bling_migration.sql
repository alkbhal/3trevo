-- ============================================================
-- NF-e pelo Bling: fila de emissão
-- Executar no SQL Editor do Supabase (projeto xfkepekffdyrtcgagwqo)
-- DEPOIS de scripts/dados_fiscais_migration.sql e ANTES de publicar o
-- Worker com src/nfe-bling.ts.
--
-- notas_fiscais já existe (vazia, criada no plano da Fase 5). Aqui ela
-- ganha o elo com dados_fiscais (uma nota por pagamento) e os campos da
-- fila. Status:
--   pendente  → aguardando emissão (NFE_ENABLED desligado fica aqui)
--   criando   → pedido de criação enviado ao Bling; se ficar preso aqui,
--               conferir no Bling antes de reprocessar (evita nota dupla)
--   enviada   → nota criada no Bling e transmitida à SEFAZ; aguardando
--   emitida   → autorizada; numero_nf, chave_acesso, xml_url, pdf_url
--   erro      → rejeitada ou falha; error_message diz o porquê
--   cancelada → compra reembolsada antes da emissão; nenhuma nota é criada
-- ============================================================

alter table public.notas_fiscais
  add column if not exists dados_fiscais_id uuid references public.dados_fiscais(id) on delete restrict,
  add column if not exists tentativas       integer not null default 0;

create unique index if not exists notas_fiscais_dados_fiscais_uidx
  on public.notas_fiscais (dados_fiscais_id);

create index if not exists notas_fiscais_fila_idx
  on public.notas_fiscais (status) where status in ('pendente', 'criando', 'enviada', 'erro');

-- Nota fiscal é registro legal: não pode sumir junto com a compra (era ON DELETE
-- CASCADE) nem exigir purchase_id (o elo principal agora é dados_fiscais_id).
alter table public.notas_fiscais alter column purchase_id drop not null;
alter table public.notas_fiscais drop constraint if exists notas_fiscais_purchase_id_fkey;
alter table public.notas_fiscais
  add constraint notas_fiscais_purchase_id_fkey
  foreign key (purchase_id) references public.purchases(id) on delete set null;

alter table public.notas_fiscais alter column status set default 'pendente';
alter table public.notas_fiscais alter column created_at set default now();
alter table public.notas_fiscais alter column updated_at set default now();
alter table public.notas_fiscais enable row level security;
