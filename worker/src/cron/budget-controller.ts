/**
 * budget-controller.ts — "Nunca perder dinheiro"
 * Roda no cron horário existente.
 * - Calcula ROI por campanha ativa
 * - Circuit breaker: ROI < 0 por 3 dias → pausa
 * - Escalação: ROI > 100% por 7 dias → bump tier
 * - Resumo diário WhatsApp/email às 8h UTC-3
 */

import type { Env } from '../types';
import { notify } from '../notify';

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

type DailyRow = { date: string; spend: number; revenue: number; roi: number };

export function decideAction(dailyRows: DailyRow[]): 'pause' | 'escalate' | 'hold' {
  if (dailyRows.length < 3) return 'hold';

  const last3 = dailyRows.slice(0, 3);
  if (last3.every(d => d.spend > 0 && d.roi < 0)) return 'pause';

  if (dailyRows.length >= 7) {
    const last7 = dailyRows.slice(0, 7);
    if (last7.every(d => d.spend > 0 && d.roi > 100)) return 'escalate';
  }

  return 'hold';
}

export async function handleBudgetController(env: Env): Promise<void> {
  const campResp = await sb(env, 'campaigns?status=eq.active&select=*');
  const campaigns = (await campResp.json()) as any[];
  if (!Array.isArray(campaigns) || campaigns.length === 0) return;

  const today = new Date().toISOString().split('T')[0];

  for (const c of campaigns) {
    const revenueResp = await sb(env,
      `pedidos?utm_campaign=eq.${encodeURIComponent(c.utm_campaign)}&select=valor_pago&criado_em=gte.${today}T00:00:00`
    );
    const pedidos = (await revenueResp.json()) as any[];
    const todayRevenue = Array.isArray(pedidos)
      ? pedidos.reduce((sum: number, p: any) => sum + (Number(p.valor_pago) || 0), 0)
      : 0;

    const dailyResp = await sb(env,
      `campaign_daily?campaign_id=eq.${c.id}&date=eq.${today}&select=*`
    );
    const [existing] = (await dailyResp.json()) as any[];

    const spend = existing?.spend ?? 0;
    const roi = spend > 0 ? ((todayRevenue - spend) / spend) * 100 : 0;

    await sb(env, 'campaign_daily', {
      method: 'POST',
      headers: { Prefer: 'return=minimal,resolution=merge-duplicates' } as any,
      body: JSON.stringify({
        campaign_id: c.id,
        date: today,
        revenue: todayRevenue,
        roi: Math.round(roi * 100) / 100,
        ...(existing ? {} : { spend: 0, impressions: 0, clicks: 0, leads: 0, conversions: 0 }),
      }),
    }).catch(e => console.error('[budget] upsert daily:', e));

    const histResp = await sb(env,
      `campaign_daily?campaign_id=eq.${c.id}&order=date.desc&limit=7&select=date,spend,revenue,roi`
    );
    const history = (await histResp.json()) as DailyRow[];

    const action = decideAction(history);

    if (action === 'pause') {
      await sb(env, `campaigns?id=eq.${c.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'paused', paused_reason: 'roi_negativo_3d' }),
      });
      await notify(env,
        `⛔ Campanha "${c.name}" PAUSADA — ROI negativo por 3 dias consecutivos. Gasto acumulado: R$${Number(c.spent).toFixed(2)}`,
        'roi_negativo_3d'
      );
    }

    if (action === 'escalate' && c.tier < 3) {
      const newTier = c.tier + 1;
      const budgets: Record<number, number> = { 1: 300, 2: 600, 3: 1500 };
      const newBudgetDaily = (budgets[newTier] ?? 1500) / 30;
      await sb(env, `campaigns?id=eq.${c.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ tier: newTier, budget_daily: Math.round(newBudgetDaily * 100) / 100 }),
      });
      await notify(env,
        `🚀 Campanha "${c.name}" ESCALADA tier ${c.tier}→${newTier} (R$${budgets[c.tier] ?? 300}→R$${budgets[newTier]}/mês). ROI >100% por 7 dias!`,
        'escalacao_tier'
      );
    }

    if (spend > 0 && spend >= c.budget_daily) {
      await notify(env,
        `💰 Campanha "${c.name}" atingiu o budget diário (R$${spend.toFixed(2)} / R$${Number(c.budget_daily).toFixed(2)})`,
        'budget_diario_atingido'
      );
    }
  }

  const hour = new Date(Date.now() - 3 * 3600000).getHours();
  if (hour === 8) {
    const allDailyResp = await sb(env,
      `campaign_daily?date=eq.${new Date(Date.now() - 86400000).toISOString().split('T')[0]}&select=spend,revenue,leads,conversions`
    );
    const allDaily = (await allDailyResp.json()) as any[];
    if (Array.isArray(allDaily) && allDaily.length > 0) {
      const totals = allDaily.reduce((acc: any, d: any) => ({
        spend: acc.spend + Number(d.spend || 0),
        revenue: acc.revenue + Number(d.revenue || 0),
        leads: acc.leads + (d.leads || 0),
        conversions: acc.conversions + (d.conversions || 0),
      }), { spend: 0, revenue: 0, leads: 0, conversions: 0 });
      const roi = totals.spend > 0 ? ((totals.revenue - totals.spend) / totals.spend * 100).toFixed(0) : 'N/A';

      await notify(env,
        `📊 Resumo ontem: R$${totals.spend.toFixed(2)} gasto, ${totals.leads} leads, ${totals.conversions} vendas, receita R$${totals.revenue.toFixed(2)}, ROI ${roi}%`
      );
    }
  }
}
