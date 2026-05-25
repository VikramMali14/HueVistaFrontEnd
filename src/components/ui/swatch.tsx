"use client";

import type { CSSProperties } from "react";

interface SwatchProps {
  hex: string;
  code?: string;
  size?: number;
  selected?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
}

export function Swatch({ hex, code, size, selected, onClick, style }: SwatchProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={code}
      aria-label={code ? `${code} (${hex})` : hex}
      style={{
        background: hex,
        width: size,
        height: size,
        aspectRatio: size ? undefined : "1/1",
        outline: selected ? "1px solid var(--brass)" : "none",
        outlineOffset: selected ? 3 : 0,
        border: "none",
        cursor: "pointer",
        padding: 0,
        position: "relative",
        ...style,
      }}
    />
  );
}
