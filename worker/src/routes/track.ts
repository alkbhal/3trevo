/**
 * track.ts — Beacon ingest + Meta CAPI relay
 * POST /api/track      — frontend beacon (público, rate-limited)
 * POST /api/track/capi — Meta Conversions API server-side
 */

import type { Env } from '../types';
import { sbHeaders } from '../sb';

export async function handleTrack(request: Request, env: Env): Promise<Response> {
  let body: any;
  try { body = await request.json(); } catch { return new Response(null, { status: 204 }); }

  const { anon_id, event_type, page, utm, props } = body;
  if (!event_type || typeof event_type !== 'string') return new Response(null, { status: 204 });

  if (env.TT_KV && anon_id) {
    const key = `track:rate:${anon_id}`;
    const count = parseInt(await env.TT_KV.get(key) ?? '0', 10);
    if (count > 200) return new Response(null, { status: 204 });
    await env.TT_KV.put(key, String(count + 1), { expirationTtl: 3600 });
  }

  const row = {
    anon_id: anon_id ?? null,
    event_type: event_type.substring(0, 30),
    page: (page ?? '').substring(0, 200),
    utm_source: utm?.source ?? null,
    utm_medium: utm?.medium ?? null,
    utm_campaign: utm?.campaign ?? null,
    props: props ?? {},
  };

  await fetch(`${env.SUPABASE_URL}/rest/v1/lead_events`, {
    method: 'POST',
    headers: { ...sbHeaders(env), Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  }).catch(() => {});

  return new Response(null, { status: 204 });
}

export async function handleMetaCapi(request: Request, env: Env): Promise<Response> {
  const pixelId = (env as any).META_PIXEL_ID;
  const capiToken = (env as any).META_CAPI_TOKEN;
  if (!pixelId || !capiToken) return Response.json({ ok: false, erro: 'meta_nao_configurado' }, { status: 200 });

  let body: any;
  try { body = await request.json(); } catch { return new Response('Bad Request', { status: 400 }); }

  const { event_name, email, value, currency, source_url } = body;

  let hashedEmail = '';
  if (email) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email.toLowerCase().trim()));
    hashedEmail = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  const payload = {
    data: [{
      event_name: event_name ?? 'Lead',
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      event_source_url: source_url ?? 'https://3trevo.com.br',
      user_data: { em: [hashedEmail] },
      custom_data: value ? { value, currency: currency ?? 'BRL' } : undefined,
    }],
    access_token: capiToken,
  };

  // access_token vai no body, não na query string, pra não vazar em logs de
  // edge/proxy (achado da auditoria real, 01/09) -- Graph API aceita os dois.
  await fetch(`https://graph.facebook.com/v19.0/${pixelId}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(e => console.error('[capi]', e));

  return Response.json({ ok: true });
}
