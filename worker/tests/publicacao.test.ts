// worker/tests/publicacao.test.ts
// Critérios de aceite da spec docs/specs/publicacao-por-idioma-v2.md (§7), um teste
// por critério, rodando os handlers reais (webhook do forge e painel do dono) com
// banco em memória e o motor guardiao 0.4.0 vendido.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleForgeDelivery } from '../src/routes/forge-webhook';
import { handleAdminPublicacaoAcao, APROVACOES_PARA_REAVALIAR } from '../src/routes/admin-publicacao';
import { custosDe, type Parametro } from '../src/publicacao/proposta';
import type { Env } from '../src/types';
import { bancoMemoria } from './helpers/banco-memoria';

const PID = '5f388d27-fb17-4a19-903d-212723a8b9c0';
const PID_EN = '7a1e0c55-3b2d-4f6e-9a8b-0c1d2e3f4a5b';
const HOJE = '2026-10-14';
const SEGREDO = 'wh';
const USD = { taxa: 5.4, data: '2026-10-13', fonte: 'BCB PTAX — boletim de fechamento, cotação de venda' };

const PARAMS: Parametro[] = [
  { chave: 'variavel_por_exemplar', valor: 0.5, estado: 'medido', fonte: 'custos do forge' },
  { chave: 'taxa_pagamento_pct', valor: 5, estado: 'estimado', fonte: 'teste' },
  { chave: 'imposto_pct', valor: 6, estado: 'medido', fonte: 'teste' },
  { chave: 'estorno_pct', valor: 1, estado: 'estimado', fonte: 'teste' },
  { chave: 'fixo_mensal', valor: 100, estado: 'medido', fonte: 'teste' },
];
const semParam = (chave: string) => PARAMS.filter((p) => p.chave !== chave);
const comParam = (chave: string, valor: number) => PARAMS.map((p) => (p.chave === chave ? { ...p, valor } : p));

const comp = (preco: number, extra: Record<string, unknown> = {}) => ({
  titulo: `c${preco}`, preco, moeda: 'BRL', paginas: 100, genero: 'financas', genero_por: 'consulta', idioma: 'pt-BR',
  url: `https://www.amazon.com.br/dp/${preco}`, coletadoEm: '2026-10-01', evidencia: `R$ ${preco}`, ...extra,
});
const CINCO_BR = [9.9, 14.9, 19.9, 24.9, 29.9].map((p) => comp(p)); // p25 14,90 · mediana 19,90 · p75 24,90
const CINCO_US = [2.99, 3.99, 4.99, 5.99, 6.99].map((p) =>
  comp(p, { moeda: 'USD', idioma: 'en-US', url: `https://www.amazon.com/dp/${p}`, evidencia: `$${p}` }));

function pacote(extra: Record<string, unknown> = {}) {
  return {
    projectId: PID, status: 'complete', idioma: 'pt-BR', titulo: 'Finanças sem Mistério',
    descricao: 'Guia prático.', parentProjectId: null,
    qualidade: { aprovado: true, motivos: [] },
    tamanho: { palavras: 25000, paginas_estimadas: 100, regra: '250 palavras por página' },
    mercado: { estado: 'coletado', loja: 'amazon.com.br', coletadoEm: '2026-10-01', consultas: ['q'], comparaveis: CINCO_BR, descartados: [] },
    r2Path: `drafts/${PID}/`, idiomas: ['pt-BR'], idiomasDisponiveis: [],
    arquivos: [`epub/${PID}/financas.epub`], summary: 'Obra "Finanças sem Mistério"', timestamp: '2026-10-14T00:00:00.000Z',
    ...extra,
  };
}
const pacoteEn = (extra: Record<string, unknown> = {}) => pacote({
  projectId: PID_EN, idioma: 'en-US', titulo: 'Money Without Mystery', descricao: 'A practical guide.',
  parentProjectId: PID, arquivos: [`epub/${PID_EN}/money.epub`],
  mercado: { estado: 'coletado', loja: 'amazon.com', coletadoEm: '2026-10-01', consultas: ['q'], comparaveis: CINCO_US, descartados: [] },
  ...extra,
});

async function assinar(corpo: string, segredo = SEGREDO) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(corpo));
  return `sha256=${[...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

const env = { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'k', FORGE_WEBHOOK_SECRET: SEGREDO } as unknown as Env;

function cenario(parametros: Parametro[] = PARAMS, ptax: Record<string, typeof USD | null> = { USD }) {
  const mem = bancoMemoria(parametros);
  const avisos: string[] = [];
  const avisar = async (assunto: string) => { avisos.push(assunto); };
  const dep = { banco: mem.banco, hoje: HOJE, avisar, ptax: async (m: string) => ptax[m] ?? null };

  async function entregar(pkg: object, segredo = SEGREDO) {
    const corpo = JSON.stringify(pkg);
    const r = await handleForgeDelivery(new Request('https://api.test/api/webhook/forge-delivery', {
      method: 'POST', body: corpo, headers: { 'X-Webhook-Signature': await assinar(corpo, segredo) },
    }), env, dep);
    return { status: r.status, corpo: (await r.json().catch(() => null)) as any };
  }
  async function decidir(id: string, acao: string, body: object) {
    const r = await handleAdminPublicacaoAcao(new Request(`https://api.test/api/admin/publicacao/${id}/${acao}`, {
      method: 'POST', body: JSON.stringify(body), headers: { Authorization: 'Bearer sessao' },
    }), env, id, acao, { banco: mem.banco, avisar });
    return { status: r.status, corpo: (await r.json().catch(() => null)) as any };
  }
  return { ...mem, avisos, entregar, decidir };
}

// Sessão admin válida para o verificarToken real (consulta admin_sessoes).
function sessaoAdminValida() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).includes('admin_sessoes')) {
      return Response.json([{ expira_em: new Date(Date.now() + 3600_000).toISOString() }]);
    }
    throw new Error(`rede inesperada no teste: ${url}`);
  }));
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('publicação por idioma — critérios de aceite (spec v2 §7)', () => {
  it('1. pt-BR aprovado, 5 comparáveis, imposto definido → pronto para aprovação com o preço do motor, não publicado', async () => {
    const c = cenario();
    const r = await c.entregar(pacote());
    expect(r.status).toBe(200);
    const p = c.propostas.get(PID)!;
    expect(p.estado).toBe('pronto_para_aprovacao');
    expect(p.idioma).toBe('pt-BR');
    expect(p.preco).toBe(14.9); // sem nota de qualidade: início da faixa p25–mediana
    expect(p.precificacao?.exige_aprovacao_do_dono).toBe(true);
    expect(c.loja.size).toBe(0);
    expect(c.registros.map((x) => x.evento)).toEqual(['proposta']);
    expect(c.avisos[0]).toMatch(/pronto para aprovação/);
  });

  it('2. o dono aprova → publicado; registro com aprovação, preço e evidência', async () => {
    sessaoAdminValida();
    const c = cenario();
    await c.entregar(pacote());
    const r = await c.decidir(PID, 'aprovar', { preco: 14.9 });
    expect(r.status).toBe(200);
    expect(c.propostas.get(PID)!.estado).toBe('publicado');
    const linha = [...c.loja.values()][0]!;
    expect(linha).toMatchObject({ preco: 14.9, ativo: true, idioma: 'pt-BR', arquivo_url: `forge:${PID}/epub` });
    const aprov = c.registros.find((x) => x.evento === 'aprovacao')!;
    expect(aprov.preco).toBe(14.9);
    expect(aprov.decidido_por).toMatch(/dono/);
    expect((aprov.comparaveis as unknown[]).length).toBe(5);
    expect(aprov.componentes_liquido).toMatchObject({ valorPago: 14.9, liquido: expect.any(Number) });
    expect(aprov.versao_guardiao).toBe('0.4.0');
    expect(c.registros.map((x) => x.evento)).toContain('publicacao');
  });

  it('2b. aprovação vale para aquele preço: preço diferente não publica', async () => {
    sessaoAdminValida();
    const c = cenario();
    await c.entregar(pacote());
    const r = await c.decidir(PID, 'aprovar', { preco: 19.9 });
    expect(r.status).toBe(409);
    expect(c.propostas.get(PID)!.estado).toBe('pronto_para_aprovacao');
    expect(c.loja.size).toBe(0);
  });

  it('3. 4 comparáveis → rascunho, "mercado insuficiente"', async () => {
    const c = cenario();
    await c.entregar(pacote({ mercado: { ...pacote().mercado, comparaveis: CINCO_BR.slice(0, 4) } }));
    const p = c.propostas.get(PID)!;
    expect(p.estado).toBe('rascunho');
    expect(p.preco).toBeNull();
    expect(p.motivos.join(' ')).toMatch(/mercado insuficiente/);
    expect(c.registros[0]!.evento).toBe('rascunho');
    expect(c.avisos[0]).toMatch(/rascunho/);
  });

  it('4. piso acima do p75 → rascunho, "não cobre o custo mínimo"', async () => {
    const c = cenario(comParam('variavel_por_exemplar', 2)); // piso 40 > p75 24,90
    await c.entregar(pacote());
    expect(c.propostas.get(PID)!.estado).toBe('rascunho');
    expect(c.propostas.get(PID)!.motivos.join(' ')).toMatch(/não cobre o custo mínimo/);
  });

  it('5. imposto não informado → rascunho, "líquido distribuível indefinido"', async () => {
    const c = cenario(semParam('imposto_pct'));
    await c.entregar(pacote());
    expect(c.propostas.get(PID)!.estado).toBe('rascunho');
    expect(c.propostas.get(PID)!.motivos.join(' ')).toMatch(/líquido distribuível indefinido: falta imposto_pct/);
  });

  it('6. en-US → produto separado, ligado à obra-mãe, só na biblioteca en; BRL com referência USD e PTAX gravadas', async () => {
    sessaoAdminValida();
    const c = cenario();
    await c.entregar(pacote());
    await c.entregar(pacoteEn());
    const en = c.propostas.get(PID_EN)!;
    expect(en.estado).toBe('pronto_para_aprovacao');
    expect(en.parent_project_id).toBe(PID);
    expect(en.slug).not.toBe(c.propostas.get(PID)!.slug);
    expect(c.cotacoes).toEqual([{ moeda: 'USD', ...USD }]);
    const usado = en.precificacao!.mercado.usados[0]!;
    expect(usado.referencia).toEqual({ preco: 2.99, moeda: 'USD' });
    expect(usado.conversao).toMatchObject({ taxa: 5.4, data: '2026-10-13', de: 'USD', para: 'BRL' });
    await c.decidir(PID_EN, 'aprovar', { preco: en.preco });
    const linhas = [...c.loja.values()];
    expect(linhas.map((l) => l.idioma)).toEqual(['en-US']); // só a versão en foi aprovada
    const reg = c.registros.find((x) => x.evento === 'aprovacao')!;
    expect(reg.cotacoes).toMatchObject({ USD: { taxa: 5.4, data: '2026-10-13' } });
  });

  it('7. comparáveis en sem cotação PTAX válida → rascunho', async () => {
    const c = cenario(PARAMS, { USD: null });
    await c.entregar(pacoteEn());
    const en = c.propostas.get(PID_EN)!;
    expect(en.estado).toBe('rascunho');
    expect(en.motivos.join(' ')).toMatch(/cotação PTAX indisponível para USD/);
  });

  it('8. pacote reprovado no portão (ex.: título en em português) → nenhuma proposta', async () => {
    const c = cenario();
    const r = await c.entregar(pacoteEn({ qualidade: { aprovado: false, motivos: ['título não está em en-US'] } }));
    expect(r.status).toBe(422);
    expect(c.propostas.size).toBe(0);
    expect(c.registros).toEqual([]);
  });

  it('9. pacote reenviado → nenhum produto duplicado; aprovação anterior preservada', async () => {
    sessaoAdminValida();
    const c = cenario();
    await c.entregar(pacote());
    await c.decidir(PID, 'aprovar', { preco: 14.9 });
    const r = await c.entregar(pacote({ titulo: 'Outro Título', mercado: { ...pacote().mercado, comparaveis: CINCO_BR.slice(0, 4) } }));
    expect(r.corpo.ignorado).toBe('publicado');
    expect(c.propostas.size).toBe(1);
    expect(c.loja.size).toBe(1);
    expect(c.propostas.get(PID)).toMatchObject({ estado: 'publicado', preco: 14.9, titulo: 'Finanças sem Mistério' });
    expect(c.registros.at(-1)!.evento).toBe('reenvio_ignorado');
  });

  it('9b. reenvio de proposta ainda pendente recalcula sem trocar o slug', async () => {
    const c = cenario();
    await c.entregar(pacote());
    const slug = c.propostas.get(PID)!.slug;
    await c.entregar(pacote({ titulo: 'Título Revisado' }));
    expect(c.propostas.size).toBe(1);
    expect(c.propostas.get(PID)!.slug).toBe(slug);
  });

  it('10. despublicado e pacote reenviado → continua fora do ar', async () => {
    sessaoAdminValida();
    const c = cenario();
    await c.entregar(pacote());
    await c.decidir(PID, 'aprovar', { preco: 14.9 });
    const d = await c.decidir(PID, 'despublicar', { motivo: 'erro na capa' });
    expect(d.status).toBe(200);
    expect([...c.loja.values()][0]!.ativo).toBe(false);
    await c.entregar(pacote());
    expect(c.propostas.get(PID)!.estado).toBe('despublicado');
    expect([...c.loja.values()][0]!.ativo).toBe(false);
    expect(c.registros.find((x) => x.evento === 'despublicacao')!.motivo).toBe('erro na capa');
  });

  it('11. assinatura errada → nada criado nem alterado', async () => {
    const c = cenario();
    const r = await c.entregar(pacote(), 'segredo-errado');
    expect(r.status).toBe(401);
    expect(c.propostas.size).toBe(0);
    expect(c.registros).toEqual([]);
  });

  it('12. a loja grava referência interna do forge, nunca o link público', async () => {
    const c = cenario();
    await c.entregar(pacote());
    expect(c.propostas.get(PID)!.arquivo_ref).toBe(`forge:${PID}/epub`);
    expect(JSON.stringify([...c.propostas.values()])).not.toContain('workers.dev');
  });

  it(`13. ${APROVACOES_PARA_REAVALIAR} aprovados sem falha crítica → um aviso para reavaliar; nada é automatizado`, async () => {
    sessaoAdminValida();
    const c = cenario();
    for (let i = 0; i < APROVACOES_PARA_REAVALIAR + 1; i++) {
      const id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
      await c.entregar(pacote({ projectId: id, arquivos: [`epub/${id}/x.epub`] }));
      expect(c.propostas.get(id)!.estado).toBe('pronto_para_aprovacao'); // nunca publicado sozinho
      await c.decidir(id, 'aprovar', { preco: 14.9 });
    }
    expect(c.registros.filter((x) => x.evento === 'aviso_reavaliacao')).toHaveLength(1);
    expect(c.avisos.filter((a) => /Reavaliar/.test(a))).toHaveLength(1);
  });
});

describe('publicação por idioma — fronteiras', () => {
  it('pacote no formato antigo (sem preço, idioma, mercado) é recusado sem gravar', async () => {
    const c = cenario();
    const r = await c.entregar({ projectId: PID, status: 'complete', arquivos: [], summary: 'x', timestamp: '2026-10-13T00:00:00Z' });
    expect(r.status).toBe(422);
    expect(r.corpo.erro).toBe('pacote_incompleto');
    expect(c.propostas.size).toBe(0);
  });

  it('idioma sem biblioteca na loja (de-DE) → rascunho com motivo', async () => {
    const c = cenario();
    await c.entregar(pacote({ idioma: 'de-DE' }));
    expect(c.propostas.get(PID)!.motivos[0]).toMatch(/de-DE sem biblioteca/);
  });

  it('mercado não coletado → rascunho com o motivo do forge', async () => {
    const c = cenario();
    await c.entregar(pacote({ mercado: { estado: 'nao_coletado', motivo: 'sem TAVILY_API_KEY', coletadoEm: HOJE, consultas: [], comparaveis: [], descartados: [] } }));
    expect(c.propostas.get(PID)!.motivos[0]).toMatch(/mercado não coletado pelo forge: sem TAVILY_API_KEY/);
  });

  it('recusa exige motivo e fica registrada; reenvio volta como proposta nova (ainda pendente)', async () => {
    sessaoAdminValida();
    const c = cenario();
    await c.entregar(pacote());
    expect((await c.decidir(PID, 'recusar', {})).status).toBe(400);
    expect((await c.decidir(PID, 'recusar', { motivo: 'título fraco' })).status).toBe(200);
    expect(c.registros.at(-1)).toMatchObject({ evento: 'recusa', motivo: 'título fraco' });
    await c.entregar(pacote());
    expect(c.propostas.get(PID)!.estado).toBe('pronto_para_aprovacao');
    expect(c.loja.size).toBe(0);
  });

  it('sem sessão admin, nenhuma decisão', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json([])));
    const c = cenario();
    await c.entregar(pacote());
    const r = await c.decidir(PID, 'aprovar', { preco: 14.9 });
    expect(r.status).toBe(401);
    expect(c.loja.size).toBe(0);
  });

  it('parâmetro do dono vira custo do motor com a origem (medido/estimado)', () => {
    const c = custosDe(PARAMS);
    expect(c.impostoPct).toBe(6);
    expect(c.origens!.taxaPagamentoPct).toEqual({ estado: 'estimado', fonte: 'teste' });
  });
});

describe('PTAX e biblioteca nativa', () => {
  it('PTAX: último boletim de fechamento, taxa de venda, com data e fonte', async () => {
    const { buscarPtax } = await import('../src/publicacao/ptax');
    const chamadas: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      chamadas.push(url);
      return Response.json({ value: [
        { cotacaoVenda: 5.41, dataHoraCotacao: '2026-10-13 13:05:00.1', tipoBoletim: 'Fechamento' },
        { cotacaoVenda: 5.39, dataHoraCotacao: '2026-10-12 10:00:00.1', tipoBoletim: 'Abertura' },
        { cotacaoVenda: 5.38, dataHoraCotacao: '2026-10-10 13:05:00.1', tipoBoletim: 'Fechamento' },
      ] });
    }));
    expect(await buscarPtax('USD', HOJE)).toEqual({ taxa: 5.41, data: '2026-10-13', fonte: expect.stringMatching(/BCB PTAX/) });
    expect(chamadas[0]).toContain("@moeda='USD'");
    expect(chamadas[0]).toContain("@dataInicial='10-07-2026'");
  });

  it('PTAX: consulta falhou ou moeda inválida → null (nunca taxa suposta)', async () => {
    const { buscarPtax } = await import('../src/publicacao/ptax');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('erro', { status: 500 })));
    expect(await buscarPtax('USD', HOJE)).toBeNull();
    expect(await buscarPtax("USD'&x", HOJE)).toBeNull();
  });

  it('catálogo público: lista por idioma (padrão pt-BR), slug acha em qualquer idioma, idioma desconhecido recusado', async () => {
    const worker = (await import('../src/index')).default;
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { urls.push(String(url)); return Response.json([]); }));
    const pedir = (q: string) => worker.fetch(new Request(`https://api.test/api/public/catalogo${q}`), env, {} as ExecutionContext);
    expect((await pedir('')).status).toBe(200);
    expect((await pedir('?idioma=en-US')).status).toBe(200);
    expect((await pedir('?idioma=fr-FR')).status).toBe(400);
    expect((await pedir('?slug=money-without-mystery-7a1e0c55')).status).toBe(200);
    expect(urls[0]).toContain('idioma=eq.pt-BR');
    expect(urls[1]).toContain('idioma=eq.en-US');
    // checkout busca pelo slug: o livro en precisa ser achado sem informar o idioma
    expect(urls[2]).toContain('slug=eq.money-without-mystery-7a1e0c55');
    expect(urls[2]).not.toContain('idioma=eq.');
    expect(urls).toHaveLength(3);
  });
});

describe('catálogo antigo não fura a aprovação (N1/N2)', () => {
  function supabaseComLivroDoForge() {
    const escritas: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('admin_sessoes')) return Response.json([{ expira_em: new Date(Date.now() + 3600_000).toISOString() }]);
      if (init?.method === 'PATCH' || init?.method === 'POST') { escritas.push(u); return Response.json([{}]); }
      return Response.json([{ forge_project_id: PID, preco: 14.9, ativo: true }]);
    }));
    return escritas;
  }
  const put = (body: object) => new Request('https://api.test/x', { method: 'PUT', body: JSON.stringify(body), headers: { Authorization: 'Bearer s' } });

  it('mudar preço ou tirar do ar pelo catálogo → 409, nada escrito', async () => {
    const { handleAdminCatalogoUpdate, handleAdminCatalogoDelete } = await import('../src/routes/admin-catalog');
    const escritas = supabaseComLivroDoForge();
    expect((await handleAdminCatalogoUpdate(put({ preco: 9.9 }), env, 'livro-5f388d27')).status).toBe(409);
    expect((await handleAdminCatalogoUpdate(put({ ativo: false }), env, 'livro-5f388d27')).status).toBe(409);
    expect((await handleAdminCatalogoDelete(new Request('https://api.test/x', { method: 'DELETE', headers: { Authorization: 'Bearer s' } }), env, 'livro-5f388d27')).status).toBe(409);
    expect(escritas).toEqual([]);
  });

  it('editar a descrição com o formulário inteiro (mesmo preço e ativo) continua permitido', async () => {
    const { handleAdminCatalogoUpdate } = await import('../src/routes/admin-catalog');
    const escritas = supabaseComLivroDoForge();
    const r = await handleAdminCatalogoUpdate(put({ descricao: 'Nova sinopse', preco: 14.9, ativo: true }), env, 'livro-5f388d27');
    expect(r.status).toBe(200);
    expect(escritas.some((u) => u.includes('catalogo?slug=eq.livro-5f388d27'))).toBe(true);
  });
});
