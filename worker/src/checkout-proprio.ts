// Checkout próprio — processamento de pedidos via gateway nativo.
//
// Gateway ainda não escolhido — depende da conta PJ ativa (spec 5B.1).
// Critérios: receber em conta PJ > compatível com Bling/NF-e > suporta split > taxa.
// Trocar de gateway = reescrever só `gatewayPlaceholder`; o handler genérico não muda.

import { type Env, sbFetch, registrarAuditoria, errorResponse, corsResponse } from './index';

export interface PedidoNormalizado {
  nome: string;
  email: string;
  telefone: string;
  ebook_slug: string;
  valor_pago: number;
  id_externo: string;
}

export interface CheckoutGateway {
  nome: string;
  // Recebe o corpo bruto (string) porque a verificação de assinatura precisa
  // do byte exato recebido — não do JSON já interpretado.
  verificarAssinatura(req: Request, env: Env, corpoBruto: string): Promise<boolean>;
  normalizarPedido(corpo: Record<string, any>): PedidoNormalizado;
}

// Placeholder: HMAC-SHA256 genérico. Quando o gateway for escolhido, substituir
// pelo esquema de assinatura real dele (cada gateway tem seu formato de header/hash).
export const gatewayPlaceholder: CheckoutGateway = {
  nome: 'placeholder',

  async verificarAssinatura(req, env, corpoBruto) {
    if (!env.CHECKOUT_WEBHOOK_SECRET) return false;
    const assinatura = req.headers.get('X-Checkout-Signature');
    if (!assinatura) return false;

    const chave = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(env.CHECKOUT_WEBHOOK_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const esperado = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(corpoBruto));
    const esperadoHex = [...new Uint8Array(esperado)].map(b => b.toString(16).padStart(2, '0')).join('');
    return assinatura === esperadoHex;
  },

  normalizarPedido(corpo) {
    // TODO: ajustar nomes de campo para o payload real do gateway escolhido.
    return {
      nome: corpo.nome || corpo.customer_name || 'Desconhecido',
      email: corpo.email || corpo.customer_email || '',
      telefone: corpo.telefone || corpo.customer_phone || '',
      ebook_slug: corpo.ebook_slug || corpo.product_slug || '',
      valor_pago: corpo.valor_pago ?? corpo.amount ?? 0,
      id_externo: corpo.id_externo || corpo.order_id || '',
    };
  },
};

// ── NF-e stub (Fase 5) ────────────────────────────────────────────
// NFE_ENABLED é lida da tabela config. Com false (padrão), insere linha
// com status pendente_certificado. Quando B2 (pfx+Bling) for resolvido:
// setar NFE_ENABLED=true no config e reprocessar pendentes.
async function nfeStub(env: Env, purchaseId: string): Promise<void> {
  try {
    const cfgR = await sbFetch(env, 'config?chave=eq.NFE_ENABLED&select=valor');
    const cfg   = await cfgR.json<{ valor: unknown }[]>();
    const enabled = cfg?.[0]?.valor === true;
    if (enabled) {
      // TODO Fase 5: chamar Bling OAuth2 + emitir NF-e real
      console.log('[NFe] NFE_ENABLED=true mas módulo ainda não implementado — pendente_certificado');
    }
    await sbFetch(env, 'notas_fiscais', {
      method:  'POST',
      body:    JSON.stringify({ purchase_id: purchaseId, status: 'pendente_certificado' }),
      headers: { Prefer: 'return=minimal' },
    });
  } catch (e) {
    console.error('[NFe] Erro ao criar stub:', e);
  }
}

// ── Resend email delivery (Fase 4) ───────────────────────────────
// Disparado após pedido registrado. Sem RESEND_API_KEY: log + skip (não bloqueia).
async function enviarEmailResend(env: Env, email: string, nome: string, ebookSlug: string, pedidoId: string): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.log(`[Resend] RESEND_API_KEY ausente — email não enviado para ${email}. Pedido ${pedidoId}.`);
    return;
  }
  try {
    const downloadUrl = `https://xfkepekffdyrtcgagwqo.supabase.co/functions/v1/get-download?pedido_id=${pedidoId}&slug=${ebookSlug}`;
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:    'Editora Três Trevo <sac@3trevo.com.br>',
        to:      [email],
        subject: 'Seu ebook está pronto — Três Trevo',
        html: `<p>Olá${nome ? ', ' + nome : ''}!</p>
<p>Obrigado pela sua compra. Seu ebook está disponível para download:</p>
<p><a href="${downloadUrl}" style="background:#1a4a2e;color:#f5f0e8;padding:12px 24px;text-decoration:none;display:inline-block">Baixar ebook →</a></p>
<p style="color:#666;font-size:13px">O link expira em 72h e permite até 3 downloads. Acesse também sua <a href="https://www.3trevo.com.br/area-cliente.html">Área do Cliente</a> a qualquer momento.</p>
<p style="color:#999;font-size:12px">Editora Três Trevo · sac@3trevo.com.br</p>`,
      }),
    });
    if (resp.ok) {
      console.log(`[Resend] Email enviado para ${email} pedido=${pedidoId}`);
    } else {
      const err = await resp.text();
      console.error(`[Resend] Erro ao enviar para ${email}: ${err}`);
    }
  } catch (e) {
    console.error('[Resend] Exceção:', e);
  }
}

// Handler genérico: registra o pedido via RPC `upsert_cliente_pedido`.
// A tabela `pedidos` e tudo que depende dela (cotas, draw_entries) continuam
// funcionando sem alteração na troca de gateway.
export async function handleCheckoutWebhook(env: Env, req: Request, gateway: CheckoutGateway): Promise<Response> {
  const corpoBruto = await req.text();

  const assinaturaValida = await gateway.verificarAssinatura(req, env, corpoBruto);
  if (!assinaturaValida) {
    console.warn(`Webhook checkout (${gateway.nome}): assinatura inválida`);
    return errorResponse('Não autorizado.', 401);
  }

  let corpo: Record<string, any>;
  try {
    corpo = JSON.parse(corpoBruto);
  } catch {
    return errorResponse('Corpo da requisição não é JSON válido.', 400);
  }

  const pedido = gateway.normalizarPedido(corpo);
  if (!pedido.email || !pedido.ebook_slug) {
    console.error(`Webhook checkout (${gateway.nome}): campos obrigatórios ausentes`, {
      email: pedido.email,
      ebook_slug: pedido.ebook_slug,
    });
    return errorResponse('Campos obrigatórios: email e ebook_slug.', 400);
  }

  const rpc = await sbFetch(env, 'rpc/upsert_cliente_pedido', {
    method: 'POST',
    body: JSON.stringify({
      p_nome: pedido.nome,
      p_email: pedido.email,
      p_telefone: pedido.telefone,
      p_ebook_slug: pedido.ebook_slug,
      p_valor_pago: pedido.valor_pago,
      p_id_externo: pedido.id_externo,
    }),
  });
  const resultado = await rpc.json<any>();
  if (!resultado.ok) {
    console.error('Erro ao registrar pedido:', resultado.erro);
    return errorResponse('Erro ao registrar pedido: ' + resultado.erro, 500);
  }

  console.log('Pedido registrado (checkout próprio):', JSON.stringify(resultado));
  await registrarAuditoria(env, 'pedidos', 'INSERT', pedido.id_externo, null, {
    email: pedido.email,
    ebook_slug: pedido.ebook_slug,
    valor_pago: pedido.valor_pago,
    novo: resultado.novo_pedido,
    gateway: gateway.nome,
  });

  // Fase 4 — Resend + Fase 5 — NF-e stub (não bloqueiam resposta ao gateway)
  if (resultado.novo_pedido) {
    const pedidoId = resultado.pedido_id as string ?? '';
    void enviarEmailResend(env, pedido.email, pedido.nome, pedido.ebook_slug, pedidoId);
    void nfeStub(env, pedidoId);
  }

  return corsResponse({
    ok: true,
    novo_pedido: resultado.novo_pedido,
    pedido_id: resultado.pedido_id,
    mensagem: resultado.novo_pedido ? 'Pedido registrado com sucesso.' : 'Pedido já existia — ignorado (idempotência).',
  });
}
