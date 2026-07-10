"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api, HttpError } from "@/lib/api";
import type { ComboScope, OrgResponse, PaintShade, RetailerCombo } from "@/lib/types";

/** The three combo slots, in the studio's palette role order. */
const SLOT_LABELS = ["Main wall", "Accent wall", "Trim"] as const;
const MAX_RESULTS = 8;

/**
 * Retailer-facing: predefine three-shade combinations ("shop picks") that the
 * studio's AI Suggest tab offers to everyone visualising under this shop —
 * staff, entitled customers, and guests on an access code. Slot order matches
 * the studio's Apply-all mapping: main wall, accent wall, trim.
 */
export function ShopCombos({ shades }: { shades: ReadonlyArray<PaintShade> }) {
  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<OrgResponse | null>(null);
  const [combos, setCombos] = useState<RetailerCombo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [scope, setScope] = useState<ComboScope>("INTERIOR");
  const [slots, setSlots] = useState<Array<PaintShade | null>>([null, null, null]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const orgs = await api.listMyOrgs();
        const retailer = orgs.find((o) => o.type === "RETAILER") ?? null;
        setOrg(retailer);
        if (retailer) setCombos(await api.listCombos(retailer.id));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load your combinations.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const setSlot = useCallback((index: number, shade: PaintShade | null) => {
    setSlots((prev) => prev.map((s, i) => (i === index ? shade : s)));
  }, []);

  const complete = name.trim().length > 0 && slots.every(Boolean);

  const create = useCallback(async () => {
    if (!org || !complete) return;
    setSaving(true);
    setError(null);
    try {
      const combo = await api.createCombo(org.id, {
        name: name.trim(),
        scope,
        shades: (slots as PaintShade[]).map((s) => ({ code: s.code, name: s.name, hex: s.hex })),
      });
      setCombos((prev) => [combo, ...prev]);
      setName("");
      setSlots([null, null, null]);
    } catch (e) {
      if (e instanceof HttpError) setError(e.message);
      else setError("Could not save the combination. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [org, complete, name, scope, slots]);

  const remove = useCallback(async (comboId: string) => {
    if (!org) return;
    setDeleting(comboId);
    setError(null);
    try {
      await api.deleteCombo(org.id, comboId);
      setCombos((prev) => prev.filter((c) => c.id !== comboId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove the combination.");
    } finally {
      setDeleting(null);
    }
  }, [org]);

  if (loading) {
    return (
      <div style={{ display: "inline-flex", alignItems: "center", gap: 10, color: "var(--fg-mute)" }}>
        <Spinner size={14} color="var(--accent)" /> <Mono>Loading your combinations…</Mono>
      </div>
    );
  }

  // The AccessCodes section above owns the one-time shop setup; until it exists
  // there is nothing to attach combinations to.
  if (!org) {
    return (
      <p style={{ font: "400 17px/1.5 var(--sans)", color: "var(--fg-mute)" }}>
        Set up your shop under “Active codes” first — combinations belong to your shop.
      </p>
    );
  }

  const interior = combos.filter((c) => c.scope === "INTERIOR");
  const exterior = combos.filter((c) => c.scope === "EXTERIOR");

  return (
    <div>
      {/* ── Builder ── */}
      <div style={{ border: "1px solid var(--rule)", padding: 20, marginBottom: 28, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Combination name — e.g. Warm evening"
            aria-label="Combination name"
            maxLength={80}
            style={{ flex: 1, minWidth: 220, padding: "10px 12px", border: "1px solid var(--rule-strong)", background: "var(--surface)", color: "var(--fg)", font: "400 16px/1 var(--sans)" }}
          />
          <div role="group" aria-label="Interior or exterior" style={{ display: "flex", gap: 8 }}>
            {(["INTERIOR", "EXTERIOR"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScope(s)}
                aria-pressed={scope === s}
                style={{
                  padding: "8px 14px",
                  cursor: "pointer",
                  background: "transparent",
                  border: "1px solid " + (scope === s ? "var(--accent)" : "var(--rule)"),
                  color: scope === s ? "var(--accent)" : "var(--fg-mute)",
                  font: "400 11px/1 var(--mono)",
                  letterSpacing: ".18em",
                }}
              >
                {s === "INTERIOR" ? "Interior" : "Exterior"}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          {SLOT_LABELS.map((label, i) => (
            <SlotPicker
              key={label}
              label={label}
              shades={shades}
              value={slots[i] ?? null}
              onChange={(s) => setSlot(i, s)}
            />
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <Button onClick={() => void create()} disabled={saving || !complete}>
            {saving ? <><Spinner size={14} color="currentColor" /> Saving…</> : <>Add combination <span className="arr">→</span></>}
          </Button>
          {!complete && (
            <Mono>Name it and pick all three shades</Mono>
          )}
        </div>
      </div>

      {error && <div className="field-error" role="alert" style={{ marginBottom: 16 }}>{error}</div>}

      {combos.length === 0 ? (
        <p style={{ font: "400 17px/1.5 var(--sans)", color: "var(--fg-mute)" }}>
          No combinations yet. Build one above — your customers see it in the studio the moment
          their photo is up.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {([["Interior", interior], ["Exterior", exterior]] as const).map(([label, list]) =>
            list.length === 0 ? null : (
              <div key={label}>
                <Mono style={{ display: "block", marginBottom: 12 }}>{label}</Mono>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
                  {list.map((combo) => (
                    <div key={combo.id} style={{ border: "1px solid var(--rule)", padding: 16 }}>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
                        <span style={{ font: "500 16px/1.3 var(--serif)", color: "var(--fg)" }}>{combo.name}</span>
                        <button
                          type="button"
                          onClick={() => void remove(combo.id)}
                          disabled={deleting === combo.id}
                          aria-label={`Remove ${combo.name}`}
                          style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--fg-mute)", font: "400 9.5px/1 var(--mono)", letterSpacing: ".2em", textTransform: "uppercase" }}
                        >
                          {deleting === combo.id ? "Removing…" : "Remove"}
                        </button>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {combo.shades.map((s, i) => (
                          <div key={`${combo.id}-${i}`} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span aria-hidden style={{ width: 24, height: 24, background: s.hex, border: "1px solid var(--rule-strong)", borderRadius: 4, flexShrink: 0 }} />
                            <span style={{ font: "400 14px/1.2 var(--sans)", color: "var(--fg)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                            <Mono>{s.code}</Mono>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/**
 * One combo slot: search the catalogue by name/code/hex, pick a shade. Chosen
 * state shows the swatch + name + code with a clear (✕) to re-pick.
 */
function SlotPicker({
  label,
  shades,
  value,
  onChange,
}: {
  label: string;
  shades: ReadonlyArray<PaintShade>;
  value: PaintShade | null;
  onChange: (shade: PaintShade | null) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const matches = useMemo(() => {
    if (!q) return [];
    const out: PaintShade[] = [];
    for (const s of shades) {
      if (
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        s.hex.toLowerCase().includes(q)
      ) {
        out.push(s);
        if (out.length >= MAX_RESULTS) break;
      }
    }
    return out;
  }, [shades, q]);

  return (
    <div style={{ border: "1px solid var(--rule)", padding: 12 }}>
      <Mono style={{ display: "block", marginBottom: 8 }}>{label}</Mono>
      {value ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span aria-hidden style={{ width: 30, height: 30, background: value.hex, border: "1px solid var(--rule-strong)", borderRadius: 4, flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", font: "400 14px/1.2 var(--sans)", color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value.name}</span>
            <Mono>{value.code}</Mono>
          </span>
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={`Clear ${label} shade`}
            style={{ background: "transparent", border: "1px solid var(--rule)", borderRadius: 6, cursor: "pointer", color: "var(--fg-mute)", padding: "6px 9px", font: "400 11px/1 var(--mono)" }}
          >
            ✕
          </button>
        </div>
      ) : (
        <div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or code"
            aria-label={`Search a shade for ${label}`}
            style={{ width: "100%", padding: "9px 11px", border: "1px solid var(--rule-strong)", background: "var(--surface)", color: "var(--fg)", font: "400 14px/1 var(--sans)" }}
          />
          {q && (
            <div role="listbox" aria-label={`Shades matching ${query}`} style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 2, maxHeight: 220, overflowY: "auto" }}>
              {matches.length === 0 ? (
                <span style={{ font: "400 13px/1.4 var(--sans)", color: "var(--fg-mute)", padding: "6px 2px" }}>
                  No shades match “{query}”.
                </span>
              ) : (
                matches.map((s) => (
                  <button
                    key={s.code}
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => {
                      onChange(s);
                      setQuery("");
                    }}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 8px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left", borderRadius: 6 }}
                  >
                    <span aria-hidden style={{ width: 20, height: 20, background: s.hex, border: "1px solid var(--rule-strong)", borderRadius: 4, flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, font: "400 13.5px/1.2 var(--sans)", color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                    <Mono>{s.code}</Mono>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
