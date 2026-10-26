-- ============================================================
-- Dados do comprador para emissão da nota fiscal (CPF/CNPJ + endereço)
-- Executar no SQL Editor do Supabase (projeto xfkepekffdyrtcgagwqo)
-- ANTES de publicar o Worker que grava nesta tabela (src/fiscal.ts).
--
-- Uma linha por pagamento aprovado no Mercado Pago (mp_payment_id único:
-- o webhook reenviado não duplica). Gravada só pelo Worker (service_role).
-- RLS ligado e sem política: anon e authenticated não leem nem escrevem.
-- Base legal LGPD: cumprimento de obrigação legal (art. 7º, II) — guardar
-- pelo prazo da legislação fiscal, mesmo se o cliente pedir exclusão da conta
-- (por isso purchase_id vira NULL em vez de apagar a linha).
-- ============================================================

create table if not exists public.dados_fiscais (
  id              uuid primary key default gen_random_uuid(),
  mp_payment_id   text not null unique,
  purchase_id     uuid references public.purchases(id) on delete set null,
  email           text not null,
  nome            text not null,
  valor           numeric(10,2) not null,
  tipo_documento  text not null check (tipo_documento in ('CPF', 'CNPJ')),
  documento       text not null check (documento ~ '^[0-9A-Z]{11,14}$'),
  cep             text not null check (cep ~ '^[0-9]{8}$'),
  logradouro      text not null,
  numero          text not null,
  complemento     text,
  bairro          text not null,
  cidade          text not null,
  uf              char(2) not null,
  codigo_ibge     text check (codigo_ibge is null or codigo_ibge ~ '^[0-9]{7}$'),
  nf_numero       text,          -- preenchido quando a nota for emitida
  nf_emitida_em   timestamptz,
  criado_em       timestamptz not null default now()
);

create index if not exists dados_fiscais_pendentes_idx
  on public.dados_fiscais (criado_em) where nf_emitida_em is null;

alter table public.dados_fiscais enable row level security;
revoke all on public.dados_fiscais from anon, authenticated;
