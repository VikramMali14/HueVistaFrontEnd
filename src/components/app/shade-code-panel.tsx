"use client";

import { useEffect, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { CodeChecker } from "@/components/app/code-checker";
import { api, HttpError } from "@/lib/api";
import {
  SCHEME_LIMITS,
  hasScheme,
  normalizeSchemePart,
  type ShadeCodeScheme,
} from "@/lib/shade-codes";
import type { OrgResponse, PaintShade } from "@/lib/types";

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
