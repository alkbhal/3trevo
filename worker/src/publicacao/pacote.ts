/**
 * publicacao/pacote.ts — Três Trevo Worker
 * Pacote de entrega do tr3vo-forge (espelho de lib/schema/delivery.ts do forge),
 * validado na fronteira antes de qualquer gravação. Campo a mais é ignorado;
 * campo faltando ou com tipo errado recusa o pacote inteiro.
 *
 * Spec: docs/specs/publicacao-por-idioma-v2.md
 */

import { z } from 'zod';

/** Idiomas com biblioteca na loja (R2). de-DE existe no forge, mas não tem vitrine. */
export const IDIOMAS_LOJA = ['pt-BR', 'en-US', 'es-ES'] as const;
export type IdiomaLoja = (typeof IDIOMAS_LOJA)[number];

const comparavelSchema = z.object({
  titulo: z.string().nullable().optional(),
  preco: z.number(),
  moeda: z.string(),
  paginas: z.number(),
  genero: z.string(),
  idioma: z.string(),
  url: z.string(),
  coletadoEm: z.string(),
  evidencia: z.string().optional(),
});
export type ComparavelPacote = z.infer<typeof comparavelSchema>;

export const pacoteSchema = z.object({
  projectId: z.string().uuid(),
  status: z.string(),
  idioma: z.string(),
  titulo: z.string().min(1).max(300),
  descricao: z.string().max(5000),
  parentProjectId: z.string().uuid().nullable(),
  // O forge só envia aprovado; a loja confere de novo (N3) em vez de confiar.
  // `nota` (0–100) é opcional: sem ela o motor põe o preço no início da faixa.
  qualidade: z.object({
    aprovado: z.boolean(),
    motivos: z.array(z.string()),
    nota: z.number().min(0).max(100).optional(),
  }),
  tamanho: z.object({ paginas_estimadas: z.number().int().positive() }),
  mercado: z.object({
    estado: z.enum(['coletado', 'nao_coletado']),
    motivo: z.string().optional(),
    coletadoEm: z.string(),
    comparaveis: z.array(comparavelSchema),
  }),
  arquivos: z.array(z.string()),
  timestamp: z.string(),
});
export type Pacote = z.infer<typeof pacoteSchema>;
