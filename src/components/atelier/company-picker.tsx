"use client";

import { useEffect, useRef, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";

/**
 * The studio's company scope, sitting in the topbar because it governs the whole
 * colour panel rather than one tab.
 *
 * It takes a SET of companies, not one. A shop that stocks three brands wants to
 * browse two of them side by side — "everything except the one we're out of" —
 * and a single-choice dropdown could only say one company or all of them. Every
 * middle answer was unsayable.
 *
 * An empty selection means every company. That is the opening state and what
 * "Show all companies" returns to, so there is no separate "All" entry that
 * could disagree with the checkboxes beneath it.
 */
export function CompanyPicker({
  brands,
  selected,
  onChange,
}: {
  brands: ReadonlyArray<string>;
  selected: ReadonlyArray<string>;
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Escape and click-outside — the two ways out any popover has to have.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      const root = rootRef.current;
      if (root && e.target instanceof Node && !root.contains(e.target)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const toggle = (brand: string) =>
    onChange(
      selected.includes(brand) ? selected.filter((b) => b !== brand) : [...selected, brand],
    );

  // Naming the one company beats "1 company" — with a single brand chosen, the
  // whole point of the control is to say WHICH.
  const summary =
    selected.length === 0
      ? "All companies"
      : selected.length === 1
        ? selected[0]!
        : `${selected.length} companies`;

  return (
    <div className="hv-studio-company" ref={rootRef}>
      {/* The visible eyebrow is dropped on phone widths where the topbar has no
          room for it, so the name is stated on the control itself rather than
          left to a label that may not be rendered. */}
      <Mono>Company</Mono>
      <button
        type="button"
        className={`hv-studio-company-btn${selected.length > 0 ? " is-scoped" : ""}`}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Company — showing ${summary}`}
        title="Show these companies' shades — in Colours, AI Suggest and Custom alike"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="hv-studio-company-summary">{summary}</span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="hv-studio-company-menu" role="group" aria-label="Companies to show">
          {brands.map((b) => (
            <label key={b} className="hv-studio-company-opt">
              <input
                type="checkbox"
                checked={selected.includes(b)}
                onChange={() => toggle(b)}
              />
              <span>{b}</span>
            </label>
          ))}
          <button
            type="button"
            className="hv-studio-company-clear"
            onClick={() => onChange([])}
            disabled={selected.length === 0}
          >
            Show all companies
          </button>
        </div>
      )}
    </div>
  );
}
