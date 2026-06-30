/**
 * leads.ts — Captura de leads + unsubscribe
 * POST /api/leads/capture  — captura lead, seed email sequence, envia step 0
 * GET  /api/leads/unsub     — unsubscribe via token
 */

import type { Env } from '../types';
import { sb } from '../sb';

export async function handleLeadCapture(request: Request, env: Env): Promise<Response> {
  let body: any;
  try { body = await request.json(); } catch { return Response.json({ ok: false, erro: 'json_invalido' }, { status: 400 }); }

  const email = (body.email ?? '').trim().toLowerCase();
  const nome = (body.nome ?? '').trim();
  const whatsapp = (body.whatsapp ?? '').trim();
  const anon_id = body.anon_id ?? null;
  const utm = body.utm ?? {};

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ ok: false, erro: 'email_invalido' }, { status: 400 });
  }

  const leadData: Record<string, any> = {
    email,
    nome: nome || null,
    whatsapp: whatsapp || null,
    utm_source: utm.source ?? null,
    utm_medium: utm.medium ?? null,
    utm_campaign: utm.campaign ?? null,
    utm_content: utm.content ?? null,
    utm_term: utm.term ?? null,
    status: 'novo',
    score: 10,
  };

  const upsertResp = await sb(env, 'leads?on_conflict=email', {
    method: 'POST',
    headers: { Prefer: 'return=representation,resolution=merge-duplicates' } as any,
    body: JSON.stringify(leadData),
  });

  if (!upsertResp.ok) {
    const err = await upsertResp.text();
    console.error('[leads] upsert falhou:', err);
    return Response.json({ ok: false, erro: 'falha_cadastro', detail: err, status_code: upsertResp.status }, { status: 500 });
  }

  const [lead] = (await upsertResp.json()) as any[];
  if (!lead) return Response.json({ ok: false, erro: 'lead_nao_criado' }, { status: 500 });

  if (anon_id) {
    await sb(env, `lead_events?anon_id=eq.${encodeURIComponent(anon_id)}&lead_id=is.null`, {
      method: 'PATCH',
      body: JSON.stringify({ lead_id: lead.id }),
    }).catch(() => {});
  }

  const now = new Date();
  const steps = [
    { step: 0, offset_hours: 0,    tag: 'lead_magnet' },
    { step: 1, offset_hours: 24,   tag: 'nurture_1' },
    { step: 2, offset_hours: 72,   tag: 'nurture_2' },
    { step: 3, offset_hours: 120,  tag: 'nurture_3' },
    { step: 4, offset_hours: 168,  tag: 'nurture_4' },
  ];

  const rows = steps.map(s => ({
    lead_id: lead.id,
    sequence_step: s.step,
    scheduled_at: new Date(now.getTime() + s.offset_hours * 3600000).toISOString(),
    tag: s.tag,
  }));

  await sb(env, 'email_sequence', {
    method: 'POST',
    headers: { Prefer: 'return=minimal,resolution=ignore-duplicates' } as any,
    body: JSON.stringify(rows),
  }).catch(e => console.error('[leads] email_sequence seed:', e));

  if (env.RESEND_API_KEY) {
    const tplResp = await sb(env, `email_templates?tag=eq.lead_magnet&select=subject,html`);
    const [tpl] = (await tplResp.json()) as any[];
    if (tpl) {
      const html = tpl.html
        .replace(/\{\{nome\}\}/g, nome || 'Leitor(a)')
        .replace(/\{\{link\}\}/g, 'https://3trevo.com.br/catalogo.html');

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Editora Três Trevo <sac@3trevo.com.br>',
          to: email,
          subject: tpl.subject,
          html,
        }),
      }).catch(e => console.error('[leads] email step0:', e));

      await sb(env, `email_sequence?lead_id=eq.${lead.id}&sequence_step=eq.0`, {
        method: 'PATCH',
        body: JSON.stringify({ sent_at: new Date().toISOString() }),
      }).catch(() => {});
    }
  }

  return Response.json({ ok: true, lead_id: lead.id });
}

export async function handleUnsubscribe(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (!token) return new Response('Token inválido', { status: 400 });

  const r = await sb(env, `leads?unsub_token=eq.${encodeURIComponent(token)}&select=id,email`);
  const [lead] = (await r.json()) as any[];
  if (!lead) return new Response('Token não encontrado', { status: 404 });

  await sb(env, `leads?id=eq.${lead.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'unsub' }),
  });

  await sb(env, `email_sequence?lead_id=eq.${lead.id}&sent_at=is.null`, {
    method: 'DELETE',
  });

  return new Response(`
    <html><head><meta charset="utf-8"><title>Descadastrado</title></head>
    <body style="font-family:sans-serif;text-align:center;padding:80px 24px">
      <h2>Descadastrado com sucesso</h2>
      <p>Você não receberá mais e-mails da Editora Três Trevo.</p>
      <p><a href="https://3trevo.com.br">Voltar ao site</a></p>
    </body></html>
  `, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
