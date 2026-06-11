"use client";

/**
 * Route-change fade — remounts on every navigation so .hv-page replays its
 * opacity-only entrance (transforms would re-anchor /work's fixed spiral).
 * Reduced motion is neutralised in globals.css.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="hv-page">{children}</div>;
}
