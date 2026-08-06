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
  /**
   * A real photograph or screenshot. When set, the coloured plate steps aside
   * and this fills the frame instead.
   *
   * The plates exist so a page can be laid out before its photography exists —
   * they are scaffolding, not artwork. On a page whose whole subject is "see
   * the colour before the can opens", an abstract gradient labelled FIG. I is
   * the weakest possible illustration, so every plate should end up carrying
   * one of these.
   */
  src?: string;
  /** Required alongside src — these images ARE the content, not decoration. */
  alt?: string;
}

export function Placeholder({ tone = "ink", label, tag, grain, corners, style, className = "", children, src, alt }: PlaceholderProps) {
  if (src) {
    return (
      <figure className={["ph-photo", className].filter(Boolean).join(" ")} style={style}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt ?? ""} loading="lazy" decoding="async" />
        {label && <figcaption>{label}</figcaption>}
      </figure>
    );
  }
  const classes = ["ph", grain && "ph-grain", corners && "ph-corners", className].filter(Boolean).join(" ");
  return (
    <div className={classes} data-tone={tone} style={style}>
      {tag && <span className="ph-tag">{tag}</span>}
      {children}
      {label && <span className="ph-label">{label}</span>}
    </div>
  );
}
