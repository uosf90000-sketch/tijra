import type { CSSProperties } from "react";

type LogoProps = {
  compact?: boolean;
  inverse?: boolean;
  className?: string;
  size?: number;
};

/** مدار: connected orbit, one business with many coordinated departments. */
export function MadaarMark({ size = 46, className = "" }: { size?: number; className?: string }) {
  return (
    <svg aria-hidden="true" className={className} width={size} height={size}
      viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="32" r="25.5" stroke="currentColor" strokeWidth="6"
        strokeLinecap="round" strokeDasharray="116 45" transform="rotate(-39 32 32)" />
      <path d="M13.1 47.3C22 57.9 41.2 58.7 50.5 44"
        stroke="var(--madaar-logo-accent, #46BF9F)" strokeWidth="6.5" strokeLinecap="round"/>
      <ellipse cx="32" cy="32" rx="15.5" ry="24.5" transform="rotate(47 32 32)"
        stroke="var(--madaar-logo-accent, #46BF9F)" strokeWidth="3.5" opacity=".9"/>
      <circle cx="32" cy="32" r="5.5" fill="currentColor"/>
      <circle cx="49.2" cy="12.5" r="4.8" fill="var(--madaar-logo-accent, #46BF9F)"/>
    </svg>
  );
}

export function MadaarLogo({ compact = false, inverse = false, className = "", size = 46 }: LogoProps) {
  const style = {
    "--madaar-logo-accent": inverse ? "#72DFC2" : "#39AD91",
  } as CSSProperties;
  return (
    <span className={`madaarLogo ${inverse ? "madaarLogoInverse" : ""} ${compact ? "madaarLogoCompact" : ""} ${className}`.trim()} style={style}>
      <span className="madaarLogoSymbol"><MadaarMark size={size}/></span>
      {!compact && <span className="madaarLogoWords">
        <strong>مدار</strong>
        <span lang="en" dir="ltr">MADAAR</span>
      </span>}
    </span>
  );
}
