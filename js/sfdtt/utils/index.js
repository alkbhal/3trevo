export function fmt(n) {
  if (!n && n !== 0) return "0,00";
  return Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "id" + Date.now() + Math.random().toString(36).slice(2, 9);
}

// thisM/todayStr usam hora LOCAL (não toISOString/UTC) — precisam bater com
// curDay()/daysInM() abaixo, que já são locais. Misturar UTC com local aqui
// quebrava calcProjecao entre ~21h-meia-noite (Brasília): thisM() virava o
// mês seguinte em UTC antes da meia-noite local, mas curDay() continuava no
// dia do mês anterior — mapa[hoje] ficava fora do range de daysInM(mes) e
// crashava a tela de Visão/Projeção. Mesmo bug também mis-datava o lançamento
// padrão em FABLancar/PopupMVR (todayStr) pro dia seguinte fora de hora.
function pad2(n) { return String(n).padStart(2, "0"); }
export const thisM    = () => { const d = new Date(); return d.getFullYear() + "-" + pad2(d.getMonth() + 1); };
export const todayStr = () => { const d = new Date(); return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); };
export const curDay   = () => new Date().getDate();
export const daysInM  = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(y, m, 0).getDate(); };
export const dayOfStr = (str) => parseInt((str || "").slice(8, 10)) || 0;

// Dias corridos entre uma data YYYY-MM-DD e hoje, em hora LOCAL (mesmo padrão
// de thisM/todayStr acima — nunca Date.parse/toISOString, que já causou o bug
// de virada de dia perto da meia-noite). null quando a data não é informada.
export function diasDesde(dataStr) {
  if (!dataStr) return null;
  const [y, m, d] = dataStr.split("-").map(Number);
  const data = new Date(y, m - 1, d); data.setHours(0, 0, 0, 0);
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  return Math.floor((hoje - data) / 86_400_000);
}

export function dateLabel() {
  return new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
}

export function mLbl(ym) {
  if (!ym) return "";
  const m = parseInt(ym.slice(5, 7));
  return ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][m - 1] + "/" + ym.slice(2, 4);
}
