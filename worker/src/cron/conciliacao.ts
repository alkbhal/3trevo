/**
 * conciliacao.ts — Três Trevo Worker
 * Cron horário: pergunta ao Mercado Pago quais pagamentos foram aprovados nas últimas
 * 7 dias e processa cada um pelo mesmo caminho do webhook (processarPagamentoAprovado).
 *
 * Por que existe: o webhook depende de a notificação chegar. Se ela não chega (assinatura
 * divergente, configuração de conta, falha de rede), a compra e a entrega nunca acontecem.
 * Aqui a fonte é o próprio Mercado Pago, então o pagamento entra mesmo sem notificação.
 *
 * Idempotente: processarPagamentoAprovado grava via RPC por mp_payment_id; a entrega, o
 * alerta de valor e o alerta de falha só disparam na primeira gravação (rpc.novo).
 * Rodar várias vezes não duplica compra nem e-mail.
 */
import type { Env } from '../types';
import { processarPagamentoAprovado } from '../routes/checkout';

const MP_API = 'https://api.mercadopago.com';

// Slugs de todo o catálogo (inclusive inativos: vendas antigas também precisam ser conciliadas).
async function slugsDoCatalogo(env: Env): Promise<Set<string> | null> {
  try {
    const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/catalogo?select=slug`, {
      headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
    });
    if (!resp.ok) { console.error('[conciliacao] catálogo indisponível:', resp.status); return null; }
    const rows = (await resp.json()) as any[];
    return new Set(rows.map(r => String(r.slug)));
  } catch (e) {
    console.error('[conciliacao] falha ao ler catálogo:', e);
    return null;
  }
}

export async function handleConciliacao(env: Env): Promise<void> {
  if (!env.MP_ACCESS_TOKEN) {
    console.error('[conciliacao] MP_ACCESS_TOKEN ausente — conciliação pulada');
    return;
  }
  const fim = new Date();
  const inicio = new Date(fim.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 dias: cobre pagamentos que o webhook perdeu
  const params = new URLSearchParams({
    status: 'approved',
    range: 'date_created',
    begin_date: inicio.toISOString(),
    end_date: fim.toISOString(),
    sort: 'date_created',
    criteria: 'desc',
    limit: '100',
  });
  let pagamentos: any[] = [];
  try {
    const resp = await fetch(`${MP_API}/v1/payments/search?${params}`, {
      headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}` },
    });
    if (!resp.ok) {
      console.error('[conciliacao] MP respondeu', resp.status);
      return;
    }
    const data = (await resp.json()) as any;
    pagamentos = Array.isArray(data?.results) ? data.results : [];
  } catch (e) {
    console.error('[conciliacao] falha ao consultar MP:', e);
    return;
  }

  // Pagamentos de outras vitrines da mesma conta MP (referência que não é slug de catálogo) não são
  // desta loja. Antes eram reprocessados a cada hora e geravam erro para sempre.
  const slugs = await slugsDoCatalogo(env);
  if (!slugs) return; // sem catálogo legível não dá para separar: não processa agora

  for (const p of pagamentos) {
    if (p?.status !== 'approved' || !p?.id) continue;
    if (!slugs.has(String(p.external_reference ?? ''))) {
      console.log('[conciliacao] pagamento de outra vitrine ignorado:', p.id);
      continue;
    }
    try {
      await processarPagamentoAprovado(env, p, String(p.id));
    } catch (e) {
      console.error('[conciliacao] falha no pagamento', p.id, e);
    }
  }
}
