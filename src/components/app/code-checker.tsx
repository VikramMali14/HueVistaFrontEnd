"use client";

import { useMemo, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { decodeShadeCode, encodeShadeCode, hasScheme, type ShadeCodeScheme } from "@/lib/shade-codes";
import type { PaintShade } from "@/lib/types";

const MAX_RESULTS = 8;

/**
 * The shade-code debugger: both directions in one place, so the counter never
 * opens a project just to read a code. "Read" takes a customer code and gives
 * back the real shade (company · code · name); "Find" searches the catalogue by
 * shade name or real code and shows the customer code. Shared by the portal's
 * shade-code panel and the dashboard's top-of-page checker.
 */
export function CodeChecker({
  scheme,
  shades,
}: {
  scheme: ShadeCodeScheme;
  shades: ReadonlyArray<PaintShade>;
}) {
  const [mode, setMode] = useState<"read" | "find">("read");
  const [query, setQuery] = useState("");
  const q = query.trim();

  const byCode = useMemo(() => {
    const m = new Map<string, PaintShade>();
    for (const s of shades) m.set(s.code.toUpperCase(), s);
    return m;
  }, [shades]);

  const findMatches = useMemo(() => {
    if (mode !== "find" || !q) return [];
    const needle = q.toLowerCase();
    const out: PaintShade[] = [];
    for (const s of shades) {
      if (s.name.toLowerCase().includes(needle) || s.code.toLowerCase().includes(needle)) {
        out.push(s);
        if (out.length >= MAX_RESULTS) break;
      }
    }
    return out;
  }, [mode, q, shades]);

  const decoded = useMemo(() => {
    if (mode !== "read" || !q) return null;
    if (!hasScheme(scheme)) return { code: q.toUpperCase(), match: byCode.get(q.toUpperCase()) ?? null };
    const code = decodeShadeCode(scheme, q);
    if (!code) return { code: null, match: null };
    return { code, match: byCode.get(code) ?? null };
  }, [mode, q, scheme, byCode]);

  if (!hasScheme(scheme)) {
    return (
      <p style={{ font: "400 15px/1.6 var(--sans)", color: "var(--fg-mute)", maxWidth: "56ch" }}>
        Set a prefix, pair or suffix above to switch on customer codes — the checker appears here
        so you can encode and decode any shade without leaving this page.
      </p>
    );
  }

  return (
    <div style={{ border: "1px solid var(--rule)", padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <Mono>Code checker</Mono>
        <div role="group" aria-label="Checker direction" style={{ display: "flex", gap: 8 }}>
          {([["read", "Read a customer code"], ["find", "Find a customer code"]] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => { setMode(id); setQuery(""); }}
              aria-pressed={mode === id}
              style={{
                padding: "8px 14px",
                cursor: "pointer",
                background: "transparent",
                border: "1px solid " + (mode === id ? "var(--accent)" : "var(--rule)"),
                color: mode === id ? "var(--accent)" : "var(--fg-mute)",
                font: "400 11px/1 var(--mono)",
                letterSpacing: ".18em",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={mode === "read" ? "Customer code from a screen or PDF — e.g. ABL1XY24CD" : "Shade name or real code"}
        aria-label={mode === "read" ? "Customer code to decode" : "Shade name or code to encode"}
        spellCheck={false}
        style={{
          width: "100%",
          maxWidth: 460,
          padding: "11px 13px",
          border: "1px solid var(--rule-strong)",
          background: "var(--surface)",
          color: "var(--fg)",
          fontFamily: "var(--mono)",
          letterSpacing: mode === "read" ? ".14em" : undefined,
          fontSize: 15,
        }}
      />

      {mode === "read" && q && decoded && (
        <div style={{ marginTop: 14 }}>
          {decoded.code === null ? (
            <p style={{ font: "400 14.5px/1.5 var(--sans)", color: "var(--fg-mute)" }}>
              That doesn&apos;t follow your scheme — check the prefix, the pair after the first two
              characters, and the suffix.
            </p>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <Mono>Real code</Mono>
              <span style={{ font: "600 17px/1 var(--mono)", color: "var(--fg)" }}>{decoded.code}</span>
              {decoded.match ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                  <span aria-hidden style={{ width: 22, height: 22, background: decoded.match.hex, border: "1px solid var(--rule-strong)", borderRadius: 4 }} />
                  <span style={{ font: "400 15px/1.2 var(--sans)", color: "var(--fg)" }}>
                    {decoded.match.name}
                  </span>
                  <Mono>{decoded.match.brand}</Mono>
                </span>
              ) : (
                <span style={{ font: "400 13.5px/1.4 var(--sans)", color: "var(--fg-mute)" }}>
                  not in the catalogue — the code decodes, but no shade carries it
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {mode === "find" && q && (
        <div role="listbox" aria-label={`Shades matching ${query}`} style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 2, maxHeight: 260, overflowY: "auto" }}>
          {findMatches.length === 0 ? (
            <span style={{ font: "400 13px/1.4 var(--sans)", color: "var(--fg-mute)", padding: "6px 2px" }}>
              No shades match “{query}”.
            </span>
          ) : (
            findMatches.map((s) => (
              <div key={s.code} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 8px" }}>
                <span aria-hidden style={{ width: 20, height: 20, background: s.hex, border: "1px solid var(--rule-strong)", borderRadius: 4, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, font: "400 13.5px/1.2 var(--sans)", color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.name} <Mono>· {s.code}</Mono>
                </span>
                <span style={{ font: "600 14px/1 var(--mono)", color: "var(--accent)" }}>
                  {encodeShadeCode(scheme, s.code)}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      <p style={{ font: "400 13px/1.6 var(--sans)", color: "var(--fg-mute)", marginTop: 16, maxWidth: "58ch" }}>
        Customers only ever see the coded number. You read it back by dropping your prefix and
        suffix and the pair after the first two characters — or paste it here.
      </p>
    </div>
  );
}
