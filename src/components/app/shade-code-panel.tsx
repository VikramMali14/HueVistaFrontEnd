"use client";

import { useEffect, useMemo, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api, HttpError } from "@/lib/api";
import {
  SCHEME_LIMITS,
  decodeShadeCode,
  encodeShadeCode,
  hasScheme,
  normalizeSchemePart,
  type ShadeCodeScheme,
} from "@/lib/shade-codes";
import type { OrgResponse, PaintShade } from "@/lib/types";

const MAX_RESULTS = 8;
const EMPTY: ShadeCodeScheme = { prefix: "", infix: "", suffix: "" };

/**
 * Retailer-facing: the shop's shade-code scheme. ONE pattern — prefix, a pair
 * inserted after the first two characters, suffix — replaces a custom code per
 * shade. Everyone visualising under the shop sees codes encoded with it, and
 * the checker below encodes/decodes any code on the spot, so nobody has to
 * open a project on the site to read a shade off a customer code.
 */
export function ShadeCodePanel({ shades, org: orgProp }: { shades: ReadonlyArray<PaintShade>; org?: OrgResponse | null }) {
  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<OrgResponse | null>(null);
  const [saved, setSaved] = useState<ShadeCodeScheme>(EMPTY);
  const [draft, setDraft] = useState<ShadeCodeScheme>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // The portal page fetches the orgs once and passes the shop org down;
        // fetch here only when that page-level fetch wasn't available.
        const retailer =
          orgProp !== undefined
            ? orgProp
            : ((await api.listMyOrgs()).find((o) => o.type === "RETAILER") ?? null);
        setOrg(retailer);
        if (retailer) {
          const scheme = await api.getShadeCodeScheme(retailer.id);
          setSaved(scheme);
          setDraft(scheme);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load your shade-code scheme.");
      } finally {
        setLoading(false);
      }
    })();
  }, [orgProp]);

  const dirty =
    draft.prefix !== saved.prefix || draft.infix !== saved.infix || draft.suffix !== saved.suffix;

  const setPart = (part: keyof ShadeCodeScheme, value: string) => {
    setDraft((prev) => ({ ...prev, [part]: normalizeSchemePart(value, SCHEME_LIMITS[part]) }));
    setNotice(null);
    setError(null);
  };

  const save = async () => {
    if (!org) return;
    setSaving(true);
    setError(null);
    try {
      const scheme = await api.updateShadeCodeScheme(org.id, draft);
      setSaved(scheme);
      setDraft(scheme);
      setNotice(hasScheme(scheme) ? "Scheme saved — customers now see the coded numbers." : "Scheme cleared — customers see no codes.");
    } catch (e) {
      if (e instanceof HttpError) setError(e.message);
      else setError("Could not save the scheme. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Preview on a familiar example so the rule reads at a glance.
  const exampleCode = shades[0]?.code ?? "L124";

  if (loading) {
    return (
      <div style={{ display: "inline-flex", alignItems: "center", gap: 10, color: "var(--fg-mute)" }}>
        <Spinner size={14} color="var(--accent)" /> <Mono>Loading your shade-code scheme…</Mono>
      </div>
    );
  }

  if (!org) {
    return (
      <p style={{ font: "400 17px/1.5 var(--sans)", color: "var(--fg-mute)" }}>
        Set up your shop under “Active codes” first — the shade-code scheme belongs to your shop.
      </p>
    );
  }

  return (
    <div>
      {/* ── Pattern editor ── */}
      <div style={{ border: "1px solid var(--rule)", padding: 20, marginBottom: 28, display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
          <PartInput
            label="Prefix"
            hint={`Up to ${SCHEME_LIMITS.prefix} letters/digits before the code`}
            value={draft.prefix}
            maxLength={SCHEME_LIMITS.prefix}
            onChange={(v) => setPart("prefix", v)}
          />
          <PartInput
            label="Pair after 2 characters"
            hint={`Up to ${SCHEME_LIMITS.infix} letters/digits inside the code`}
            value={draft.infix}
            maxLength={SCHEME_LIMITS.infix}
            onChange={(v) => setPart("infix", v)}
          />
          <PartInput
            label="Suffix"
            hint={`Up to ${SCHEME_LIMITS.suffix} letters/digits after the code`}
            value={draft.suffix}
            maxLength={SCHEME_LIMITS.suffix}
            onChange={(v) => setPart("suffix", v)}
          />
        </div>

        {/* Live example of the rule on a real code. */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <Mono>Example</Mono>
          <span style={{ font: "400 15px/1.4 var(--mono)", color: "var(--fg)" }}>
            {exampleCode} →{" "}
            {hasScheme(draft) ? (
              <>
                <SchemePart>{draft.prefix}</SchemePart>
                {exampleCode.slice(0, 2)}
                <SchemePart>{draft.infix}</SchemePart>
                {exampleCode.slice(2)}
                <SchemePart>{draft.suffix}</SchemePart>
              </>
            ) : (
              <span style={{ color: "var(--fg-mute)" }}>no scheme — customers see no code at all</span>
            )}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <Button onClick={() => void save()} disabled={saving || !dirty}>
            {saving ? <><Spinner size={14} color="currentColor" /> Saving…</> : <>Save scheme <span className="arr">→</span></>}
          </Button>
          {notice && !dirty && <Mono>{notice}</Mono>}
          {dirty && <Mono>Unsaved changes</Mono>}
        </div>
      </div>

      {error && <div className="field-error" role="alert" style={{ marginBottom: 16 }}>{error}</div>}

      {/* ── Checker / debugger ── */}
      <CodeChecker scheme={draft} shades={shades} />
    </div>
  );
}

/** A highlighted scheme part inside the example line. */
function SchemePart({ children }: { children: string }) {
  if (!children) return null;
  return <span style={{ color: "var(--accent)", fontWeight: 600 }}>{children}</span>;
}

function PartInput({
  label,
  hint,
  value,
  maxLength,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  maxLength: number;
  onChange: (value: string) => void;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Mono>{label}</Mono>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        spellCheck={false}
        placeholder="—"
        style={{
          padding: "10px 12px",
          border: "1px solid var(--rule-strong)",
          background: "var(--surface)",
          color: "var(--fg)",
          fontFamily: "var(--mono)",
          letterSpacing: ".18em",
          fontSize: 16,
          textTransform: "uppercase",
        }}
      />
      <span style={{ font: "400 12px/1.4 var(--sans)", color: "var(--fg-mute)" }}>{hint}</span>
    </label>
  );
}

/**
 * The debugger: both directions in one place, so the counter never opens a
 * project just to read a code. "Find" searches the catalogue by shade name or
 * real code and shows the customer code; "Read" takes a customer code and
 * gives back the real shade (company · code · name).
 */
function CodeChecker({
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
