"use client";

import { useId, useMemo } from "react";

/** One selectable value in a facet, with how many rows currently carry it. */
export interface FacetOption {
  value: string;
  label: string;
  count?: number;
}

/** A single dropdown filter — company, status, distributor, state… */
export interface Facet {
  id: string;
  /** Short label shown above the control, e.g. "Company". */
  label: string;
  options: FacetOption[];
  /** Current selection; `ALL` (the empty string) means "no restriction". */
  value: string;
  onChange: (value: string) => void;
  /** Text for the "no restriction" entry, e.g. "All companies". */
  allLabel?: string;
}

/** The value meaning "this facet is not restricting anything". */
export const ALL = "";

interface FilterBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  searchPlaceholder?: string;
  /** Accessible name for the search box; defaults to the placeholder. */
  searchLabel?: string;
  facets?: Facet[];
  /** Rows after filtering / rows before filtering — rendered as "12 of 48". */
  shown?: number;
  total?: number;
  /** Noun for the count, e.g. "shop" → "12 of 48 shops". */
  noun?: string;
}

/**
 * Search + dropdown facets for a management table. Purely presentational: the
 * caller owns the state and does the filtering (see {@link matchesQuery} and
 * {@link facetOptionsFrom} for the usual plumbing).
 *
 * Native `<select>` rather than custom popovers — it keeps long company lists
 * usable on the phones shop owners actually use, and stays keyboard accessible
 * for free.
 */
export function FilterBar({
  query,
  onQueryChange,
  searchPlaceholder = "Search",
  searchLabel,
  facets = [],
  shown,
  total,
  noun,
}: FilterBarProps) {
  const uid = useId();
  const active =
    query.trim().length > 0 || facets.some((f) => f.value !== ALL);

  const clearAll = () => {
    onQueryChange("");
    facets.forEach((f) => f.onChange(ALL));
  };

  const countLabel = useMemo(() => {
    if (shown === undefined || total === undefined) return null;
    const unit = noun ? ` ${noun}${total === 1 ? "" : "s"}` : "";
    return shown === total ? `${total}${unit}` : `${shown} of ${total}${unit}`;
  }, [shown, total, noun]);

  return (
    <div className="hv-filter">
      <div className="hv-filter-controls">
        <div className="hv-filter-search">
          <span aria-hidden className="hv-filter-search-icon">
            <SearchIcon />
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchLabel ?? searchPlaceholder}
          />
        </div>

        {facets.map((f) => (
          <label key={f.id} className="hv-filter-facet">
            <span className="hv-filter-facet-label">{f.label}</span>
            <select
              id={`${uid}-${f.id}`}
              value={f.value}
              onChange={(e) => f.onChange(e.target.value)}
              className={f.value !== ALL ? "is-active" : undefined}
            >
              <option value={ALL}>{f.allLabel ?? `All ${f.label.toLowerCase()}`}</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                  {o.count !== undefined ? ` (${o.count})` : ""}
                </option>
              ))}
            </select>
          </label>
        ))}

        {active && (
          <button type="button" className="hv-filter-clear" onClick={clearAll}>
            Clear
          </button>
        )}
      </div>

      {countLabel && <span className="hv-filter-count">{countLabel}</span>}

      <style>{`
        .hv-filter { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px 16px; margin-bottom: 18px; }
        /* Takes the room that is there. As a default flex item it sized itself to
           max-content — 720px of a 1360px row — so the last facet wrapped onto a
           line of its own with 640px of empty space beside it, and the result
           count trailed after it. */
        .hv-filter-controls { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px 12px; flex: 1 1 auto; min-width: 0; }
        /* Wide enough for the placeholders these boxes actually carry — at 340px
           "Search company, line or finish" was cut to "…line or fin", which reads
           as a rendering fault rather than a hint. */
        /* Sized, not greedy. With flex-grow:1 the search box ate the width the
           facets needed and pushed the last one onto a line of its own, where it
           sat alone on the left with the result count stranded on the right —
           a row that looks like it broke rather than one that wrapped. It grows
           to fill the phone instead, where it really is the whole row. */
        .hv-filter-search { display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--rule-strong); border-radius: 6px; background: var(--surface); padding: 0 10px; height: 38px; min-width: 220px; flex: 0 1 320px; max-width: 420px; }
        .hv-filter-search-icon { display: inline-flex; color: var(--fg-mute); flex-shrink: 0; }
        .hv-filter-search input { flex: 1; min-width: 0; background: transparent; border: none; outline: none; color: var(--fg); font: 400 14px/1 var(--sans); height: 100%; }
        .hv-filter-search input::placeholder { color: var(--fg-mute); }
        .hv-filter-search input::-webkit-search-cancel-button { filter: grayscale(1) opacity(.5); cursor: pointer; }
        .hv-filter-facet { display: flex; flex-direction: column; gap: 5px; }
        .hv-filter-facet-label { font: 400 12px/1 var(--mono); letter-spacing: .22em; text-transform: uppercase; color: var(--fg-mute); }
        .hv-filter-facet select { height: 38px; border: 1px solid var(--rule-strong); border-radius: 6px; background: var(--surface); color: var(--fg-soft); font: 400 14px/1 var(--sans); padding: 0 30px 0 10px; cursor: pointer; max-width: 220px; appearance: none; background-image: linear-gradient(45deg, transparent 50%, var(--fg-mute) 50%), linear-gradient(135deg, var(--fg-mute) 50%, transparent 50%); background-position: calc(100% - 15px) 17px, calc(100% - 10px) 17px; background-size: 5px 5px, 5px 5px; background-repeat: no-repeat; }
        .hv-filter-facet select.is-active { border-color: var(--accent); color: var(--fg); }
        .hv-filter-clear { height: 38px; border: 1px solid var(--rule-strong); border-radius: 6px; background: transparent; color: var(--accent); cursor: pointer; padding: 0 14px; font: 400 12px/1 var(--mono); letter-spacing: .2em; text-transform: uppercase; }
        .hv-filter-clear:hover { border-color: var(--accent); }
        .hv-filter-count { font: 400 12px/1 var(--mono); letter-spacing: .2em; text-transform: uppercase; color: var(--fg-mute); padding-bottom: 12px; white-space: nowrap; margin-left: auto; }
        @media (max-width: 620px) {
          .hv-filter-controls { width: 100%; }
          .hv-filter-search { max-width: none; flex: 1 1 100%; }
          /* The facet is a flex item of the controls ROW, so a 140px basis on it is
             a width. The select inside it is a flex item of the facet, which is a
             COLUMN — so the same basis there set its HEIGHT, and every dropdown on
             a phone rendered 140px tall with its value stranded at the bottom of an
             empty box. Size the facet; let the select fill it. */
          .hv-filter-facet { flex: 1 1 140px; max-width: none; }
          .hv-filter-facet select { width: 100%; max-width: none; }
        }
      `}</style>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5 14 14" strokeLinecap="round" />
    </svg>
  );
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

/**
 * Case-insensitive "does any of these fields contain the query" test. Every
 * whitespace-separated term must match somewhere, so "priya mehta" finds a row
 * whose name and shop match different fields.
 */
export function matchesQuery(query: string, ...fields: Array<string | null | undefined>): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = fields.filter(Boolean).join(" ").toLowerCase();
  return q.split(/\s+/).every((term) => hay.includes(term));
}

/**
 * Distinct facet options built from the rows themselves, A→Z, each with the
 * number of rows carrying it. `pick` returns one value per row, or several when
 * a row can sit under more than one (a shop with three companies assigned).
 */
export function facetOptionsFrom<T>(
  rows: readonly T[],
  pick: (row: T) => string | string[] | null | undefined,
): FacetOption[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const picked = pick(row);
    const values = Array.isArray(picked) ? picked : picked ? [picked] : [];
    for (const v of new Set(values.filter((s) => s && s.trim()))) {
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
  }
  return Array.from(counts, ([value, count]) => ({ value, label: value, count })).sort((a, b) =>
    a.label.localeCompare(b.label),
  );
}
