/**
 * notify.ts — WhatsApp Cloud API + Resend fallback
 * Compartilhado entre budget controller, didático e alertas
 */

import type { Env } from './types';

const DIDACTIC: Record<string, string> = {
  roi_negativo_3d: 'ROI negativo 3 dias seguidos indica que o custo por lead está acima do ticket médio. Reduza o público-alvo ou teste um criativo diferente.',
  budget_diario_atingido: 'O orçamento diário foi consumido — isso é normal em campanhas com bom CTR. Avalie se vale aumentar o budget amanhã.',
  escalacao_tier: 'ROI consistente acima de 100% por 7 dias mostra que a campanha encontrou o público certo. Escalar agora maximiza o retorno antes da saturação.',
  nova_venda: 'Cada venda via campanha reduz o CPA acumulado. Monitore se o canal continua rendendo nas próximas 48h.',
  lead_capturado: 'Um novo lead entrou no funil. A sequência de 5 emails vai nutrir automaticamente.',
};

export async function notify(env: Env, text: string, alertType?: string): Promise<void> {
  const why = alertType && DIDACTIC[alertType]
    ? `\n\n💡 Por quê?: ${DIDACTIC[alertType]}`
    : '';
  const fullText = text + why;

  const waToken = env.WHATSAPP_TOKEN;
  const waPhoneId = env.WHATSAPP_PHONE_ID;
  const waTo = env.WHATSAPP_TO;

  if (waToken && waPhoneId && waTo) {
    try {
      await fetch(`https://graph.facebook.com/v19.0/${waPhoneId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${waToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: waTo,
          type: 'text',
          text: { body: fullText.substring(0, 4096) },
        }),
      });
      return;
    } catch (e) {
      console.error('[notify] WhatsApp falhou, fallback email:', e);
    }
  }

  await emailDono(env, text.substring(0, 60), fullText);
}

/** E-mail curto ao dono (avisos de publicação, R8 da spec por idioma). Sem Resend: só log. */
export async function emailDono(env: Env, assunto: string, texto: string): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.warn('[notify] RESEND_API_KEY ausente — aviso não enviado:', assunto);
    return;
  }
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Editora Três Trevo <sac@3trevo.com.br>',
      to: 'al_kbhal@yahoo.com.br',
      subject: `[3Trevo] ${assunto}`,
      html: `<pre style="font-family:sans-serif;line-height:1.6">${texto.replace(/</g, '&lt;')}</pre>`,
    }),
  }).catch(e => console.error('[notify] email falhou:', e));
}
