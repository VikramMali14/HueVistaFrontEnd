"use client";

import { useRef, type CSSProperties, type ReactNode } from "react";

interface TiltCardProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Maximum tilt in degrees. */
  max?: number;
}

/**
 * Pointer-reactive 3D tilt. Pure CSS transforms driven by a couple of CSS
 * variables — no dependencies, and it no-ops on touch / reduced-motion (see
 * globals.css). Wrap any block; the child fills the tilt plane.
 */
export function TiltCard({ children, className = "", style, max = 9 }: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--rx", `${(px * max).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${(-py * max).toFixed(2)}deg`);
    el.dataset.active = "1";
  };

  const reset = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    delete el.dataset.active;
  };

  return (
    <div
      ref={ref}
      className={`hv-tilt ${className}`.trim()}
      style={style}
      onPointerMove={onMove}
      onPointerLeave={reset}
    >
      <div className="hv-tilt-inner">{children}</div>
    </div>
  );
}
