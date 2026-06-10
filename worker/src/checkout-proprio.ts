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

  return corsResponse({
    ok: true,
    novo_pedido: resultado.novo_pedido,
    pedido_id: resultado.pedido_id,
    mensagem: resultado.novo_pedido ? 'Pedido registrado com sucesso.' : 'Pedido já existia — ignorado (idempotência).',
  });
}
