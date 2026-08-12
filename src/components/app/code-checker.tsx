"use client";

import { useMemo, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import {
  decodeShadeCodeAnyScheme,
  encodeShadeCode,
  hasScheme,
  schemeTimeline,
  type RetiredShadeCodeScheme,
  type SchemePeriod,
  type ShadeCodeScheme,
} from "@/lib/shade-codes";
import type { PaintShade } from "@/lib/types";

const MAX_RESULTS = 8;

/** "AB · XY · CD" — the parts of a pattern, skipping the ones it doesn't use. */
function describeScheme(s: RetiredShadeCodeScheme): string {
  const parts = [s.prefix, s.infix, s.suffix].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "no parts";
}

function fmtRetired(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "earlier"
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** A date and the time of day, because two patterns can be swapped on one afternoon. */
function fmtMoment(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

/** "12 Mar 2026, 4:05 pm → 8 Aug 2026, 11:20 am", or the open-ended forms. */
function fmtPeriod(period: SchemePeriod): string {
  const from = fmtMoment(period.from);
  const to = fmtMoment(period.to);
  if (period.live) return from ? `${from} → in use now` : "In use now";
  if (from && to) return `${from} → ${to}`;
  if (to) return `Until ${to}`;
  return "Dates not recorded";
}

/** True when this period is the pattern that just read the entered code. */
function readBy(period: SchemePeriod, via: RetiredShadeCodeScheme | null): boolean {
  if (via === null) return period.live;
  return (
    !period.live
    && period.prefix === via.prefix
    && period.infix === via.infix
    && period.suffix === via.suffix
    && (period.to ?? null) === (via.retiredAt ?? null)
  );
}

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

  const timeline = useMemo(() => schemeTimeline(scheme), [scheme]);

  const decoded = useMemo(() => {
    if (mode !== "read" || !q) return null;
    if (!hasScheme(scheme)) {
      return { code: q.toUpperCase(), match: byCode.get(q.toUpperCase()) ?? null, via: null };
    }
    // Retired patterns are tried too, so a code from an older colour board still reads.
    const hit = decodeShadeCodeAnyScheme(scheme, q);
    if (!hit) return { code: null, match: null, via: null };
    return { code: hit.code, match: byCode.get(hit.code) ?? null, via: hit.via };
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
                font: "400 12px/1 var(--mono)",
                letterSpacing: ".18em",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Read mode uppercases as you type. Decoding was always case-insensitive, but
          the box echoed back whatever case was typed, so a code that read fine looked
          like it had been rejected on a technicality. */}
      <input
        value={query}
        onChange={(e) => setQuery(mode === "read" ? e.target.value.toUpperCase() : e.target.value)}
        placeholder={mode === "read" ? "e.g. ABL1XY24CD" : "Shade name or real code"}
        aria-label={mode === "read" ? "Customer code to decode" : "Shade name or code to encode"}
        spellCheck={false}
        autoCapitalize={mode === "read" ? "characters" : undefined}
        autoComplete="off"
        style={{
          width: "100%",
          maxWidth: 460,
          padding: "11px 13px",
          border: "1px solid var(--rule-strong)",
          background: "var(--surface)",
          color: "var(--fg)",
          fontFamily: "var(--code)",
          letterSpacing: mode === "read" ? ".14em" : undefined,
          fontSize: 15,
        }}
      />
      <p style={{ font: "400 12.5px/1.5 var(--sans)", color: "var(--fg-mute)", margin: "8px 0 0", maxWidth: "58ch" }}>
        {mode === "read"
          ? "Paste a customer code off a screen, a PDF board or a printed estimate — upper or lower case, either reads."
          : "Search the catalogue by shade name or the manufacturer's own code."}
      </p>

      {mode === "read" && q && decoded && (
        <div style={{ marginTop: 14 }}>
          {decoded.code === null ? (
            <p style={{ font: "400 14.5px/1.5 var(--sans)", color: "var(--fg-mute)" }}>
              That doesn&apos;t follow your scheme{(scheme.retired?.length ?? 0) > 0 ? ", or any you've used before" : ""} —
              check the prefix, the pair after the first two characters, and the suffix.
            </p>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <Mono>Real code</Mono>
              <span style={{ font: "600 17px/1 var(--code)", color: "var(--fg)" }}>{decoded.code}</span>
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
              {/* Which pattern read it. Silent for the live one — that is the expected
                  case and saying so on every lookup would be noise — but named for a
                  retired one, because "this card is from your old numbering" is exactly
                  what the counter needs to know before quoting from it. */}
              {decoded.via && (
                <span
                  style={{ font: "400 12.5px/1.4 var(--sans)", color: "var(--fg-mute)", width: "100%" }}
                >
                  Read with an older scheme of yours ({describeScheme(decoded.via)}
                  {decoded.via.retiredAt ? `, retired ${fmtRetired(decoded.via.retiredAt)}` : ""}
                  ) — your current one would not have matched it.
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
              // Keyed by company AND code: two companies can carry the same code, and
              // React silently drops the duplicate when the code alone is the key.
              <div key={`${s.brand}-${s.code}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 8px" }}>
                <span aria-hidden style={{ width: 20, height: 20, background: s.hex, border: "1px solid var(--rule-strong)", borderRadius: 4, flexShrink: 0 }} />
                {/* The company is what tells two same-named shades apart — searching
                    "banana cream" returned a 7850 and a 2010 with nothing to choose
                    between them. "Read" showed the company all along. */}
                <span style={{ flex: 1, minWidth: 0, font: "400 13.5px/1.2 var(--sans)", color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.name} <Mono>· <span className="shade-code">{s.code}</span> · {s.brand}</Mono>
                </span>
                <span style={{ font: "600 14px/1 var(--code)", color: "var(--accent)" }}>
                  {encodeShadeCode(scheme, s.code)}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Every pattern this shop has issued codes under, and when.
          "Read with an older pattern" tells the counter the card is old; it does not
          tell them HOW old, which is the next question every time — a quote from a
          pattern retired last week is still worth honouring, one from two years ago
          probably is not. The dates are derived, not stored: each pattern ran from the
          moment the one before it was retired, so the retirement dates chain the whole
          history end to end. */}
      {timeline.length > 1 && (
        <details style={{ marginTop: 18, borderTop: "1px solid var(--rule)", paddingTop: 14 }}>
          <summary style={{ cursor: "pointer", font: "400 12px/1 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase", color: "var(--fg-mute)" }}>
            Pattern history · {timeline.length}
          </summary>
          <ul style={{ listStyle: "none", margin: "14px 0 0", padding: 0, display: "grid", gap: 10 }}>
            {timeline.map((period, i) => {
              const matched = mode === "read" && q !== "" && decoded?.code != null
                && readBy(period, decoded.via);
              return (
                <li
                  key={`${period.prefix}-${period.infix}-${period.suffix}-${period.to ?? "live"}-${i}`}
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "baseline",
                    gap: 10,
                    padding: "8px 10px",
                    border: "1px solid " + (matched ? "var(--accent)" : "var(--rule)"),
                    background: matched ? "rgba(var(--fg-rgb), .04)" : "transparent",
                  }}
                >
                  <span style={{ font: "600 14px/1 var(--code)", color: matched ? "var(--accent)" : "var(--fg)" }}>
                    {describeScheme(period)}
                  </span>
                  {period.live && <Mono brass>In use</Mono>}
                  <span style={{ font: "400 12.5px/1.4 var(--sans)", color: "var(--fg-mute)" }}>
                    {fmtPeriod(period)}
                  </span>
                  {matched && (
                    <span style={{ font: "500 12.5px/1.4 var(--sans)", color: "var(--accent)", width: "100%" }}>
                      This is the one that read the code above.
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      )}

      {/* Follows the tab. The decode explanation was left standing under "Find a
          customer code", where it describes the opposite direction. */}
      <p style={{ font: "400 13px/1.6 var(--sans)", color: "var(--fg-mute)", marginTop: 16, maxWidth: "58ch" }}>
        {mode === "read" ? (
          <>
            Read a code back by dropping your prefix and suffix and the pair after the first two
            characters — or paste it above and let this do it.
          </>
        ) : (
          <>
            Look up what a customer would have been shown for a shade, so you can quote the coded
            number without opening a project.
          </>
        )}
      </p>
    </div>
  );
}
