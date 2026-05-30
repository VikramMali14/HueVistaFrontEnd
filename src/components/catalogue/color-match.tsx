"use client";

import { useState } from "react";
import { Mono } from "@/components/ui/eyebrow";

interface MatchResult {
  shadeCode: string;
  name: string;
  hexCode: string;
  brandName?: string;
}

/**
 * Pick or paste any colour → the backend returns the nearest real catalogue shades
 * by CIELAB ΔE (GET /api/shades/match, public, same-origin via the Next rewrite).
 */
export function ColorMatch() {
  const [hex, setHex] = useState("#a47148");
  const [results, setResults] = useState<MatchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function findNearest() {
    setLoading(true);
    setError(null);
    try {
      const clean = hex.replace(/^#/, "");
      const res = await fetch(`/api/shades/match?hex=${encodeURIComponent(clean)}&limit=5`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error("Could not match that colour. Use a 6-digit hex like #A47148.");
      setResults((await res.json()) as MatchResult[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not match that colour.");
      setResults(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ border: "1px solid var(--rule)", padding: "24px 24px 28px", marginBottom: 48 }}>
      <Mono brass>Match any colour</Mono>
      <p style={{ font: "300 italic 18px/1.5 var(--serif)", color: "var(--fg-soft)", margin: "10px 0 18px", maxWidth: "52ch" }}>
        Pick or paste any colour and we&apos;ll find the nearest real catalogue shades by perceptual distance.
      </p>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
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
        <button type="button" className="btn" onClick={() => void findNearest()} disabled={loading}>
          {loading ? "Matching…" : "Find nearest"} <span className="arr">→</span>
        </button>
      </div>
      {error && (
        <div className="field-error" role="alert" style={{ marginTop: 16 }}>
          {error}
        </div>
      )}
      {results && results.length > 0 && (
        <div style={{ display: "flex", gap: 16, marginTop: 24, flexWrap: "wrap" }}>
          {results.map((r) => (
            <div key={r.shadeCode} style={{ width: 120 }}>
              <div
                style={{
                  aspectRatio: "1 / 1",
                  background: r.hexCode?.startsWith("#") ? r.hexCode : `#${r.hexCode}`,
                  border: "1px solid var(--rule-strong)",
                }}
              />
              <div style={{ marginTop: 8, font: "300 italic 15px/1.2 var(--serif)" }}>{r.name}</div>
              <Mono>{r.shadeCode}</Mono>
            </div>
          ))}
        </div>
      )}
      {results && results.length === 0 && (
        <p style={{ marginTop: 16, color: "var(--fg-mute)" }}>
          <Mono>No shades in the catalogue yet — seed the backend first.</Mono>
        </p>
      )}
    </div>
  );
}
