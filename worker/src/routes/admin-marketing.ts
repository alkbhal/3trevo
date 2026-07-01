/**
 * admin-marketing.ts — Painel Marketing (Growth Engine Fase 4)
 * GET /api/admin/marketing/stats — resumo leads + events + campaigns
 */

import type { Env } from '../types';
import { verificarToken } from './admin-catalog';
import { sb } from '../sb';

function parseCount(r: Response): number {
  return parseInt(r.headers.get('Content-Range')?.split('/')[1] ?? '0', 10);
}

export async function handleAdminMarketingStats(request: Request, env: Env): Promise<Response> {
  if (!(await verificarToken(request, env))) {
    return new Response('Unauthorized', { status: 401 });
  }

  const safeJson = async (r: Response): Promise<any[]> => {
    if (!r.ok) return [];
    const data = await r.json().catch(() => []);
    return Array.isArray(data) ? data : [];
  };

  const [leadsCountR, leadsRecentR, eventsCountR, emailPendingR, eventsByTypeR, leadsWeekR] = await Promise.all([
    sb(env, 'leads?select=count', { headers: { Prefer: 'count=exact', Range: '0-0' } as any }),
    sb(env, 'leads?select=id,nome,email,status,score,created_at&order=created_at.desc&limit=20'),
    sb(env, 'lead_events?select=count', { headers: { Prefer: 'count=exact', Range: '0-0' } as any }),
    sb(env, 'email_sequence?sent_at=is.null&select=count', { headers: { Prefer: 'count=exact', Range: '0-0' } as any }),
    sb(env, 'lead_events?select=event_type&order=created_at.desc&limit=500'),
    sb(env, `leads?created_at=gte.${new Date(Date.now() - 7 * 86400000).toISOString()}&select=count`, {
      headers: { Prefer: 'count=exact', Range: '0-0' } as any,
    }),
  ]);

  const totalLeads = parseCount(leadsCountR);
  const leadsRecent = await safeJson(leadsRecentR);
  const totalEvents = parseCount(eventsCountR);
  const emailsPending = parseCount(emailPendingR);
  const leadsWeek = parseCount(leadsWeekR);

  const eventsRaw = await safeJson(eventsByTypeR);
  const eventCounts: Record<string, number> = {};
  for (const e of eventsRaw) {
    eventCounts[e.event_type] = (eventCounts[e.event_type] || 0) + 1;
  }

  return Response.json({
    ok: true,
    total_leads: totalLeads,
    leads_week: leadsWeek,
    total_events: totalEvents,
    emails_pending: emailsPending,
    event_breakdown: eventCounts,
    leads_recent: leadsRecent,
    ts: new Date().toISOString(),
  });
}
