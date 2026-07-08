"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { SHADES } from "@/lib/shades";
import { api, HttpError } from "@/lib/api";
import type { ComboScope, OrgResponse, PaintShade, RetailerCombo, RetailerComboShade } from "@/lib/types";

/** The three slots of a combination, in the studio's palette role order. */
const SLOTS = ["Main wall", "Accent wall", "Trim"] as const;

const SCOPES: ReadonlyArray<{ id: ComboScope; label: string }> = [
  { id: "INTERIOR", label: "Interior" },
  { id: "EXTERIOR", label: "Exterior" },
];

/**
 * Retailer-facing manager for the shop's suggested three-shade combinations
 * ("shop picks"). Whatever is saved here appears in the studio's AI Suggest tab
 * for everyone visualising under this shop — customers, guests and staff — right
 * after they upload a photo.
 */
export function ShopCombos({ shades }: { shades?: ReadonlyArray<PaintShade> }) {
  const catalogue = useMemo<ReadonlyArray<PaintShade>>(
    () => (shades && shades.length > 0 ? shades : SHADES),
    [shades],
  );

  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<OrgResponse | null>(null);
  const [combos, setCombos] = useState<RetailerCombo[]>([]);
  const [error, setError] = useState<string | null>(null);

  // --- The "new combination" form ---
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<ComboScope>("INTERIOR");
  const [picked, setPicked] = useState<Array<PaintShade | null>>([null, null, null]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setError(null);
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
    setPicked((prev) => prev.map((s, i) => (i === index ? shade : s)));
  }, []);

  const save = useCallback(async () => {
    if (!org) return;
    const trio = picked.filter((s): s is PaintShade => s !== null);
    if (!name.trim() || trio.length !== 3) return;
    setSaving(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
        scope,
        shades: trio.map<RetailerComboShade>((s) => ({ code: s.code, name: s.name, hex: s.hex })),
      };
      const created = await api.createCombo(org.id, body);
      setCombos((prev) => [created, ...prev]);
      setName("");
      setPicked([null, null, null]);
      setFormOpen(false);
    } catch (e) {
      if (e instanceof HttpError) setError(e.message);
      else setError("Could not save the combination. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [org, name, scope, picked]);

  const remove = useCallback(
    async (comboId: string) => {
      if (!org) return;
      const prev = combos;
      setCombos((cur) => cur.filter((c) => c.id !== comboId)); // optimistic
      try {
        await api.deleteCombo(org.id, comboId);
      } catch (e) {
        setCombos(prev); // restore on failure
        setError(e instanceof Error ? e.message : "Could not remove the combination.");
      }
    },
    [org, combos],
  );

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--fg-mute)" }}>
        <Spinner /> Loading your combinations…
      </div>
    );
  }

  if (!org) {
    return (
      <p style={{ font: "400 14px/1.6 var(--sans)", color: "var(--fg-mute)" }}>
        Create your shop under “Active codes” first — combinations belong to your shop.
      </p>
    );
  }

  const canSave = Boolean(name.trim()) && picked.every((s) => s !== null) && !saving;

  return (
    <div>
      {error && (
        <p role="alert" style={{ font: "400 14px/1.5 var(--sans)", color: "var(--danger, #c0392b)", marginBottom: 16 }}>
          {error}
        </p>
      )}

      {combos.length === 0 && !formOpen && (
        <p style={{ font: "400 14px/1.6 var(--sans)", color: "var(--fg-mute)", marginBottom: 16 }}>
          No combinations yet. Add your first — it appears in your customers’ studio the moment
          they upload a photo.
        </p>
      )}

      {combos.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14, marginBottom: 20 }}>
          {combos.map((c) => (
            <div key={c.id} style={{ border: "1px solid var(--rule-strong)", borderRadius: 8, padding: 14, background: "var(--surface)" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
                <span style={{ font: "500 14px/1.3 var(--sans)", color: "var(--fg)" }}>{c.name}</span>
                <Mono>{c.scope === "EXTERIOR" ? "Exterior" : "Interior"}</Mono>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {c.shades.map((s, i) => (
                  <span key={`${c.id}-${i}`} style={{ display: "flex", alignItems: "center", gap: 10, font: "400 12px/1.3 var(--sans)", color: "var(--fg-soft)" }}>
                    <span aria-hidden style={{ width: 22, height: 22, borderRadius: 4, background: s.hex, border: "1px solid var(--rule-strong)", flexShrink: 0 }} />
                    <span style={{ minWidth: 74, color: "var(--fg-mute)" }}>{SLOTS[i]}</span>
                    <span>{s.name}</span>
                    <Mono style={{ marginLeft: "auto" }}>{s.code}</Mono>
                  </span>
                ))}
              </div>
              <div style={{ marginTop: 12, textAlign: "right" }}>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => void remove(c.id)}
                  aria-label={`Remove the combination ${c.name}`}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!formOpen ? (
        <Button onClick={() => setFormOpen(true)}>+ Add a combination</Button>
      ) : (
        <div style={{ border: "1px solid var(--rule-strong)", borderRadius: 8, padding: 18, background: "var(--surface)", maxWidth: 560 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <label style={{ flex: "1 1 220px" }}>
              <Mono style={{ display: "block", marginBottom: 6 }}>Name</Mono>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                placeholder="Warm evening hall"
                style={{ width: "100%", padding: "9px 12px", border: "1px solid var(--rule-strong)", borderRadius: 6, background: "var(--bg)", color: "var(--fg)", font: "400 14px/1 var(--sans)" }}
              />
            </label>
            <div>
              <Mono style={{ display: "block", marginBottom: 6 }}>For</Mono>
              <div role="group" aria-label="Interior or exterior" style={{ display: "inline-flex", border: "1px solid var(--rule-strong)", borderRadius: 6, overflow: "hidden" }}>
                {SCOPES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setScope(s.id)}
                    aria-pressed={scope === s.id}
                    style={{
                      padding: "9px 14px",
                      border: "none",
                      cursor: "pointer",
                      font: "500 13px/1 var(--sans)",
                      background: scope === s.id ? "var(--fg)" : "transparent",
                      color: scope === s.id ? "var(--bg)" : "var(--fg-soft)",
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {SLOTS.map((slot, i) => (
            <ShadeSlot
              key={slot}
              label={slot}
              catalogue={catalogue}
              value={picked[i] ?? null}
              onPick={(s) => setSlot(i, s)}
            />
          ))}

          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <Button onClick={() => void save()} disabled={!canSave}>
              {saving ? "Saving…" : "Save combination"}
            </Button>
            <button type="button" className="btn btn-ghost" onClick={() => setFormOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One slot of the form: search the live catalogue by name or code, pick a shade.
 * Shows the chosen shade as a chip that can be cleared.
 */
function ShadeSlot({
  label,
  catalogue,
  value,
  onPick,
}: {
  label: string;
  catalogue: ReadonlyArray<PaintShade>;
  value: PaintShade | null;
  onPick: (shade: PaintShade | null) => void;
}) {
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return catalogue
      .filter((s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q))
      .slice(0, 6);
  }, [catalogue, query]);

  return (
    <div style={{ marginBottom: 12 }}>
      <Mono style={{ display: "block", marginBottom: 6 }}>{label}</Mono>
      {value ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "8px 12px", border: "1px solid var(--rule-strong)", borderRadius: 6, background: "var(--bg)" }}>
          <span aria-hidden style={{ width: 20, height: 20, borderRadius: 4, background: value.hex, border: "1px solid var(--rule-strong)" }} />
          <span style={{ font: "400 13px/1 var(--sans)", color: "var(--fg)" }}>{value.name}</span>
          <Mono>{value.code}</Mono>
          <button
            type="button"
            onClick={() => onPick(null)}
            aria-label={`Clear the ${label.toLowerCase()} shade`}
            style={{ border: "none", background: "none", color: "var(--fg-mute)", cursor: "pointer", font: "500 13px/1 var(--sans)", padding: 2 }}
          >
            ✕
          </button>
        </span>
      ) : (
        <div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by shade name or code"
            aria-label={`Search a shade for ${label.toLowerCase()}`}
            style={{ width: "100%", maxWidth: 360, padding: "9px 12px", border: "1px solid var(--rule-strong)", borderRadius: 6, background: "var(--bg)", color: "var(--fg)", font: "400 13px/1 var(--sans)" }}
          />
          {matches.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6, maxWidth: 360 }}>
              {matches.map((s) => (
                <button
                  key={s.code}
                  type="button"
                  onClick={() => {
                    onPick(s);
                    setQuery("");
                  }}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", border: "1px solid var(--rule)", borderRadius: 6, background: "transparent", cursor: "pointer", textAlign: "left" }}
                >
                  <span aria-hidden style={{ width: 18, height: 18, borderRadius: 4, background: s.hex, border: "1px solid var(--rule-strong)", flexShrink: 0 }} />
                  <span style={{ font: "400 13px/1.2 var(--sans)", color: "var(--fg)" }}>{s.name}</span>
                  <Mono style={{ marginLeft: "auto" }}>{s.code}</Mono>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
