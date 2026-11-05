import { G, BL, TL, RD, PU, GO, RO, MT } from "../constants.js";

export const GRUPOS_BASE = [
  { id: "g_entrada", nome: "Salário / Renda", icone: "💰", tipo: "entrada", sistema: true, cor: G  },
  { id: "g_viver",   nome: "Viver",           icone: "🏠", tipo: "saida",   sistema: true, cor: BL },
  { id: "g_mover",   nome: "Mover",           icone: "🚗", tipo: "saida",   sistema: true, cor: TL },
  { id: "g_obrig",   nome: "Obrigações",      icone: "📋", tipo: "saida",   sistema: true, cor: RD },
  { id: "g_assin",   nome: "Assinaturas",     icone: "♻",  tipo: "saida",   sistema: true, cor: PU },
  { id: "g_trab",    nome: "Trabalho / PJ",   icone: "💼", tipo: "saida",   sistema: true, cor: PU },
  { id: "g_crescer", nome: "Crescer",         icone: "📈", tipo: "saida",   sistema: true, cor: GO },
  { id: "g_pessoal", nome: "Pessoal",         icone: "🎯", tipo: "saida",   sistema: true, cor: RO },
  { id: "g_outros",  nome: "Outros",          icone: "📦", tipo: "ambos",   sistema: true, cor: MT },
];
