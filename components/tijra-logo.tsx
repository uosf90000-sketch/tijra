import type { CSSProperties } from "react";

type LogoProps = {
  compact?: boolean;
  inverse?: boolean;
  className?: string;
  size?: number;
};

export function TijraMark({ size = 44, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={Math.round(size * 0.66)}
      viewBox="0 0 132 88"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M69 28C57 13 39 9 24 19C6 31 6 58 24 70C39 80 55 73 66 59L94 25"
        stroke="currentColor"
        strokeWidth="15"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M63 60C75 75 93 79 108 69C126 57 126 30 108 18C93 8 77 15 66 29L38 63"
        stroke="var(--tijra-logo-accent, #D8C6A6)"
        strokeWidth="15"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M55 43L78 43" stroke="var(--tijra-logo-bg, #FAF7F2)" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

export function TijraLogo({ compact = false, inverse = false, className = "", size = 44 }: LogoProps) {
  const style = {
    "--tijra-logo-accent": inverse ? "#E6D6B8" : "#D8C6A6",
    "--tijra-logo-bg": inverse ? "#0F4D4D" : "#FAF7F2",
  } as CSSProperties;

  return (
    <span className={`tijraLogo ${inverse ? "tijraLogoInverse" : ""} ${compact ? "tijraLogoCompact" : ""} ${className}`.trim()} style={style}>
      <span className="tijraLogoSymbol"><TijraMark size={size} /></span>
      {!compact && (
        <span className="tijraLogoWords">
          <strong>تِجرا</strong>
          <span>TIJRA</span>
        </span>
      )}
    </span>
  );
}
