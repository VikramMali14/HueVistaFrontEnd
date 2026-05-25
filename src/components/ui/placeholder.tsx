import type { CSSProperties, ReactNode } from "react";

type Tone = "ivory" | "brass" | "terracotta" | "sage" | "oxblood" | "slate" | "ink" | "indigo" | "walnut";

interface PlaceholderProps {
  tone?: Tone;
  label?: string;
  tag?: string;
  grain?: boolean;
  corners?: boolean;
  style?: CSSProperties;
  className?: string;
  children?: ReactNode;
}

export function Placeholder({ tone = "ink", label, tag, grain, corners, style, className = "", children }: PlaceholderProps) {
  const classes = ["ph", grain && "ph-grain", corners && "ph-corners", className].filter(Boolean).join(" ");
  return (
    <div className={classes} data-tone={tone} style={style}>
      {tag && <span className="ph-tag">{tag}</span>}
      {children}
      {label && <span className="ph-label">{label}</span>}
    </div>
  );
}
