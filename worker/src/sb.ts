import type { Env } from './types';

export function sbHeaders(env: Env): Record<string, string> {
  return {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };
}

export function sb(env: Env, path: string, opts: RequestInit = {}): Promise<Response> {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    signal: AbortSignal.timeout(8000),
    headers: { ...sbHeaders(env), ...(opts.headers as Record<string, string> ?? {}) },
  });
}
