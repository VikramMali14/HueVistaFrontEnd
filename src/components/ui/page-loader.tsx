import type { CSSProperties } from "react";

/**
 * Route-change loader — a miniature of the /work spiral: paint-chip
 * swatches orbit a pulsing core in 3D while blurred pigment blobs swirl
 * behind them like paint being mixed. Pure CSS animation, so it plays
 * before hydration (loading.tsx renders long before any JS lands).
 * Styles live in globals.css under "PAGE LOADER".
 */

// Tone gradients echo .ph[data-tone] swatches; --ry fans the chips around
// the ring and --dy twists the ring into a shallow helix, like /work.
const CHIPS: Array<{ tone: string; ry: number; dy: number }> = [
  { tone: "terracotta", ry: 0, dy: -16 },
  { tone: "sage", ry: 51, dy: -7 },
  { tone: "slate", ry: 103, dy: 3 },
  { tone: "brass", ry: 154, dy: 12 },
  { tone: "indigo", ry: 206, dy: 17 },
  { tone: "ivory", ry: 257, dy: 6 },
  { tone: "oxblood", ry: 309, dy: -6 },
];

interface PageLoaderProps {
  label?: string;
  /** Slightly smaller stage for in-app (dashboard/atelier) routes. */
  compact?: boolean;
}

export function PageLoader({ label = "Mixing", compact = false }: PageLoaderProps) {
  return (
    <div className="hv-loader" data-compact={compact || undefined} role="status" aria-live="polite" aria-label={label}>
      <div className="hv-loader-stage" aria-hidden>
        <div className="hv-loader-blobs">
          <i />
          <i />
          <i />
        </div>
        <div className="hv-loader-ring">
          <div className="hv-loader-orbit">
            {CHIPS.map((c) => (
              <span
                key={c.tone}
                className="hv-loader-chip"
                data-tone={c.tone}
                style={{ "--ry": `${c.ry}deg`, "--dy": `${c.dy}px` } as CSSProperties}
              />
            ))}
          </div>
          <span className="hv-loader-core" />
        </div>
      </div>
      <span className="hv-loader-label" aria-hidden>
        {label}
        <span className="hv-loader-ell">
          <i />
          <i />
          <i />
        </span>
      </span>
      <span className="hv-loader-bar" aria-hidden />
    </div>
  );
}
