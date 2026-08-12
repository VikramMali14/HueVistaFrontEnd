"use client";

import { useEffect, useMemo, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api, HttpError } from "@/lib/api";
import type { OrgResponse, ShopBrandOption } from "@/lib/types";

/**
 * Retailer-facing: the paint companies this shop puts in front of people.
 *
 * A shop granted six companies but stocking two had to display all six — at its own
 * counter, in its kiosk, and to every customer it onboarded. This is the one switch that
 * fixes that, and it is deliberately global rather than per-surface: the backend resolves
 * every catalogue read through the same place, so there is no second screen where a
 * company the shop has switched off can reappear.
 *
 * The checkboxes are the DISTRIBUTOR's grant, not the whole platform catalogue. A shop
 * cannot show a company it was never assigned, so offering one here would be a control
 * that silently does nothing.
 */
export function ShopBrandsPanel({ org: orgProp }: { org?: OrgResponse | null }) {
  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<OrgResponse | null>(null);
  const [options, setOptions] = useState<ShopBrandOption[]>([]);
  // The saved state, kept so "Unsaved changes" is honest and Save can be disabled.
  const [saved, setSaved] = useState<{ restricted: boolean; shown: number[] }>({
    restricted: false,
    shown: [],
  });
  const [restricted, setRestricted] = useState(false);
  const [shown, setShown] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const retailer =
          orgProp !== undefined
            ? orgProp
            : ((await api.listMyOrgs()).find((o) => o.type === "RETAILER") ?? null);
        setOrg(retailer);
        if (retailer) {
          const v = await api.getVisibleBrands(retailer.id);
          setOptions(v.brands);
          const on = v.brands.filter((b) => b.shown).map((b) => b.id);
          setRestricted(v.restricted);
          setShown(new Set(on));
          setSaved({ restricted: v.restricted, shown: on });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load your paint companies.");
      } finally {
        setLoading(false);
      }
    })();
  }, [orgProp]);

  const dirty = useMemo(() => {
    if (restricted !== saved.restricted) return true;
    // While "show everything" is selected the tick state is not part of what gets
    // saved, so it must not count as a change.
    if (!restricted) return false;
    if (shown.size !== saved.shown.length) return true;
    return saved.shown.some((id) => !shown.has(id));
  }, [restricted, shown, saved]);

  const toggle = (id: number) => {
    setShown((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setNotice(null);
    setError(null);
  };

  const save = async () => {
    if (!org) return;
    setSaving(true);
    setError(null);
    try {
      const v = await api.setVisibleBrands(org.id, {
        showAll: !restricted,
        brandIds: restricted ? [...shown] : undefined,
      });
      setOptions(v.brands);
      const on = v.brands.filter((b) => b.shown).map((b) => b.id);
      setRestricted(v.restricted);
      setShown(new Set(on));
      setSaved({ restricted: v.restricted, shown: on });
      setNotice(
        !v.restricted
          ? "Saved — every company you carry is showing again."
          : on.length === 0
            ? "Saved — no companies are showing. Nobody under your shop can pick a colour until you turn one back on."
            : `Saved — ${on.length} of ${v.brands.length} companies showing, everywhere.`,
      );
    } catch (e) {
      if (e instanceof HttpError) setError(e.message);
      else setError("Could not save your selection. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: "inline-flex", alignItems: "center", gap: 10, color: "var(--fg-mute)" }}>
        <Spinner size={14} color="var(--accent)" /> <Mono>Loading your paint companies…</Mono>
      </div>
    );
  }

  if (!org) {
    return (
      <p style={{ font: "400 17px/1.5 var(--sans)", color: "var(--fg-mute)" }}>
        Set up your shop under “Active codes” first — paint companies belong to your shop.
      </p>
    );
  }

  if (options.length === 0) {
    return (
      <p style={{ font: "400 17px/1.5 var(--sans)", color: "var(--fg-mute)" }}>
        Your distributor hasn&apos;t assigned your shop any paint companies yet. Once they do,
        you can choose which of them to show here.
      </p>
    );
  }

  const noneOn = restricted && shown.size === 0;
  // Assigned but empty: no shades have been loaded for these companies, so ticking
  // one adds a name to the list and not a single colour behind it. This is what made
  // "8 companies" here and "6 companies" in the studio both true at the same time.
  const empty = options.filter((b) => b.shadeCount === 0);

  return (
    <div>
      <div style={{ border: "1px solid var(--rule)", padding: 20, marginBottom: 20, display: "flex", flexDirection: "column", gap: 18 }}>
        <Choice
          checked={!restricted}
          onSelect={() => {
            setRestricted(false);
            setNotice(null);
            setError(null);
          }}
          title="Show every company I carry"
          hint={
            empty.length > 0
              ? `All ${options.length} ${options.length === 1 ? "company" : "companies"} your distributor has assigned you — ${options.length - empty.length} with colours loaded.`
              : `All ${options.length} ${options.length === 1 ? "company" : "companies"} your distributor has assigned you.`
          }
        />
        <Choice
          checked={restricted}
          onSelect={() => {
            setRestricted(true);
            setNotice(null);
            setError(null);
          }}
          title="Only show the ones I stock"
          hint="Everything else disappears from the studio, the kiosk, your access codes and your customers."
        />

        {restricted && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10, paddingLeft: 30 }}>
            {options.map((b) => (
              <label key={b.id} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={shown.has(b.id)} onChange={() => toggle(b.id)} />
                <span style={{ font: "400 15px/1.3 var(--sans)", color: "var(--fg)" }}>{b.name}</span>
                {b.shadeCount === 0 && (
                  <span style={{ font: "400 12px/1 var(--mono)", letterSpacing: ".12em", textTransform: "uppercase", color: "var(--fg-mute)" }}>
                    no colours yet
                  </span>
                )}
              </label>
            ))}
          </div>
        )}

        {empty.length > 0 && (
          <p role="note" style={{ font: "400 13px/1.5 var(--sans)", color: "var(--fg-mute)", margin: 0 }}>
            {empty.map((b) => b.name).join(" and ")}{" "}
            {empty.length === 1 ? "has" : "have"} no shades loaded yet, so{" "}
            {empty.length === 1 ? "it adds" : "they add"} a company name to your lists without
            adding a colour to choose from. Ask your distributor when the catalogue is coming.
          </p>
        )}

        {/* Saving nothing is allowed — a shop between suppliers may genuinely stock
            none — but it stops the shop selling, so it must not happen by accident. */}
        {noneOn && (
          <p role="status" style={{ font: "400 13px/1.5 var(--sans)", color: "var(--warn, var(--accent))", paddingLeft: 30, margin: 0 }}>
            Nothing is ticked. Save this and nobody under your shop — including walk-ins at
            your kiosk — will have a single colour to choose from.
          </p>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <Button onClick={() => void save()} disabled={saving || !dirty}>
            {saving ? <><Spinner size={14} color="currentColor" /> Saving…</> : <>Save companies <span className="arr">→</span></>}
          </Button>
          {notice && !dirty && <Mono>{notice}</Mono>}
          {dirty && <Mono>Unsaved changes</Mono>}
        </div>
      </div>

      {error && <div className="field-error" role="alert">{error}</div>}
    </div>
  );
}

/** A radio-style choice with a title and an explanation of what it costs. */
function Choice({
  checked,
  onSelect,
  title,
  hint,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  hint: string;
}) {
  return (
    <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer" }}>
      <input
        type="radio"
        name="shop-brand-visibility"
        checked={checked}
        onChange={onSelect}
        style={{ marginTop: 4 }}
      />
      <span>
        <span style={{ font: "500 15px/1.3 var(--sans)", color: "var(--fg)" }}>{title}</span>
        <span style={{ display: "block", font: "400 13px/1.5 var(--sans)", color: "var(--fg-mute)", marginTop: 2 }}>
          {hint}
        </span>
      </span>
    </label>
  );
}
