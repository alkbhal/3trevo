/**
 * cart-recovery.ts — Três Trevo Worker
 * Cron horário: diagnostica leads que iniciaram checkout (`lead_events.event_type =
 * 'checkout_start'`, gravado em checkout.ts) e não completaram a compra, e agenda
 * 2 e-mails de recuperação em `email_sequence` (reaproveita o mesmo cron/engine
 * que já processa a nutrição — ver email-engine.ts).
 *
 * Nunca envia direto: só semeia linhas em email_sequence com tag recovery_1/recovery_2.
 * O envio de fato e a checagem final de "já comprou" acontecem em email-engine.ts,
 * na hora do disparo — cobre o caso de a pessoa comprar entre a detecção e o envio.
 */

import type { Env } from '../types';
import { sb } from '../sb';

const JANELA_DETECCAO_HORAS = 2;
const ATRASO_RECOVERY_2_HORAS = 22; // total +24h desde o checkout_start
export const TAG_RECOVERY_1 = 'recovery_1';
export const TAG_RECOVERY_2 = 'recovery_2';

export async function handleCartRecovery(env: Env): Promise<void> {
  const limite = new Date(Date.now() - JANELA_DETECCAO_HORAS * 3600000).toISOString();

  const eventosResp = await sb(env,
    `lead_events?event_type=eq.checkout_start&criado_em=lte.${limite}&order=criado_em.desc&limit=200&select=id,lead_id,props`
  );
  const eventos = (await eventosResp.json()) as any[];
  if (!Array.isArray(eventos) || eventos.length === 0) return;

  for (const evento of eventos) {
    if (!evento.lead_id || !evento.props?.slug) continue;

    try {
      await processarEvento(env, evento.lead_id);
    } catch (e) {
      console.error(`[cart-recovery] falha no lead ${evento.lead_id}:`, e);
    }
  }
}

async function processarEvento(env: Env, leadId: string): Promise<void> {
  // Dedupe: já existe recuperação agendada/enviada pra esse lead (não é por slug —
  // 1 tentativa de recuperação por lead é suficiente, evita spam se ele testar
  // vários checkouts sem comprar nenhum).
  const jaTemResp = await sb(env,
    `email_sequence?lead_id=eq.${leadId}&tag=in.(${TAG_RECOVERY_1},${TAG_RECOVERY_2})&select=id&limit=1`
  );
  const jaTem = (await jaTemResp.json()) as any[];
  if (Array.isArray(jaTem) && jaTem.length > 0) return;

  const leadResp = await sb(env, `leads?id=eq.${leadId}&select=email,status`);
  const [lead] = (await leadResp.json()) as any[];
  if (!lead?.email || lead.status === 'unsub') return;

  if (await leadTemCompraAtiva(env, lead.email)) return;

  const now = Date.now();
  const seedResp = await sb(env, 'email_sequence', {
    method: 'POST',
    headers: { Prefer: 'return=minimal,resolution=ignore-duplicates' } as any,
    body: JSON.stringify([
      { lead_id: leadId, sequence_step: 100, scheduled_at: new Date(now).toISOString(), tag: TAG_RECOVERY_1 },
      { lead_id: leadId, sequence_step: 101, scheduled_at: new Date(now + ATRASO_RECOVERY_2_HORAS * 3600000).toISOString(), tag: TAG_RECOVERY_2 },
    ]),
  });
  if (!seedResp.ok) {
    console.error(`[cart-recovery] falha ao agendar recuperação pro lead ${leadId}:`, seedResp.status, await seedResp.text());
  }
}

// ─── Diagnóstico de conversão ─────────────────────────────────────────────────
// Checagem genérica (qualquer compra ativa, não só a do slug abandonado) — decisão
// deliberada: nunca mandar recuperação pra quem já converteu em QUALQUER título,
// mesmo que não tenha sido o do carrinho abandonado. Só leitura — nunca cria
// usuário (diferente de buscarOuCriarUsuario em checkout.ts, usado no webhook de
// pagamento aprovado, contexto diferente).
export async function leadTemCompraAtiva(env: Env, email: string): Promise<boolean> {
  const authUrl = `${env.SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`;
  const authResp = await fetch(authUrl, {
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    },
  });
  if (!authResp.ok) return false;
  const authData = (await authResp.json()) as any;
  const users: any[] = authData.users ?? (Array.isArray(authData) ? authData : []);
  const userId = users.find((u: any) => u.email === email)?.id;
  if (!userId) return false; // nunca criou conta → nunca chegou a pagar

  const compraResp = await sb(env, `purchases?user_id=eq.${userId}&status=eq.active&select=id&limit=1`);
  const compras = (await compraResp.json()) as any[];
  return Array.isArray(compras) && compras.length > 0;
}
