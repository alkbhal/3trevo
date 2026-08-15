/**
 * email-engine.ts — Processador de sequência de emails
 * Roda no cron horário. Busca emails pendentes e envia via Resend.
 */

import type { Env } from '../types';
import { sb } from '../sb';
import { TAG_RECOVERY_1, TAG_RECOVERY_2, leadTemCompraAtiva } from './cart-recovery';

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

    const isRecovery = item.tag === TAG_RECOVERY_1 || item.tag === TAG_RECOVERY_2;
    if (isRecovery && (await leadTemCompraAtiva(env, lead.email))) {
      // Comprou entre o agendamento e o envio — recuperação não faz mais sentido.
      await sb(env, `email_sequence?id=eq.${item.id}`, { method: 'DELETE' });
      continue;
    }

    const tplResp = await sb(env, `email_templates?tag=eq.${encodeURIComponent(item.tag)}&select=subject,html`);
    const [tpl] = (await tplResp.json()) as any[];
    if (!tpl) continue;

    let linkUrl = 'https://3trevo.com.br/catalogo.html';
    let titulo = '';
    if (isRecovery) {
      const evResp = await sb(env,
        `lead_events?lead_id=eq.${item.lead_id}&event_type=eq.checkout_start&order=criado_em.desc&limit=1&select=props`
      );
      const [ev] = (await evResp.json()) as any[];
      const slug = ev?.props?.slug;
      if (!slug) continue; // sem carrinho pra recuperar, não tem o que mandar
      linkUrl = `https://3trevo.com.br/checkout.html?slug=${encodeURIComponent(slug)}`;
      const catResp = await sb(env, `catalogo?slug=eq.${encodeURIComponent(slug)}&select=titulo`);
      const [cat] = (await catResp.json()) as any[];
      titulo = cat?.titulo ?? '';
    }

    // Templates novos (recovery_*) já trazem o link de descadastro embutido no
    // próprio HTML, estilizado no rodapé — não duplicar o parágrafo genérico
    // nesse caso. Templates antigos (nurture_*) não têm {{unsubscribe_link}},
    // então continuam recebendo o parágrafo simples anexado ao final.
    const unsubUrl = `https://tres-trevo-api.al-kbhal.workers.dev/api/leads/unsub?token=${lead.unsub_token}`;
    const temUnsubEmbutido = tpl.html.includes('{{unsubscribe_link}}');
    let html = tpl.html
      .replace(/\{\{nome\}\}/g, lead.nome || 'Leitor(a)')
      .replace(/\{\{titulo\}\}/g, titulo)
      .replace(/\{\{link\}\}/g, linkUrl)
      .replace(/\{\{link_recuperacao\}\}/g, linkUrl)
      .replace(/\{\{unsubscribe_link\}\}/g, unsubUrl);
    if (!temUnsubEmbutido) {
      html += `<p style="font-size:11px;color:#999;margin-top:24px"><a href="${unsubUrl}" style="color:#999">Não quero mais receber e-mails</a></p>`;
    }

    const subject = tpl.subject
      .replace(/\{\{nome\}\}/g, lead.nome || 'Leitor(a)')
      .replace(/\{\{titulo\}\}/g, titulo);

    try {
      const sendResp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Editora Três Trevo <sac@3trevo.com.br>',
          to: lead.email,
          subject,
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
