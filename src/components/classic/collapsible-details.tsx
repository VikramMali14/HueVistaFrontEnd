"use client";

import { useState, type ReactNode } from "react";

interface CollapsibleDetailsProps {
  openLabel: string;
  closeLabel: string;
  defaultOpen?: boolean;
  children: ReactNode;
  /** Optional className for the wrapper. */
  className?: string;
}

export function CollapsibleDetails({
  openLabel,
  closeLabel,
  defaultOpen = false,
  children,
  className = "",
}: CollapsibleDetailsProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={className} style={{ marginBottom: 16 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          background: "transparent",
          border: "1px solid var(--rule-strong)",
          color: "var(--fg-soft)",
          font: "500 12px/1 var(--sans)",
          padding: "8px 14px",
          borderRadius: 6,
          cursor: "pointer",
        }}
      >
        {open ? closeLabel : openLabel}
      </button>
      {open && <div style={{ marginTop: 16 }}>{children}</div>}
    </div>
  );
}
