/**
 * admin-bi.ts — Dashboard BI financeiro
 * GET /api/admin/bi?period=7d|30d|90d|all
 */

import type { Env } from '../types';
import { verificarToken } from './admin-catalog';
import { sb } from '../sb';

function parseCount(r: Response): number {
  return parseInt(r.headers.get('Content-Range')?.split('/')[1] ?? '0', 10);
}

export async function handleAdminBI(request: Request, env: Env): Promise<Response> {
  if (!(await verificarToken(request, env))) return new Response('Unauthorized', { status: 401 });

  const url = new URL(request.url);
  const period = url.searchParams.get('period') ?? '30d';
  const dias = period === '7d' ? 7 : period === '90d' ? 90 : period === 'all' ? 0 : 30;
  const desde = dias > 0 ? new Date(Date.now() - dias * 86400000).toISOString() : null;
  const df = desde ? `&created_at=gte.${desde}` : '';

  const safeJson = async (r: Response): Promise<any[]> => {
    if (!r.ok) return [];
    const d = await r.json().catch(() => []);
    return Array.isArray(d) ? d : [];
  };

  const [paymentsR, paymentsTotalR, eventsUtmR, leadsR, leadsWeekR, productsR, downloadsR] = await Promise.all([
    sb(env, `payments?select=id,valor,metodo,product_id,created_at&status=eq.approved&order=created_at.desc&limit=500${df}`),
    sb(env, 'payments?select=count&status=eq.approved', { headers: { Prefer: 'count=exact', Range: '0-0' } as any }),
    sb(env, `lead_events?select=utm_source,utm_medium,utm_campaign,event_type${df}&order=created_at.desc&limit=2000`),
    sb(env, `leads?select=count${df}`, { headers: { Prefer: 'count=exact', Range: '0-0' } as any }),
    sb(env, `leads?select=count&created_at=gte.${new Date(Date.now() - 7 * 86400000).toISOString()}`, {
      headers: { Prefer: 'count=exact', Range: '0-0' } as any,
    }),
    sb(env, 'products?select=id,slug,titulo&ativo=eq.true'),
    sb(env, 'downloads?select=product_id,download_count&order=download_count.desc&limit=50'),
  ]);

  const payments = await safeJson(paymentsR);
  const totalVendasGeral = parseCount(paymentsTotalR);
  const eventos = await safeJson(eventsUtmR);
  const totalLeads = parseCount(leadsR);
  const leadsWeek = parseCount(leadsWeekR);
  const products = await safeJson(productsR);
  const downloads = await safeJson(downloadsR);

  // product_id → { slug, titulo }
  const prodMap: Record<string, { slug: string; titulo: string }> = Object.fromEntries(
    products.map((p: any) => [p.id, { slug: p.slug, titulo: p.titulo }])
  );

  // ── Receita ────────────────────────────────────────────────────────────────
  const receita_total = payments.reduce((s: number, p: any) => s + Number(p.valor ?? 0), 0);
  const ticket_medio = payments.length > 0 ? receita_total / payments.length : 0;

  // ── Por ebook ──────────────────────────────────────────────────────────────
  const por_ebook: Record<string, { titulo: string; vendas: number; receita: number }> = {};
  for (const p of payments) {
    const prod = prodMap[p.product_id] ?? { slug: p.product_id ?? 'desconhecido', titulo: 'Desconhecido' };
    const key = prod.slug;
    if (!por_ebook[key]) por_ebook[key] = { titulo: prod.titulo, vendas: 0, receita: 0 };
    por_ebook[key].vendas++;
    por_ebook[key].receita += Number(p.valor ?? 0);
  }

  // ── Por método de pagamento ────────────────────────────────────────────────
  const por_metodo: Record<string, { vendas: number; receita: number }> = {};
  for (const p of payments) {
    const m = p.metodo ?? 'desconhecido';
    if (!por_metodo[m]) por_metodo[m] = { vendas: 0, receita: 0 };
    por_metodo[m].vendas++;
    por_metodo[m].receita += Number(p.valor ?? 0);
  }

  // ── Vendas por dia ─────────────────────────────────────────────────────────
  const vendas_dia: Record<string, { vendas: number; receita: number }> = {};
  for (const p of payments) {
    const dia = (p.created_at ?? '').slice(0, 10) || 'desconhecido';
    if (!vendas_dia[dia]) vendas_dia[dia] = { vendas: 0, receita: 0 };
    vendas_dia[dia].vendas++;
    vendas_dia[dia].receita += Number(p.valor ?? 0);
  }

  // ── UTM / canais ───────────────────────────────────────────────────────────
  const por_canal: Record<string, number> = {};
  const por_campanha: Record<string, number> = {};
  for (const e of eventos) {
    const src = e.utm_source ?? 'orgânico';
    por_canal[src] = (por_canal[src] ?? 0) + 1;
    if (e.utm_campaign) por_campanha[e.utm_campaign] = (por_campanha[e.utm_campaign] ?? 0) + 1;
  }

  // ── Eventos por tipo ───────────────────────────────────────────────────────
  const por_evento: Record<string, number> = {};
  for (const e of eventos) {
    por_evento[e.event_type] = (por_evento[e.event_type] ?? 0) + 1;
  }

  // ── Downloads ──────────────────────────────────────────────────────────────
  const total_downloads = downloads.reduce((s: number, d: any) => s + Number(d.download_count ?? 0), 0);

  return Response.json({
    ok: true,
    periodo: period,
    resumo: {
      receita_total: round2(receita_total),
      total_vendas: payments.length,
      total_vendas_geral: totalVendasGeral,
      ticket_medio: round2(ticket_medio),
      total_leads: totalLeads,
      leads_semana: leadsWeek,
      total_downloads,
    },
    por_ebook: Object.entries(por_ebook)
      .map(([slug, v]) => ({ slug, ...v, receita: round2(v.receita) }))
      .sort((a, b) => b.receita - a.receita),
    por_metodo: Object.entries(por_metodo)
      .map(([metodo, v]) => ({ metodo, ...v, receita: round2(v.receita) }))
      .sort((a, b) => b.receita - a.receita),
    vendas_dia: Object.entries(vendas_dia)
      .map(([dia, v]) => ({ dia, ...v, receita: round2(v.receita) }))
      .sort((a, b) => a.dia.localeCompare(b.dia)),
    por_canal: Object.entries(por_canal)
      .map(([canal, visitas]) => ({ canal, visitas }))
      .sort((a, b) => b.visitas - a.visitas)
      .slice(0, 10),
    por_campanha: Object.entries(por_campanha)
      .map(([campanha, visitas]) => ({ campanha, visitas }))
      .sort((a, b) => b.visitas - a.visitas)
      .slice(0, 10),
    por_evento,
    ts: new Date().toISOString(),
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
