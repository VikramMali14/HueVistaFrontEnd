"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";

/**
 * The studio's company scope: which paint companies the whole colour panel is
 * drawn from.
 *
 * This is a MULTI-select, because a counter's answer to "what do you sell?" is
 * usually more than one name — a shop carrying Asian Paints and Berger had to
 * pick one and lose the other, or pick "every company" and wade through brands
 * it cannot order. An empty selection means every company the caller has, which
 * is also the starting state; that keeps "I haven't chosen" and "I want them
 * all" the same thing, so there is no empty-panel state to fall into.
 *
 * It scopes Colours, AI Suggest and Custom alike, so the three tabs cannot
 * disagree about which companies are in play.
 */
export function CompanyPicker({
  brands,
  selected,
  onChange,
}: {
  /** Every company the caller may work with, already sorted. */
  brands: ReadonlyArray<string>;
  /** Chosen companies; empty = all of them. */
  selected: ReadonlyArray<string>;
  onChange: (next: ReadonlyArray<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();

  // Close on an outside click or Escape — a panel that stays open over the
  // photo is in the way of the very thing the user is looking at.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (brand: string) => {
    onChange(
      selected.includes(brand)
        ? selected.filter((b) => b !== brand)
        : [...selected, brand],
    );
  };

  // What the button says when closed. Naming one or two companies is more use
  // than a count; past that the count is the only thing that fits.
  const label =
    selected.length === 0
      ? "All companies"
      : selected.length <= 2
        ? selected.join(", ")
        : `${selected.length} companies`;

  return (
    <div className="hv-studio-company" ref={root}>
      <Mono>Company</Mono>
      <button
        type="button"
        className="hv-studio-company-btn"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={open ? listId : undefined}
        aria-label={`Company — showing ${selected.length === 0 ? "every company" : selected.join(", ")}. Choose which companies' shades to show.`}
        title="Choose which companies' shades to show — in Colours, AI Suggest and Custom alike"
      >
        <span className="hv-studio-company-label">{label}</span>
        <span aria-hidden className="hv-studio-company-caret">
          ▾
        </span>
      </button>

      {open && (
        <div className="hv-studio-company-menu" id={listId} role="group" aria-label="Companies">
          <button
            type="button"
            className="hv-studio-company-all"
            onClick={() => onChange([])}
            disabled={selected.length === 0}
          >
            All companies
          </button>
          <div className="hv-studio-company-list">
            {brands.map((b) => (
              <label key={b} className="hv-studio-company-item">
                <input
                  type="checkbox"
                  checked={selected.includes(b)}
                  onChange={() => toggle(b)}
                />
                <span>{b}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
