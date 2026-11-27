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
  -- EXTERIOR = comprador fora do Brasil (NF de exportação: UF "EX", município "EXTERIOR")
  tipo_documento  text not null check (tipo_documento in ('CPF', 'CNPJ', 'EXTERIOR')),
  pais            char(2) not null default 'BR',   -- ISO 3166-1 alfa-2
  documento       text check (documento ~ '^[0-9A-Z]{1,20}$'),  -- no exterior: passaporte/nº fiscal, opcional
  cep             text,                             -- no exterior: código postal livre, opcional
  logradouro      text not null,
  numero          text,
  complemento     text,
  bairro          text,
  cidade          text not null,
  uf              char(2) not null,
  codigo_ibge     text check (codigo_ibge is null or codigo_ibge ~ '^[0-9]{7}$'),
  -- coalesce: em CHECK, NULL conta como aprovado; aqui campo vazio tem de reprovar
  constraint dados_fiscais_brasil_completo check (
    tipo_documento = 'EXTERIOR'
    or coalesce(pais = 'BR' and documento ~ '^[0-9A-Z]{11,14}$' and cep ~ '^[0-9]{8}$'
        and numero is not null and bairro is not null, false)
  ),
  constraint dados_fiscais_exterior check (tipo_documento <> 'EXTERIOR' or (pais <> 'BR' and uf = 'EX')),
  nf_numero       text,          -- preenchido quando a nota for emitida
  nf_emitida_em   timestamptz,
  criado_em       timestamptz not null default now()
);

create index if not exists dados_fiscais_pendentes_idx
  on public.dados_fiscais (criado_em) where nf_emitida_em is null;

alter table public.dados_fiscais enable row level security;
revoke all on public.dados_fiscais from anon, authenticated;
