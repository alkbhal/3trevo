/**
 * perfil.ts — cadastro opcional do cliente (nome, telefone, CPF).
 * Nada disto é exigido para comprar: é pedido depois da compra, em troca de benefícios.
 *   GET  /api/cliente/perfil  → dados atuais (para preencher o formulário)
 *   POST /api/cliente/perfil  → grava nome, telefone e/ou CPF (campos opcionais no corpo)
 * Autenticação: Bearer token do Supabase (usuarioDoToken). Sem login = 401.
 */
import type { Env } from '../types';
import { usuarioDoToken } from './nema';

const SB_HEADERS = (env: Env) => ({ apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` });

// Dígitos verificadores do CPF (módulo 11). Rejeita sequências repetidas (ex.: 111.111.111-11).
export function cpfValido(valor: string): boolean {
  const d = valor.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (base: string, pesoInicial: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(d.slice(0, 9), 10) === Number(d[9]) && dv(d.slice(0, 10), 11) === Number(d[10]);
}

export async function handleClientePerfil(request: Request, env: Env): Promise<Response> {
  const user = await usuarioDoToken(request, env);
  if (!user) return Response.json({ ok: false, erro: 'login_necessario' }, { status: 401 });

  if (request.method === 'GET') {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=nome,telefone,cpf`, { headers: SB_HEADERS(env) });
    const [perfil] = r.ok ? ((await r.json()) as any[]) : [];
    return Response.json({ ok: true, perfil: perfil ?? {} });
  }

  let body: any;
  try { body = await request.json(); } catch {
    return Response.json({ ok: false, erro: 'json_invalido' }, { status: 400 });
  }

  const campos: Record<string, string> = {};
  if (body?.nome !== undefined) {
    const nome = String(body.nome).trim();
    if (nome.length < 2 || nome.length > 120) return Response.json({ ok: false, erro: 'nome_invalido' }, { status: 400 });
    campos.nome = nome;
  }
  if (body?.telefone !== undefined) {
    const tel = String(body.telefone).replace(/\D/g, '');
    if (tel.length < 10 || tel.length > 13) return Response.json({ ok: false, erro: 'telefone_invalido' }, { status: 400 });
    campos.telefone = tel;
  }
  if (body?.cpf !== undefined) {
    if (!cpfValido(String(body.cpf))) return Response.json({ ok: false, erro: 'cpf_invalido' }, { status: 400 });
    campos.cpf = String(body.cpf).replace(/\D/g, '');
  }
  if (Object.keys(campos).length === 0) return Response.json({ ok: false, erro: 'nada_a_gravar' }, { status: 400 });

  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?on_conflict=id`, {
    method: 'POST',
    headers: { ...SB_HEADERS(env), 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: user.id, ...campos }),
  });
  if (!r.ok) {
    console.error('[perfil] gravação falhou:', r.status, (await r.text()).slice(0, 200));
    return Response.json({ ok: false, erro: 'perfil_indisponivel' }, { status: 502 });
  }
  return Response.json({ ok: true, gravados: Object.keys(campos) });
}
