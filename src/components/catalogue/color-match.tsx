"use client";

import { useMemo, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { useShadeMatch } from "@/hooks/use-shade-match";
import { MatchList } from "@/components/catalogue/match-list";
import { SHADES } from "@/lib/shades";
import type { PaintShade } from "@/lib/types";

/**
 * Pick or paste any colour → the nearest real catalogue shades, through the
 * same shared matching path as the photo finder (backend ΔE matcher with the
 * bundled offline fallback).
 */
export function ColorMatch({ shades }: { shades?: ReadonlyArray<PaintShade> }) {
  const catalogue = useMemo(() => (shades && shades.length > 0 ? shades : SHADES), [shades]);
  const [hex, setHex] = useState("#a47148");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { matches, source, loading } = useShadeMatch(submitted, catalogue, 5);

  function findNearest() {
    setError(null);
    const clean = hex.trim().replace(/^#/, "");
    if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
      setError("Use a 6-digit hex like #A47148.");
      setSubmitted(null);
      return;
    }
    setSubmitted(`#${clean}`);
  }

  return (
    <div className="hv-finder" style={{ border: "1px solid var(--rule)", padding: "24px 24px 28px", marginBottom: 48 }}>
      <Mono brass>Match any colour</Mono>
      <p className="finder-lead" style={{ font: "400 18px/1.5 var(--serif)", color: "var(--fg-soft)", margin: "10px 0 18px", maxWidth: "52ch" }}>
        Pick or paste any colour and we&apos;ll find the catalogue shades that look closest to the eye — codes intact.
      </p>
      <form onSubmit={(e) => { e.preventDefault(); findNearest(); }} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#a47148"}
          onChange={(e) => setHex(e.target.value)}
          aria-label="Pick a colour"
          style={{ width: 48, height: 40, border: "1px solid var(--rule-strong)", background: "none", cursor: "pointer" }}
        />
        <input
          type="text"
          value={hex}
          onChange={(e) => setHex(e.target.value)}
          aria-label="Hex colour"
          spellCheck={false}
          style={{ width: 130, padding: "10px 12px", border: "1px solid var(--rule-strong)", background: "var(--surface)", color: "var(--fg)", fontFamily: "var(--mono)" }}
        />
        <button type="submit" className="btn" disabled={loading}>
          {loading ? "Matching…" : "Find nearest"} <span className="arr">→</span>
        </button>
      </form>
      {error && (
        <div className="field-error" role="alert" style={{ marginTop: 16 }}>
          {error}
        </div>
      )}
      {submitted && !loading && (
        <div style={{ marginTop: 24, maxWidth: 560 }}>
          <MatchList matches={matches} offline={source === "offline"} />
        </div>
      )}
      {submitted && !loading && matches.length === 0 && (
        <p style={{ marginTop: 16, color: "var(--fg-mute)" }}>
          <Mono>No shades in the catalogue yet — seed the backend first.</Mono>
        </p>
      )}
    </div>
  );
}
