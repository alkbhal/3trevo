/**
 * nfe-emissao.ts — Três Trevo Worker
 * Cron horário: transforma cada pagamento aprovado (public.dados_fiscais) em NF-e pelo Bling.
 *
 * 1. Enfileira: toda linha de dados_fiscais ainda sem nota ganha uma linha em notas_fiscais
 *    (status pendente). Roda sempre, mesmo com a emissão desligada.
 * 2. Emite (só com NFE_ENABLED = "true", Bling conectado e BLING_NATUREZA_ID definido):
 *    pendente → criando → (POST /nfe) → (POST /nfe/{id}/enviar) → enviada → (GET /nfe/{id}) → emitida
 *
 * Nunca cria nota duplicada: com bling_id gravado, só reenvia/consulta. Se o Worker cair entre
 * o POST /nfe e a gravação do bling_id, a linha fica em "criando" e não é reprocessada sozinha
 * (conferir no Bling e mudar para pendente ou erro à mão).
 */

import type { Env } from '../types';
import { sb } from '../sb';
import { blingApi, blingConfigurado, configNFe, lerTokens, payloadNFe, BlingErro } from '../bling';

const MAX_TENTATIVAS = 5;
const LOTE = 20;
// situacao da NF-e no Bling v3
const AUTORIZADA = new Set([5, 6]); // 5 autorizada, 6 emitida DANFE
const RECUSADA = new Set([4, 9]);   // 4 rejeitada, 9 denegada

export interface Resumo { ativo: boolean; motivo?: string; enfileiradas: number; emitidas: number; enviadas: number; erros: number }

export async function handleNFeEmissao(env: Env): Promise<Resumo> {
  const resumo: Resumo = { ativo: false, enfileiradas: await enfileirar(env), emitidas: 0, enviadas: 0, erros: 0 };

  const cfg = configNFe(env);
  if (env.NFE_ENABLED !== 'true') return { ...resumo, motivo: 'NFE_ENABLED desligado' };
  if (!blingConfigurado(env) || !(await lerTokens(env))) return { ...resumo, motivo: 'Bling não conectado' };
  if (!cfg) return { ...resumo, motivo: 'BLING_NATUREZA_ID não definido' };
  resumo.ativo = true;

  const filaResp = await sb(env,
    `notas_fiscais?status=in.(pendente,erro,enviada)&tentativas=lt.${MAX_TENTATIVAS}` +
    `&dados_fiscais_id=not.is.null&order=created_at.asc&limit=${LOTE}&select=*,dados_fiscais(*)`
  );
  const fila = (await filaResp.json()) as any[];
  if (!Array.isArray(fila)) return { ...resumo, motivo: 'falha ao ler a fila' };

  for (const nota of fila) {
    try {
      const fim = await processarNota(env, nota, cfg);
      if (fim === 'emitida') resumo.emitidas++;
      else if (fim === 'enviada') resumo.enviadas++;
    } catch (e) {
      resumo.erros++;
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[nfe] nota ${nota.id}:`, msg);
      // Bling desconectado não é erro da nota: para o lote sem gastar tentativas
      if (e instanceof BlingErro && (msg === 'bling_desconectado' || e.status === 401)) {
        return { ...resumo, motivo: 'Bling desconectado: reconectar no painel' };
      }
      await atualizar(env, nota.id, {
        status: 'erro', error_message: msg.slice(0, 500), tentativas: (nota.tentativas ?? 0) + 1,
      });
    }
  }
  return resumo;
}

/** Cria a linha de notas_fiscais de cada pagamento que ainda não tem nota. Idempotente. */
async function enfileirar(env: Env): Promise<number> {
  const resp = await sb(env,
    'dados_fiscais?nf_emitida_em=is.null&order=criado_em.desc&limit=100&select=id,purchase_id'
  );
  const linhas = (await resp.json()) as any[];
  if (!Array.isArray(linhas) || linhas.length === 0) return 0;
  const ins = await sb(env, 'notas_fiscais?on_conflict=dados_fiscais_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify(linhas.map((l) => ({ dados_fiscais_id: l.id, purchase_id: l.purchase_id, status: 'pendente' }))),
  });
  if (!ins.ok) {
    console.error('[nfe] enfileirar falhou:', ins.status, await ins.text());
    return 0;
  }
  const novas = (await ins.json().catch(() => [])) as any[];
  return Array.isArray(novas) ? novas.length : 0;
}

async function processarNota(env: Env, nota: any, cfg: NonNullable<ReturnType<typeof configNFe>>): Promise<string> {
  const df = nota.dados_fiscais;
  if (!df) throw new Error('dados_fiscais ausente');

  if (!nota.bling_id) {
    const produto = await produtoDaCompra(env, df.purchase_id);
    if (produto === 'reembolsada') {
      await atualizar(env, nota.id, { status: 'cancelada', error_message: 'compra reembolsada antes da emissão' });
      return 'cancelada';
    }
    // trava a linha antes de falar com o Bling (só avança se ainda estiver no status lido)
    const trava = await sb(env, `notas_fiscais?id=eq.${nota.id}&status=eq.${nota.status}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'criando', updated_at: new Date().toISOString() }),
    });
    const travadas = (await trava.json().catch(() => [])) as any[];
    if (!Array.isArray(travadas) || travadas.length === 0) return 'ocupada';

    const criada = await blingApi(env, 'POST', '/nfe', payloadNFe(df, produto, cfg));
    const blingId = criada?.data?.id;
    if (!blingId) throw new Error('Bling não devolveu o id da nota');
    nota.bling_id = String(blingId);
    nota.status = 'pendente';
    await atualizar(env, nota.id, { bling_id: nota.bling_id, status: 'pendente' });
  }

  // nota com erro que já existe no Bling: consulta antes de reenviar (pode ter sido
  // autorizada depois, ou reenviada lá à mão)
  if (nota.status === 'erro') {
    const situacao = await consultar(env, nota, df);
    if (situacao !== 'enviada') return situacao;
  }

  if (nota.status !== 'enviada') {
    await blingApi(env, 'POST', `/nfe/${encodeURIComponent(nota.bling_id)}/enviar`);
    await atualizar(env, nota.id, { status: 'enviada', error_message: null });
  }

  return consultar(env, nota, df);
}

/** GET /nfe/{id}: grava número, chave e links quando a SEFAZ autoriza. */
async function consultar(env: Env, nota: any, df: any): Promise<string> {
  const d = (await blingApi(env, 'GET', `/nfe/${encodeURIComponent(nota.bling_id)}`))?.data ?? {};
  const situacao = Number(d.situacao);
  if (AUTORIZADA.has(situacao)) {
    const agora = new Date().toISOString();
    await atualizar(env, nota.id, {
      status: 'emitida',
      numero_nf: d.numero ? Number(d.numero) : null,
      ...(d.serie ? { serie: Number(d.serie) } : {}),
      chave_acesso: d.chaveAcesso || null,
      xml_url: d.xml || null,
      pdf_url: d.linkPDF || d.linkDanfe || null,
      emitida_em: agora,
      error_message: null,
    });
    await sb(env, `dados_fiscais?id=eq.${df.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ nf_numero: d.numero ? String(d.numero) : null, nf_emitida_em: agora }),
    });
    return 'emitida';
  }
  if (RECUSADA.has(situacao)) {
    // rejeição da SEFAZ pede correção de dado: sai da fila automática (tentativas no limite)
    await atualizar(env, nota.id, {
      status: 'erro', tentativas: MAX_TENTATIVAS,
      error_message: `SEFAZ ${situacao === 9 ? 'denegou' : 'rejeitou'} a nota no Bling (id ${nota.bling_id}); corrigir lá e reenviar`,
    });
    return 'erro';
  }
  return 'enviada'; // ainda processando na SEFAZ: consulta de novo na próxima hora
}

async function produtoDaCompra(env: Env, purchaseId: string | null): Promise<{ slug: string; titulo: string } | 'reembolsada'> {
  if (!purchaseId) throw new Error('pagamento sem compra registrada (purchase_id vazio)');
  const r = await sb(env, `purchases?id=eq.${purchaseId}&select=status,produto:product_id(slug,titulo)`);
  const [compra] = (await r.json()) as any[];
  if (!compra?.produto?.slug) throw new Error('produto da compra não encontrado');
  if (compra.status === 'refunded') return 'reembolsada';
  return { slug: compra.produto.slug, titulo: compra.produto.titulo || compra.produto.slug };
}

async function atualizar(env: Env, id: string, campos: Record<string, unknown>): Promise<void> {
  const r = await sb(env, `notas_fiscais?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ ...campos, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) console.error('[nfe] atualizar falhou:', id, r.status, await r.text());
}
