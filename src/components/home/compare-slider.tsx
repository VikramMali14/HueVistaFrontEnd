"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface CompareSliderProps {
  afterShade?: string;
  /** CSS background for the untouched room (left pane). */
  beforeBg?: string;
  /** CSS background for the recoloured room (right pane). */
  afterBg?: string;
  /** Merged last over the root styles — e.g. pass marginTop: 0 outside the hero. */
  style?: React.CSSProperties;
  /**
   * Classes on the root, replacing the default scroll-in treatment.
   *
   * The default carries `reveal d2`, which starts the element at opacity 0 and
   * waits for RevealMount's observer to add `.in`. That is right on the home
   * page and silently fatal anywhere without that mount — the admin preview
   * rendered a perfectly correct slider that was completely invisible. Anything
   * outside the marketing pages should pass "compare" alone.
   */
  className?: string;
}

/**
 * Synthetic stand-ins for the real before/after.
 *
 * This slider is the home page's central proof — "same room, same light, only
 * the wall colour changed" — and it is currently proving it with two gradients.
 * Both panes take any CSS background, so a real pair is a two-line change once
 * the photographs exist:
 *
 *   beforeBg="url(/home/room-before.jpg) center/cover"
 *   afterBg="url(/home/room-after.jpg) center/cover"
 *
 * The same room, the same shot, one wall repainted — nothing else different.
 */
const DEFAULT_BEFORE = "radial-gradient(ellipse at 50% 35%, rgba(255,250,235,.16), transparent 60%), linear-gradient(165deg, #5a5044 0%, #3a3127 55%, #1c1612 100%)";
const DEFAULT_AFTER = "radial-gradient(ellipse at 50% 35%, rgba(255,235,210,.28), transparent 60%), linear-gradient(160deg, #c87a55 0%, #9d5236 55%, #4d2618 100%)";

export function CompareSlider({
  // A demo caption, so a colour name and no code. It used to read "Terracotta ·
  // AP-1428" on the home page hero — an invented code in a real company's
  // format, for a shade nobody sells.
  afterShade = "Terracotta",
  beforeBg = DEFAULT_BEFORE,
  afterBg = DEFAULT_AFTER,
  style,
  className = "compare reveal d2",
}: CompareSliderProps) {
  const [pos, setPos] = useState(55);
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const updateFromClient = useCallback((clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const next = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.max(2, Math.min(98, next)));
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      updateFromClient(e.clientX);
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [updateFromClient]);

  return (
    // Size, spacing and the two marks live in .compare now (see globals.css).
    // They were inline, and inline styles beat every class — so the hero, which
    // needs this to fill a column rather than hold a 21:10 box, had no way to
    // say so. Only the three genuinely dynamic values stay here: the two panes'
    // backgrounds and the split position.
    <div
      className={className}
      ref={ref}
      style={style}
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        updateFromClient(e.clientX);
      }}
      onPointerMove={(e) => {
        if (dragging.current) updateFromClient(e.clientX);
      }}
    >
      {/* Base layer = recoloured room; the clipped layer on the left reveals the
          untouched "before" under its tag. */}
      <div className="compare-pane" style={{ background: afterBg }} />
      <div className="compare-pane" style={{ clipPath: `inset(0 calc(100% - ${pos}%) 0 0)`, background: beforeBg }} />
      <span className="compare-tag is-before">Before</span>
      <span className="compare-tag is-after">{afterShade}</span>
      <button
        type="button"
        className="hv-compare-handle"
        aria-label="Drag to compare before and after"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos)}
        role="slider"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setPos((p) => Math.max(2, p - 2));
          if (e.key === "ArrowRight") setPos((p) => Math.min(98, p + 2));
        }}
        style={{ left: `${pos}%` }}
      >
        <span className="hv-compare-grip" aria-hidden>‹  ›</span>
      </button>
    </div>
  );
}
