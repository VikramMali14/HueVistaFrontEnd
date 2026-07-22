"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface ImageCompareProps {
  /** Left / revealed pane — the untouched raw photo. */
  beforeSrc: string;
  /** Right / base pane — the AI-cleaned photo. */
  afterSrc: string;
  beforeLabel?: string;
  afterLabel?: string;
  alt?: string;
  style?: React.CSSProperties;
}

/**
 * Drag-to-compare slider for two real images — the same interaction as the
 * homepage CompareSlider, but layering <img> elements instead of CSS
 * backgrounds. Used on dashboard cards to reveal the raw photo under the
 * AI-cleaned one. Self-contained: it captures the pointer and never navigates,
 * so it can sit next to (not inside) the card's open-project link.
 */
export function ImageCompare({
  beforeSrc,
  afterSrc,
  beforeLabel = "Raw",
  afterLabel = "Cleaned",
  alt = "",
  style,
}: ImageCompareProps) {
  const [pos, setPos] = useState(50);
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
    const onUp = () => {
      dragging.current = false;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [updateFromClient]);

  const imgStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    pointerEvents: "none",
    userSelect: "none",
  };

  return (
    <div
      ref={ref}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        userSelect: "none",
        cursor: "ew-resize",
        touchAction: "pan-y",
        background: "var(--surface)",
        ...style,
      }}
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        updateFromClient(e.clientX);
      }}
      onPointerMove={(e) => {
        if (dragging.current) updateFromClient(e.clientX);
      }}
    >
      {/* Base = cleaned; the clipped overlay reveals the raw photo on the left. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={afterSrc} alt={alt} draggable={false} style={imgStyle} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={beforeSrc}
        alt=""
        draggable={false}
        style={{ ...imgStyle, clipPath: `inset(0 calc(100% - ${pos}%) 0 0)` }}
      />
      <span style={tagStyle("left")}>{beforeLabel}</span>
      <span style={tagStyle("right")}>{afterLabel}</span>
      <div
        role="slider"
        aria-label="Drag to compare the raw and cleaned image"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setPos((p) => Math.max(2, p - 2));
          if (e.key === "ArrowRight") setPos((p) => Math.min(98, p + 2));
        }}
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: `${pos}%`,
          width: 2,
          background: "var(--ivory)",
          transform: "translateX(-50%)",
          zIndex: 4,
          boxShadow: "0 0 14px rgba(0,0,0,.45)",
        }}
      >
        <span style={handleDotStyle} aria-hidden>
          ‹ ›
        </span>
      </div>
    </div>
  );
}

const tagStyle = (side: "left" | "right"): React.CSSProperties => ({
  position: "absolute",
  top: 10,
  [side]: 10,
  font: "400 8px/1 var(--mono)",
  letterSpacing: ".22em",
  textTransform: "uppercase",
  color: "var(--ivory)",
  background: "rgba(10,9,15,.6)",
  backdropFilter: "blur(6px)",
  padding: "6px 8px",
  border: "1px solid rgba(235,229,215,.2)",
  zIndex: 3,
});

const handleDotStyle: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  width: 34,
  height: 34,
  border: "1px solid var(--ivory)",
  background: "rgba(10,9,15,.7)",
  backdropFilter: "blur(6px)",
  borderRadius: "50%",
  color: "var(--ivory)",
  font: "400 13px/1 var(--mono)",
  letterSpacing: ".05em",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
