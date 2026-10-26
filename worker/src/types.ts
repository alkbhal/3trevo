/**
 * types.ts — Três Trevo Worker
 * Tipos globais do ambiente Cloudflare Workers
 *
 * Deploy: copiar para worker/src/types.ts
 */

export interface Env {
  // Supabase
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;

  // Email
  RESEND_API_KEY: string;

  // Segurança
  WEBHOOK_HMAC_SECRET: string;
  FORGE_WEBHOOK_SECRET?: string;
  FORGE_PUBLIC_URL?: string;
  FORGE_DOWNLOAD_SECRET?: string; // mesmo valor do tr3vo-forge — assina links de epub/pdf/html
  FORGE_ADMIN_SECRET?: string; // credencial do admin no worker intake do tr3vo-forge (ponte do admin)
  FORGE_URL?: string;
  FORGE?: Fetcher; // service binding para o worker tr3vo-forge (ver wrangler.toml)

  // IA
  ANTHROPIC_KEY: string;

  // Pagamentos — Mercado Pago
  MP_ACCESS_TOKEN?: string;  // APP_USR-... (wrangler secret put MP_ACCESS_TOKEN)

  // NF-e pelo Bling (ver src/bling.ts e src/cron/nfe-emissao.ts)
  BLING_CLIENT_ID?: string;      // secret: app da Central de Extensões do Bling
  BLING_CLIENT_SECRET?: string;  // secret
  BLING_NATUREZA_ID?: string;    // id da natureza de operação de venda (cadastrada no Bling pelo contador)
  BLING_LOJA_ID?: string;        // opcional: loja do Bling a que as notas pertencem
  NFE_NCM?: string;              // padrão 4901.99.00 (livros)
  NFE_ENABLED?: string;          // "true" liga a emissão; qualquer outro valor só enfileira

    // R2 (downloads de PDFs)
  R2_PUBLIC_BUCKET_ID?: string;

  // R2 privado — EPUBs da Biblioteca TT
  BIBLIOTECA_R2?: R2Bucket;

  // KV (rate limiting, cache)
  TT_KV?: KVNamespace;

  // Admin (gerado via wrangler secret)
  ADMIN_SECRET?: string;

  // WhatsApp Cloud API
  WHATSAPP_TOKEN?: string;
  WHATSAPP_PHONE_ID?: string;
  WHATSAPP_TO?: string;
}
