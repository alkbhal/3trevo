// ─── Paleta Ático — papel aquecido ───────────────────────────────────────────
export const G  = "#1A5C38";  // verde profundo (positivo / ação)
export const AM = "#C87B1B";  // ouro/âmbar (atenção)
export const RD = "#B93030";  // vermelho quente (crítico)
export const BL = "#2563EB";  // azul (informativo)
export const PU = "#7C5CBF";  // roxo
export const TL = "#0E8C7A";  // teal
export const GO = "#C87B1B";  // alias ouro
export const RO = "#C2566A";  // rosé
export const BG = "#F7F5F0";  // bg
export const S1 = "#FFFFFF";  // surface
export const S2 = "#F1EEE7";  // surface-2
export const S3 = "#E8E0C8";  // bege quente
export const B1 = "#E6E1D7"; // border
export const TX = "#1A1A18";  // tinta escura
export const SF = "#5C5A55";  // texto secundário
export const MT = "#8A877F";  // texto apagado

// ─── Categorias MVR ───────────────────────────────────────────────────────────
export const MVR_CAT = {
  juros_nao_pagos: { label: "Juros não pagos", icone: "💸", cor: G  },
  negociacao:      { label: "Negociação",       icone: "🤝", cor: TL },
  investimento:    { label: "Rendimento",       icone: "📈", cor: GO },
  compra_evitada:  { label: "Compra evitada",   icone: "🚫", cor: AM },
  multa_evitada:   { label: "Multa evitada",    icone: "🛡",  cor: BL },
  desconto:        { label: "Desconto",          icone: "🏷",  cor: PU },
};

// ─── Config da aplicação ──────────────────────────────────────────────────────
export const AI_ENDPOINT         = "/api/ai";
export const TOKEN_ENDPOINT      = "/api/token";
export const SYNC_ENDPOINT       = "/api/sync";
export const DIA1_SINAL_ENDPOINT = "/api/dia1-sinal";
export const SESSION_TIMEOUT     = 30 * 60 * 1000;

// Cor de texto legivel sobre um fundo (maior contraste WCAG entre branco e preto).
export function textoSobre(fundo) {
  const h = String(fundo).replace("#", "");
  const n = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
  const lin = [0, 2, 4].map((i) => {
    const v = parseInt(n.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  const L = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.05 ? "#FFFFFF" : "#000000";
}
