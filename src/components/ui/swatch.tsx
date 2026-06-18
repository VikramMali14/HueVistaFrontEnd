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
        // Selected ring via box-shadow (not outline) so the global :focus-visible
        // outline still shows for keyboard users on unselected swatches.
        boxShadow: selected ? "0 0 0 3px var(--bg), 0 0 0 4px var(--brass)" : undefined,
        border: "none",
        cursor: "pointer",
        padding: 0,
        position: "relative",
        ...style,
      }}
    />
  );
}
