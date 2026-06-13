// worker/src/apuracao.ts
// Fase 2 — apuração oficial pela Loteria Federal (Lei 5.768/71)
// Fórmula LF-UNIDADES-V1: dígito das unidades do 1º ao 5º prêmio, lidos de cima
// para baixo, formam a cota de 5 dígitos (00000–99999).
// numero_sorteado DEPRECIADO — este módulo não escreve nesse campo.

import { type Env, sbFetch, corsResponse, errorResponse } from './index';

interface ApuracaoPayload {
  draw_id: string;
  lf_concurso: number;
  lf_data_extracao: string; // YYYY-MM-DD
  lf_premios: number[];     // exatamente 5 prêmios da extração oficial
  certificado_numero?: string;
  testemunha_1?: string;
  testemunha_2?: string;
}

function derivarCota(premios: number[]): string {
  // Unidades de cada prêmio (1º ao 5º), concatenadas → cota de 5 dígitos
  return premios.slice(0, 5)
    .map(p => Math.abs(Math.round(p)) % 10)
    .join('');
}

async function sha256hex(payload: unknown): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify(payload));
  const buf  = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sbGet(env: Env, path: string): Promise<any[]> {
  const r = await sbFetch(env, path);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function sbPost(env: Env, path: string, body: unknown, prefer = 'return=representation'): Promise<any> {
  const r = await sbFetch(env, path, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { Prefer: prefer },
  });
  if (!r.ok) throw new Error(await r.text());
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}

async function sbPatch(env: Env, path: string, body: unknown): Promise<void> {
  const r = await sbFetch(env, path, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { Prefer: 'return=minimal' },
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function handleApuracao(env: Env, req: Request): Promise<Response> {
  const body = await req.json<Partial<ApuracaoPayload>>();
  const { draw_id, lf_concurso, lf_data_extracao, lf_premios, certificado_numero, testemunha_1, testemunha_2 } = body;

  if (!draw_id)                        return errorResponse('draw_id obrigatório.');
  if (!lf_concurso)                    return errorResponse('lf_concurso obrigatório.');
  if (!lf_data_extracao)               return errorResponse('lf_data_extracao obrigatório (YYYY-MM-DD).');
  if (!Array.isArray(lf_premios) || lf_premios.length !== 5) {
    return errorResponse('lf_premios deve ter exatamente 5 números.');
  }
  if (lf_premios.some(p => typeof p !== 'number' || p < 0)) {
    return errorResponse('lf_premios deve conter números inteiros positivos.');
  }

  // 1. Verificar que o sorteio existe e está aberto
  const draws = await sbGet(env, `draws?id=eq.${draw_id}&select=id,status,titulo`);
  if (!draws.length) return errorResponse('Rodada não encontrada.', 404);
  if (draws[0].status === 'drawn') return errorResponse('Rodada já apurada.', 409);

  // 2. Derivar cota vencedora
  const cota_vencedora = derivarCota(lf_premios);

  // 3. Atualizar draws com dados LF
  await sbPatch(env, `draws?id=eq.${draw_id}`, {
    lf_concurso,
    lf_data_extracao,
    lf_premios,
    cota_vencedora,
    formula_versao: 'LF-UNIDADES-V1',
    status: 'drawn',
  });

  // 4. Encontrar número emitido correspondente
  const cotaNum = parseInt(cota_vencedora, 10);
  const numeros = await sbGet(env, `draw_numbers?draw_id=eq.${draw_id}&numero=eq.${cotaNum}&select=id,user_id,numero`);

  let vencedor_user_id: string | null = null;
  let cota_emitida = false;

  if (numeros.length > 0) {
    vencedor_user_id = numeros[0].user_id;
    cota_emitida = true;

    // 5. Gravar vencedor em draw_winners
    await sbPost(env, 'draw_winners', {
      draw_id,
      user_id: vencedor_user_id,
      posicao: 1,
      cotas_total: 0, // será preenchido via consulta posterior se necessário
    }, 'return=minimal');
  }

  // 6. Hash de evidência para auditoria independente
  const payloadHash = await sha256hex({ draw_id, lf_concurso, lf_data_extracao, lf_premios, cota_vencedora, formula_versao: 'LF-UNIDADES-V1' });

  // 7. Registrar em draw_audits
  await sbPost(env, 'draw_audits', {
    draw_id,
    action:             'apuracao_lf',
    seed:               `LF-${lf_concurso}`,
    details:            { lf_premios, cota_vencedora, cota_emitida, formula: 'LF-UNIDADES-V1' },
    executed_by:        'admin',
    data_apuracao:      lf_data_extracao,
    lf_concurso,
    certificado_numero: certificado_numero || null,
    testemunha_1:       testemunha_1 || null,
    testemunha_2:       testemunha_2 || null,
    hash_evidencia:     payloadHash,
  }, 'return=minimal');

  console.log(`[APURACAO] draw=${draw_id} lf=${lf_concurso} cota=${cota_vencedora} emitida=${cota_emitida} hash=${payloadHash}`);

  // Notificar vencedor por email
  if (cota_emitida && vencedor_user_id && env.RESEND_API_KEY) {
    try {
      const perfilRows = await sbGet(env, `profiles?id=eq.${vencedor_user_id}&select=email,full_name`);
      const vencedorPerfil = perfilRows[0] as { email?: string; full_name?: string } | undefined;
      const drawRows = await sbGet(env, `draws?id=eq.${draw_id}&select=titulo`);
      const drawTitulo = (drawRows[0] as { titulo?: string } | undefined)?.titulo || draw_id;

      if (vencedorPerfil?.email) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.RESEND_API_KEY}` },
          body: JSON.stringify({
            from: 'Editora Tres Trevo <sac@3trevo.com.br>',
            to: [vencedorPerfil.email],
            subject: `Voce venceu o Programa Cultural — ${drawTitulo}`,
            html: `<p>Ola, ${vencedorPerfil.full_name || 'participante'}!</p><p>Sua cota <strong>${cota_vencedora}</strong> foi sorteada na rodada <strong>${drawTitulo}</strong> (Loteria Federal n. ${lf_concurso}).</p><p>Nossa equipe entrara em contato em breve para entregar o premio. Em caso de duvidas: sac@3trevo.com.br</p><p>Resultado auditavel publicamente em: https://www.3trevo.com.br/auditoria-sorteio.html</p>`,
          }),
        });
        console.log(`[APURACAO] email vencedor enviado para ${vencedorPerfil.email}`);
      }
    } catch (emailErr) {
      console.warn('[APURACAO] falha ao enviar email vencedor:', emailErr);
    }
  }

  return corsResponse({
    ok: true,
    draw_id,
    lf_concurso,
    cota_vencedora,
    cota_emitida,
    vencedor_user_id,
    hash_evidencia: payloadHash,
    aviso: cota_emitida ? null : 'Cota não emitida — aplicar regra de aproximação conforme regulamento.',
  });
}
