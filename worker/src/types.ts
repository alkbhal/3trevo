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
  // Segredo do tr3vo-forge: a loja busca o livro no servidor (nunca expõe o forge ao comprador)
  FORGE_API_SECRET?: string;
  // Service binding para o tr3vo-forge (fetch entre workers.dev da mesma conta é bloqueado — erro 1042)
  FORGE?: Fetcher;

  // IA
  ANTHROPIC_KEY: string;

  // Pagamentos — Mercado Pago
  MP_ACCESS_TOKEN?: string;  // APP_USR-... (wrangler secret put MP_ACCESS_TOKEN)

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
