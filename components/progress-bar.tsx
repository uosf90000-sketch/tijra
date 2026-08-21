export function ProgressBar({ value, max = 100, tone = "brand" }: { value: number; max?: number; tone?: "brand" | "amber" | "red" }) {
  const width = Math.max(0, Math.min(100, (value / Math.max(max, 1)) * 100));
  return (
    <div className="progressTrack" aria-label={`${Math.round(width)}%`}>
      <span className={`progressFill tone-${tone}`} style={{ width: `${width}%` }} />
    </div>
  );
}
