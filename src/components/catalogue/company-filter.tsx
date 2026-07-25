"use client";

import { Mono } from "@/components/ui/eyebrow";
import type { MatchBrand } from "@/hooks/use-shade-match";

/**
 * "Match against this company" picker for the colour finders. A customer at the
 * counter wants the closest colour their shop actually stocks, so the nearest
 * shade overall — from a company nobody carries — is the wrong answer. Picking a
 * company here restricts the match to that catalogue.
 *
 * Renders nothing when there is only one company to choose from: a filter with a
 * single option is decoration.
 */
export function CompanyFilter({
  brands,
  value,
  onChange,
  id = "company-filter",
}: {
  brands: ReadonlyArray<MatchBrand>;
  /** Selected company slug, or "" for every company. */
  value: string;
  onChange: (slug: string) => void;
  id?: string;
}) {
  if (brands.length < 2) return null;

  return (
    <label htmlFor={id} style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <Mono>Company</Mono>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: "9px 12px",
          border: "1px solid var(--rule-strong)",
          background: "var(--surface)",
          color: "var(--fg)",
          font: "400 15px/1 var(--sans)",
          cursor: "pointer",
          maxWidth: 240,
        }}
      >
        <option value="">All companies</option>
        {brands.map((b) => (
          <option key={b.slug} value={b.slug}>
            {b.name}
          </option>
        ))}
      </select>
    </label>
  );
}
