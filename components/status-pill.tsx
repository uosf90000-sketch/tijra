const labels: Record<string, string> = {
  healthy: "جيد",
  low: "منخفض",
  critical: "حرج",
  draft: "مسودة",
  sent: "مُرسل",
  confirmed: "مؤكد",
  partial: "استلام جزئي",
  received: "مستلم",
  paid: "مدفوع",
  active: "نشط",
  in: "وارد",
  out: "صادر",
};

export function StatusPill({ status, label }: { status: string; label?: string }) {
  return <span className={`statusPill status-${status}`}>{label ?? labels[status] ?? status}</span>;
}
