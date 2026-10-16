/**
 * forge-webhook.ts — Três Trevo Worker
 * Recebe o pacote HMAC-assinado do tr3vo-forge e o transforma em PROPOSTA de
 * publicação no idioma da obra (spec docs/specs/publicacao-por-idioma-v2.md).
 * Nunca publica: o melhor resultado é `pronto_para_aprovacao`, e o dono aprova
 * no painel (D3). Fora das condições de R4, rascunho com o motivo escrito (R5).
 *
 * POST /api/webhook/forge-delivery
 */

import type { Env } from '../types';
import type { Cotacao } from '../guardiao/engine';
import { emailDono } from '../notify';
import { pacoteSchema } from '../publicacao/pacote';
import { montarProposta, moedasEstrangeiras, registroDe } from '../publicacao/proposta';
import { buscarPtax } from '../publicacao/ptax';
import { bancoSupabase, type Banco } from '../publicacao/banco';

// ponytail: comparação hex constant-time duplicada em checkout.ts — sem util
// compartilhado pra 2 call sites, per CLAUDE.md ("prefer editing existing files")
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function assinaturaValida(body: string, sigHeader: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const expected = `sha256=${[...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  return timingSafeEqualHex(sigHeader, expected);
}

export interface Dependencias {
  banco?: Banco;
  ptax?: typeof buscarPtax;
  hoje?: string;
  avisar?: (assunto: string, texto: string) => Promise<void>;
}

// Já decidido pelo dono: reenvio do forge não mexe (R9, N5). Recusado pode voltar
// como proposta nova — continua precisando de aprovação.
const ESTADOS_FIXOS = new Set(['publicado', 'despublicado']);

export async function handleForgeDelivery(request: Request, env: Env, dep: Dependencias = {}): Promise<Response> {
  if (!env.FORGE_WEBHOOK_SECRET) {
    console.error('[forge-webhook] FORGE_WEBHOOK_SECRET ausente — rejeitando');
    return new Response('Service Unavailable', { status: 503 });
  }

  // R4.1 / N4: assinatura antes de ler qualquer coisa do corpo.
  const body = await request.text();
  const sigHeader = request.headers.get('X-Webhook-Signature') ?? '';
  if (!(await assinaturaValida(body, sigHeader, env.FORGE_WEBHOOK_SECRET))) {
    return new Response('Unauthorized', { status: 401 });
  }

  let bruto: unknown;
  try { bruto = JSON.parse(body); } catch { return Response.json({ ok: false, erro: 'json_invalido' }, { status: 400 }); }
  if ((bruto as { status?: unknown })?.status !== 'complete') {
    return Response.json({ ok: true, ignorado: (bruto as { status?: unknown })?.status ?? null });
  }
  const lido = pacoteSchema.safeParse(bruto);
  if (!lido.success) {
    const detalhe = lido.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    console.error('[forge-webhook] pacote incompleto:', detalhe);
    return Response.json({ ok: false, erro: 'pacote_incompleto', detalhe }, { status: 422 });
  }
  const pkg = lido.data;

  // N3: reprovado no portão (qualidade ou idioma) não vira proposta nem rascunho.
  if (!pkg.qualidade.aprovado || pkg.qualidade.motivos.length) {
    console.error(`[forge-webhook] ${pkg.projectId} reprovado no portão:`, pkg.qualidade.motivos);
    return Response.json({ ok: false, erro: 'reprovado_no_portao', motivos: pkg.qualidade.motivos }, { status: 422 });
  }

  const banco = dep.banco ?? bancoSupabase(env);
  const hoje = dep.hoje ?? new Date().toISOString().slice(0, 10);
  const avisar = dep.avisar ?? ((assunto: string, texto: string) => emailDono(env, assunto, texto));

  try {
    const atual = await banco.proposta(pkg.projectId);
    if (atual && ESTADOS_FIXOS.has(atual.estado)) {
      await banco.registrar(registroDe(atual, 'reenvio_ignorado', 'forge', `reenvio do forge com o livro ${atual.estado}`));
      return Response.json({ ok: true, ignorado: atual.estado, slug: atual.slug });
    }

    const cotacoes: Record<string, Cotacao> = {};
    for (const moeda of moedasEstrangeiras(pkg)) {
      const c = await (dep.ptax ?? buscarPtax)(moeda, hoje);
      if (!c) continue;
      cotacoes[moeda] = c;
      await banco.gravarCotacao(moeda, c);
    }

    const proposta = montarProposta(pkg, await banco.parametros(), cotacoes, hoje);
    // Slug estável: reenvio com título diferente não cria outro produto (N5).
    if (atual) proposta.slug = atual.slug;
    if (!(await banco.salvarProposta(proposta))) {
      return Response.json({ ok: true, ignorado: 'decidido_pelo_dono', slug: proposta.slug });
    }
    const pronta = proposta.estado === 'pronto_para_aprovacao';
    await banco.registrar(registroDe(proposta, pronta ? 'proposta' : 'rascunho', 'forge'));

    // R8: aviso curto ao dono. Falha no aviso não desfaz a proposta.
    await avisar(
      pronta ? `Livro pronto para aprovação: ${proposta.titulo}` : `Livro em rascunho: ${proposta.titulo}`,
      pronta
        ? `${proposta.titulo} (${proposta.idioma}) — preço proposto R$ ${proposta.preco?.toFixed(2)}. Aprove ou recuse no painel.`
        : `${proposta.titulo} (${proposta.idioma}) ficou em rascunho: ${proposta.motivos.join('; ')}`,
    ).catch((e) => console.error('[forge-webhook] aviso ao dono falhou:', e));

    console.log(`[forge-webhook] ${proposta.slug}: ${proposta.estado}`);
    return Response.json({ ok: true, slug: proposta.slug, estado: proposta.estado, motivos: proposta.motivos });
  } catch (err) {
    console.error('[forge-webhook] falha ao gravar proposta:', err);
    return Response.json({ ok: false, erro: 'supabase_error' }, { status: 502 });
  }
}
