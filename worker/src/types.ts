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

  // IA
  ANTHROPIC_KEY: string;

  // R2 (downloads de PDFs)
  R2_PUBLIC_BUCKET_ID?: string;

  // R2 privado — EPUBs da Biblioteca TT
  BIBLIOTECA_R2?: R2Bucket;

  // KV (rate limiting, cache)
  TT_KV?: KVNamespace;

  // Admin (gerado via wrangler secret)
  ADMIN_SECRET?: string;
}
