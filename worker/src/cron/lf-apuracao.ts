/**
 * lf-apuracao.ts — Três Trevo Worker
 * Cron semanal: busca resultado da Loteria Federal + dispara apuração automática
 *
 * Schedule: toda sexta-feira às 20:00 BRT (23:00 UTC) — logo após a extração
 * Adicionar em wrangler.toml:
 *   [[triggers.crons]]
 *   crons = ["0 23 * * 5"]
 *
 * Deploy: copiar para worker/src/cron/lf-apuracao.ts
 */

import type { Env } from '../types';

interface PremioLF {
  ordem: number;
  valor: string;
  numeroConcurso: number;
}

interface ResultadoLF {
  numero: number;        // número do concurso
  dataApuracao: string;  // "dd/mm/yyyy"
  listaDezenas: string[];
  listaRateioPremio: PremioLF[];
  // Loteria Federal usa listaDezenas para os prêmios (5 números de 5 dígitos)
  valorEstimadoProximoConcurso?: number;
}

// ─── Buscar último resultado da Loteria Federal ───────────────────────────────
async function buscarResultadoLF(): Promise<ResultadoLF | null> {
  // API oficial da Caixa (endpoint não-oficial estável)
  const url = 'https://servicebus2.caixa.gov.br/portaldeloterias/api/federal/';

  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Accept: 'application/json',
      },
      cf: { cacheTtl: 300 },
    } as RequestInit);

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return (await resp.json()) as ResultadoLF;
  } catch (err) {
    console.error('[lf-cron] falha ao buscar resultado:', err);
    return null;
  }
}

// ─── Handler do cron ──────────────────────────────────────────────────────────
export async function handleCronLF(env: Env): Promise<void> {
  console.log('[lf-cron] iniciando verificação semanal');

  // Buscar draw aberto
  const drawsResp = await fetch(
    `${env.SUPABASE_URL}/rest/v1/draws?status=eq.open&select=id,titulo,lf_concurso`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    }
  );
  const draws = (await drawsResp.json()) as any[];

  if (!draws.length) {
    console.log('[lf-cron] nenhum draw aberto — nada a fazer');
    return;
  }

  const draw = draws[0];

  // Buscar resultado LF
  const resultado = await buscarResultadoLF();
  if (!resultado) {
    await notificarFalhaCron(env, 'Não foi possível buscar resultado da Loteria Federal');
    return;
  }

  // Verificar se já apuramos este concurso
  if (draw.lf_concurso === resultado.numero) {
    console.log(`[lf-cron] concurso #${resultado.numero} já processado`);
    return;
  }

  // Extrair os 5 prêmios (valores como número inteiro para calcular unidades)
  // A API retorna listaDezenas como strings de 5 dígitos: ["12345", "23456", ...]
  if (!resultado.listaDezenas || resultado.listaDezenas.length < 5) {
    await notificarFalhaCron(env, `Resultado incompleto: ${JSON.stringify(resultado.listaDezenas)}`);
    return;
  }

  const premios = resultado.listaDezenas.slice(0, 5).map((d) => parseInt(d, 10));

  // Chamar endpoint de apuração
  const apuracaoResp = await fetch(
    `${env.SUPABASE_URL}/rest/v1/rpc/apurar_sorteio_lf`,
    {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_draw_id: draw.id,
        p_lf_concurso: resultado.numero,
        p_premios: premios,
        p_testemunha_1: 'Caixa Econômica Federal',
        p_testemunha_2: 'Sistema Automático Três Trevo',
        p_certificado: `CRON-AUTO-${resultado.numero}`,
      }),
    }
  );

  const apuracao = (await apuracaoResp.json()) as any;

  if (!apuracao.ok) {
    await notificarFalhaCron(env, `Apuração falhou: ${apuracao.erro}`);
    return;
  }

  // Notificar Dias sobre sucesso
  if (env.RESEND_API_KEY) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'sistema@3trevo.com.br',
        to: 'rogerio.kbhal@gmail.com',
        subject: `[Três Trevo] ✦ Apuração automática — LF #${resultado.numero}`,
        html: `<p>Apuração automática concluída via cron semanal.</p>
<ul>
  <li>Concurso LF: <strong>#${resultado.numero}</strong> (${resultado.dataApuracao})</li>
  <li>Prêmios: ${premios.join(', ')}</li>
  <li>Cota vencedora: <strong>${apuracao.cota_vencedora}</strong></li>
  <li>Vencedor: ${apuracao.winner_email ?? 'sem vencedor (cota não emitida)'}</li>
  <li>Hash: <code>${apuracao.hash_evidencia}</code></li>
</ul>
<p>
  ${apuracao.winner_email
    ? '✅ Email de premiação enviado ao vencedor.'
    : '⚠️ Nenhuma cota correspondente encontrada. Verificar regulamento de aproximação.'
  }
</p>
<p><a href="https://3trevo.com.br/admin.html">Painel admin →</a></p>`,
      }),
    }).catch(() => {});
  }

  console.log(`[lf-cron] apuração concluída — cota ${apuracao.cota_vencedora} — concurso ${resultado.numero}`);
}

// ─── Notificação de falha no cron ─────────────────────────────────────────────
async function notificarFalhaCron(env: Env, motivo: string): Promise<void> {
  console.error('[lf-cron] FALHA:', motivo);
  if (!env.RESEND_API_KEY) return;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'sistema@3trevo.com.br',
      to: 'rogerio.kbhal@gmail.com',
      subject: '[ALERTA] Falha no cron de apuração automática',
      html: `<p><strong>Motivo:</strong> ${motivo}</p>
<p>Ação necessária: fazer apuração manualmente via painel admin.</p>
<p><a href="https://3trevo.com.br/admin.html#apuracao">Abrir painel →</a></p>`,
    }),
  }).catch(() => {});
}
