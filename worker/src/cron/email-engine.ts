/**
 * email-engine.ts — Processador de sequência de emails
 * Roda no cron horário. Busca emails pendentes e envia via Resend.
 */

import type { Env } from '../types';

function sbHeaders(env: Env): Record<string, string> {
  return {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };
}

function sb(env: Env, path: string, opts: RequestInit = {}) {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { ...sbHeaders(env), ...(opts.headers as Record<string, string> ?? {}) },
  });
}

export async function handleEmailEngine(env: Env): Promise<void> {
  if (!env.RESEND_API_KEY) return;

  const now = new Date().toISOString();
  const dueResp = await sb(env,
    `email_sequence?sent_at=is.null&scheduled_at=lte.${now}&order=scheduled_at.asc&limit=50&select=id,lead_id,sequence_step,tag`
  );
  const due = (await dueResp.json()) as any[];
  if (!Array.isArray(due) || due.length === 0) return;

  for (const item of due) {
    const leadResp = await sb(env, `leads?id=eq.${item.lead_id}&select=email,nome,status,unsub_token`);
    const [lead] = (await leadResp.json()) as any[];
    if (!lead || lead.status === 'unsub') {
      await sb(env, `email_sequence?id=eq.${item.id}`, { method: 'DELETE' });
      continue;
    }

    const tplResp = await sb(env, `email_templates?tag=eq.${encodeURIComponent(item.tag)}&select=subject,html`);
    const [tpl] = (await tplResp.json()) as any[];
    if (!tpl) continue;

    const unsubUrl = `https://tres-trevo-api.al-kbhal.workers.dev/api/leads/unsub?token=${lead.unsub_token}`;
    const html = tpl.html
      .replace(/\{\{nome\}\}/g, lead.nome || 'Leitor(a)')
      .replace(/\{\{link\}\}/g, 'https://3trevo.com.br/catalogo.html')
      + `<p style="font-size:11px;color:#999;margin-top:24px"><a href="${unsubUrl}" style="color:#999">Não quero mais receber e-mails</a></p>`;

    try {
      const sendResp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Editora Três Trevo <sac@3trevo.com.br>',
          to: lead.email,
          subject: tpl.subject,
          html,
        }),
      });

      if (sendResp.ok) {
        await sb(env, `email_sequence?id=eq.${item.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ sent_at: new Date().toISOString() }),
        });
      }
    } catch (e) {
      console.error(`[email-engine] step ${item.sequence_step} para ${lead.email}:`, e);
    }
  }
}
