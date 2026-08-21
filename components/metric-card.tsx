import type { LucideIcon } from "lucide-react";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";

export function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  trend,
  tone = "brand",
}: {
  label: string;
  value: string;
  note?: string;
  icon: LucideIcon;
  trend?: "up" | "down" | "neutral";
  tone?: "brand" | "blue" | "amber" | "violet";
}) {
  return (
    <article className="metricCard">
      <div className={`metricIcon tone-${tone}`}><Icon size={20} strokeWidth={1.9} /></div>
      <span className="metricLabel">{label}</span>
      <strong>{value}</strong>
      {note ? (
        <small className={`metricNote ${trend ?? "neutral"}`}>
          {trend === "up" ? <ArrowUpRight size={14} /> : null}
          {trend === "down" ? <ArrowDownLeft size={14} /> : null}
          {note}
        </small>
      ) : null}
    </article>
  );
}
