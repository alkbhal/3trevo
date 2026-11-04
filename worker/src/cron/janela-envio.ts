/**
 * janela-envio.ts — Janela de envio dos e-mails de recuperação de carrinho.
 *
 * Duas âncoras de tempo:
 *  1. Horário humano: nada sai entre 22h e 8h (horário de Brasília, UTC-3 fixo,
 *     sem horário de verão desde 2019). O que cairia nesse intervalo vai para as 9h.
 *  2. Prazo do negócio: o Pix vence 23h depois de gerado. O 2º e-mail mira 4h antes
 *     do vencimento (início + 19h). Se esse alvo cair no silêncio, é puxado para
 *     21h30 da noite anterior (enquanto o Pix ainda vale), desde que fique pelo menos
 *     3h depois do 1º e-mail; senão vai para as 9h (o link gera um Pix novo).
 *
 * Funções puras (recebem e devolvem milissegundos UTC) para serem testáveis.
 */

const H = 3600000;
const OFFSET_BRT = -3 * H;

export const SILENCIO_INICIO = 22; // 22h local
export const SILENCIO_FIM = 8; // 8h local
export const HORA_ABERTURA = 9; // destino do que caiu no silêncio
export const ATRASO_R1_H = 1; // 1º e-mail ~1h depois do abandono
export const ALVO_R2_H = 19; // Pix vence em 23h → 4h antes
export const INTERVALO_MIN_R1_R2_H = 3;

function horaLocal(ms: number): number {
  const local = new Date(ms + OFFSET_BRT);
  return local.getUTCHours() + local.getUTCMinutes() / 60;
}

/** Início do dia local (00:00 BRT) que contém `ms`, em ms UTC. */
function inicioDiaLocal(ms: number): number {
  const local = new Date(ms + OFFSET_BRT);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - OFFSET_BRT;
}

export function emSilencio(ms: number): boolean {
  const h = horaLocal(ms);
  return h >= SILENCIO_INICIO || h < SILENCIO_FIM;
}

/** Próximo 09:00 local a partir de `ms`. */
export function proximaAbertura(ms: number): number {
  const hoje9 = inicioDiaLocal(ms) + HORA_ABERTURA * H;
  return ms <= hoje9 ? hoje9 : hoje9 + 24 * H;
}

/** 21h30 local da noite que antecede o silêncio em que `ms` está. */
function ultimoAntesDoSilencio(ms: number): number {
  const dia = inicioDiaLocal(ms);
  const base = horaLocal(ms) < SILENCIO_FIM ? dia - 24 * H : dia;
  return base + 21.5 * H;
}

export function agendarRecovery1(inicioMs: number, agoraMs: number): number {
  const t = Math.max(agoraMs, inicioMs + ATRASO_R1_H * H);
  return emSilencio(t) ? proximaAbertura(t) : t;
}

export function agendarRecovery2(inicioMs: number, r1Ms: number): number {
  const minimo = r1Ms + INTERVALO_MIN_R1_R2_H * H;
  const alvo = Math.max(inicioMs + ALVO_R2_H * H, minimo);
  if (!emSilencio(alvo)) return alvo;
  const antes = ultimoAntesDoSilencio(alvo);
  return antes >= minimo ? antes : proximaAbertura(alvo);
}
