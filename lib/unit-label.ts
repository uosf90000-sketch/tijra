const UNIT_LABELS: Record<string, string> = {
  piece: "قطعة",
  pack: "عبوة / باك",
  carton: "كرتون",
  bag: "كيس",
  box: "صندوق",
  kg: "كيلو",
  g: "غرام",
  liter: "لتر",
  l: "لتر",
  ml: "مل",
  unit: "وحدة",
};

export function unitLabel(unit: string | null | undefined) {
  if (!unit) return "وحدة";
  const key = unit.trim().toLowerCase();
  return UNIT_LABELS[key] ?? unit;
}
