"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { createNetworkRetailerAction, getGrantableAccessAction } from "@/lib/auth";
import type { RetailerBrandOption, RetailerFeatureOption } from "@/lib/types";

const STATES = [
  "Andhra Pradesh", "Assam", "Bihar", "Chhattisgarh", "Delhi", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra",
  "Odisha", "Punjab", "Rajasthan", "Tamil Nadu", "Telangana", "Uttar Pradesh", "Uttarakhand",
  "West Bengal", "Other",
];

/**
 * Distributor-side shop creation. Same shape as the admin form, but goes through
 * the hierarchy endpoint so the new shop is auto-linked to the distributor.
 */
export function NetworkCreateRetailerForm() {
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  // What this distributor can hand over. Loaded once; empty lists (a failed load)
  // simply hide the access section, and the shop is created unrestricted.
  const [brands, setBrands] = useState<RetailerBrandOption[]>([]);
  const [features, setFeatures] = useState<RetailerFeatureOption[]>([]);
  // Both default to "everything", so a distributor who ignores this section gets
  // exactly the behaviour that existed before it did.
  const [allBrands, setAllBrands] = useState(true);
  const [allPages, setAllPages] = useState(true);
  const [pickedBrands, setPickedBrands] = useState<Set<number>>(new Set());
  const [pickedPages, setPickedPages] = useState<Set<string>>(new Set());

  useEffect(() => {
    let live = true;
    getGrantableAccessAction().then((res) => {
      if (!live) return;
      setBrands(res.brands);
      setFeatures(res.features);
    });
    return () => {
      live = false;
    };
  }, []);

  const resetAccess = () => {
    setAllBrands(true);
    setAllPages(true);
    setPickedBrands(new Set());
    setPickedPages(new Set());
  };

  const toggleIn = <T,>(set: Set<T>, value: T): Set<T> => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        if (!e.currentTarget.reportValidity()) return;
        const fd = new FormData(e.currentTarget);
        const shop = String(fd.get("shopName") ?? "");
        startTransition(async () => {
          setError(null);
          setCreated(null);
          const res = await createNetworkRetailerAction(fd);
          if (res.error) setError(res.error);
          else {
            setCreated(shop);
            formRef.current?.reset();
            // form.reset() only clears native inputs — the access checklists are
            // React state and would otherwise carry over to the next shop.
            resetAccess();
            router.refresh(); // re-fetch the server-rendered network report below
          }
        });
      }}
      noValidate
      aria-busy={pending}
      style={{ marginTop: 40 }}
    >
      <div className="nr-grid">
        <Field label="Owner name" name="name" required placeholder="Priya Mehta" autoComplete="off" />
        <Field label="Email" name="email" type="email" required placeholder="shop@mehtapaints.in" autoComplete="off" />
        <div className="field">
          <label className="field-label" htmlFor="nr-password">Initial password</label>
          <div style={{ position: "relative" }}>
            <input id="nr-password" name="password" type={showPw ? "text" : "password"} required minLength={8}
              placeholder="At least eight characters" autoComplete="new-password" style={{ paddingRight: 56 }} />
            <button type="button" onClick={() => setShowPw((v) => !v)} aria-pressed={showPw}
              aria-label={showPw ? "Hide password" : "Show password"}
              style={{ position: "absolute", right: 0, bottom: 8, background: "transparent", border: "none", cursor: "pointer", color: "var(--fg-mute)", font: "400 10px/1 var(--mono)", letterSpacing: ".22em", textTransform: "uppercase" }}>
              {showPw ? "Hide" : "Show"}
            </button>
          </div>
        </div>
        <Field label="Phone · WhatsApp" name="phone" type="tel" placeholder="+91 98 2210 4476" autoComplete="off" />
        <Field label="Shop name" name="shopName" required placeholder="Mehta Paint House" full autoComplete="off" />
        <Field label="City" name="city" placeholder="Pune" autoComplete="off" />
        <div className="field">
          <label className="field-label" htmlFor="nr-state">State</label>
          <select id="nr-state" name="state" defaultValue="Karnataka">{STATES.map((s) => <option key={s}>{s}</option>)}</select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="nr-tier">Plan tier</label>
          <select id="nr-tier" name="tier" defaultValue="pro">
            <option value="starter">Starter</option>
            <option value="pro">Professional</option>
            <option value="business">Business</option>
          </select>
        </div>
      </div>

      {(brands.length > 0 || features.length > 0) && (
        <section className="nr-access">
          <h3 className="nr-access-title">What this shop can see</h3>
          <p className="nr-access-lead">
            Set it now and the shop opens with exactly this — you can change it any time from the
            shops table below.
          </p>

          {brands.length > 0 && (
            <div className="nr-access-block">
              <label className={`nr-all${allBrands ? " on" : ""}`}>
                <input
                  type="checkbox"
                  name="brandsUnrestricted"
                  /* Unchecked boxes aren't submitted at all, so the value below is
                     what the server action reads to distinguish "restricted" from
                     "the field was never on the form". */
                  value="off"
                  checked={!allBrands}
                  onChange={(e) => setAllBrands(!e.target.checked)}
                  style={{ accentColor: "var(--accent)" }}
                />
                Limit the paint companies this shop can work with
              </label>
              {!allBrands && (
                <div className="nr-check-grid">
                  {brands.map((b) => {
                    const on = pickedBrands.has(b.id);
                    return (
                      <label key={b.id} className={`nr-check${on ? " on" : ""}`}>
                        <input
                          type="checkbox"
                          name="brandIds"
                          value={b.id}
                          checked={on}
                          onChange={() => setPickedBrands((prev) => toggleIn(prev, b.id))}
                          style={{ accentColor: "var(--accent)" }}
                        />
                        {b.name}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {features.length > 0 && (
            <div className="nr-access-block">
              <label className={`nr-all${allPages ? " on" : ""}`}>
                <input
                  type="checkbox"
                  name="featuresUnrestricted"
                  value="off"
                  checked={!allPages}
                  onChange={(e) => setAllPages(!e.target.checked)}
                  style={{ accentColor: "var(--accent)" }}
                />
                Limit the pages this shop can open
              </label>
              {!allPages && (
                <div className="nr-check-grid one">
                  {features.map((f) => {
                    const on = pickedPages.has(f.key);
                    return (
                      <label key={f.key} className={`nr-check${on ? " on" : ""}`} style={{ alignItems: "flex-start" }}>
                        <input
                          type="checkbox"
                          name="features"
                          value={f.key}
                          checked={on}
                          onChange={() => setPickedPages((prev) => toggleIn(prev, f.key))}
                          style={{ accentColor: "var(--accent)", marginTop: 3 }}
                        />
                        <span>
                          {f.label}
                          <span className="nr-check-desc">{f.description}</span>
                        </span>
                      </label>
                    );
                  })}
                  <p className="nr-access-note">
                    Their dashboard, account and plan pages always stay available.
                  </p>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {created && (
        <div role="status" style={{ marginTop: 24, padding: "14px 16px", border: "1px solid var(--sage)", color: "var(--fg)", font: "400 15px/1.5 var(--sans)", borderRadius: "var(--radius)" }}>
          ✓ Shop account created for <strong>{created}</strong> and linked to your network. We&apos;ve
          emailed them a sign-in link; you hand over the initial password.
        </div>
      )}
      {error && <div className="field-error" role="alert" aria-live="assertive" style={{ marginTop: 24 }}>{error}</div>}

      <Button type="submit" variant="brass" disabled={pending} style={{ marginTop: 32 }}>
        {pending ? <><Spinner size={14} color="currentColor" decorative /> Creating…</> : <>Create shop account <span className="arr">→</span></>}
      </Button>

      <style>{`
        .nr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
        .nr-grid .field.full { grid-column: span 2; }
        @media (max-width: 720px) { .nr-grid { grid-template-columns: 1fr; } .nr-grid .field.full { grid-column: span 1; } }
        .nr-access { margin-top: 36px; padding-top: 28px; border-top: 1px solid var(--rule); }
        .nr-access-title { font: 400 11px/1 var(--mono); letter-spacing: .26em; text-transform: uppercase; color: var(--fg-mute); margin: 0 0 10px; }
        .nr-access-lead { font: 300 15px/1.5 var(--serif); color: var(--fg-soft); margin: 0 0 18px; max-width: 60ch; }
        .nr-access-block { margin-bottom: 18px; }
        .nr-all { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border: 1px solid var(--rule-strong); border-radius: 6px; cursor: pointer; font: 400 14px/1.2 var(--sans); color: var(--fg-soft); }
        .nr-all.on { color: var(--fg-mute); }
        .nr-check-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 12px 0 0; }
        .nr-check-grid.one { grid-template-columns: 1fr; }
        @media (max-width: 480px) { .nr-check-grid { grid-template-columns: 1fr; } }
        .nr-check { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--rule-strong); border-radius: 6px; cursor: pointer; font: 300 15px/1.2 var(--serif); color: var(--fg-soft); }
        .nr-check.on { border-color: var(--accent); color: var(--fg); background: var(--surface-soft); }
        .nr-check-desc { display: block; margin-top: 4px; font: 300 13px/1.4 var(--serif); color: var(--fg-mute); }
        .nr-access-note { font: 300 13px/1.4 var(--serif); color: var(--fg-mute); margin: 4px 0 0; }
      `}</style>
    </form>
  );
}

function Field({ label, name, type = "text", required, placeholder, autoComplete, full }: {
  label: string; name: string; type?: string; required?: boolean; placeholder?: string; autoComplete?: string; full?: boolean;
}) {
  const id = `nr-${name}`;
  return (
    <div className={`field${full ? " full" : ""}`}>
      <label className="field-label" htmlFor={id}>{label}</label>
      <input id={id} name={name} type={type} required={required} placeholder={placeholder} autoComplete={autoComplete} />
    </div>
  );
}
