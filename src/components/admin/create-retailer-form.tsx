"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { createRetailerAction } from "@/lib/auth";
import type { DistributorOption } from "@/lib/api";

const STATES = [
  "Andhra Pradesh", "Assam", "Bihar", "Chhattisgarh", "Delhi", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra",
  "Odisha", "Punjab", "Rajasthan", "Tamil Nadu", "Telangana", "Uttar Pradesh", "Uttarakhand",
  "West Bengal", "Other",
];

interface CreateRetailerFormProps {
  /** Distributors the shop can be filed under; null when the list failed to load. */
  distributors: DistributorOption[] | null;
}

/**
 * Create a shop account directly, without waiting for the shop to ask.
 *
 * Two things are worth knowing about this form. The distributor picker decides
 * where the shop sits in the network — leaving it on the house distributor is a
 * real choice, not a blank, and it is what keeps every shop inside somebody's
 * downline. And there is no plan to pick: the shop opens free, and buys a plan
 * itself if it wants one.
 */
export function CreateRetailerForm({ distributors }: CreateRetailerFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ shop: string; distributor: string } | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        if (!e.currentTarget.reportValidity()) return;
        const fd = new FormData(e.currentTarget);
        const shop = String(fd.get("shopName") ?? "");
        const orgId = String(fd.get("distributorOrgId") ?? "");
        const distributor =
          distributors?.find((d) => (d.house ? "" : d.orgId) === orgId)?.name ?? "HueVista Direct";
        startTransition(async () => {
          setError(null);
          setCreated(null);
          const res = await createRetailerAction(fd);
          if (res.error) setError(res.error);
          else {
            setCreated({ shop, distributor });
            formRef.current?.reset();
          }
        });
      }}
      noValidate
      aria-busy={pending}
      style={{ marginTop: 40 }}
    >
      <div className="ad-grid">
        <Field label="Owner name" name="name" required placeholder="Full name" autoComplete="off" />
        <Field label="Email" name="email" type="email" required placeholder="name@example.com" autoComplete="off" />
        <div className="field">
          <label className="field-label" htmlFor="password">Initial password</label>
          <div style={{ position: "relative" }}>
            <input id="password" name="password" type={showPw ? "text" : "password"} required minLength={8}
              placeholder="At least eight characters" autoComplete="new-password" style={{ paddingRight: 56 }} />
            <button type="button" onClick={() => setShowPw((v) => !v)} aria-pressed={showPw}
              aria-label={showPw ? "Hide password" : "Show password"}
              style={{ position: "absolute", right: 0, bottom: 8, background: "transparent", border: "none", cursor: "pointer", color: "var(--fg-mute)", font: "400 12px/1 var(--mono)", letterSpacing: ".22em", textTransform: "uppercase" }}>
              {showPw ? "Hide" : "Show"}
            </button>
          </div>
          <p style={{ margin: "8px 0 0", font: "300 italic 15px/1.4 var(--serif)", color: "var(--fg-mute)" }}>
            Hand this over yourself — it is not emailed, and once saved nobody can read it back.
          </p>
        </div>
        <Field label="Phone · WhatsApp" name="phone" type="tel" placeholder="+91 00000 00000" autoComplete="off" />
        <Field label="Shop name" name="shopName" required placeholder="Full shop name" full autoComplete="off" />
        <Field label="City" name="city" placeholder="City" autoComplete="off" />
        <div className="field">
          <label className="field-label" htmlFor="state">State</label>
          <select id="state" name="state" defaultValue="Karnataka">{STATES.map((s) => <option key={s}>{s}</option>)}</select>
        </div>
        <div className="field full">
          <label className="field-label" htmlFor="distributorOrgId">Distributor this shop belongs under</label>
          <select id="distributorOrgId" name="distributorOrgId" defaultValue="" disabled={distributors === null}>
            {distributors === null ? (
              <option value="">Could not load distributors — the shop will go to HueVista Direct</option>
            ) : (
              distributors.map((d) => (
                <option key={d.orgId} value={d.house ? "" : d.orgId}>
                  {d.house ? `${d.name} — ours, the default` : d.name}
                  {d.city ? ` · ${d.city}` : ""}
                  {` · ${d.shopCount} shop${d.shopCount === 1 ? "" : "s"}`}
                </option>
              ))
            )}
          </select>
          <p style={{ margin: "8px 0 0", font: "300 italic 15px/1.4 var(--serif)", color: "var(--fg-mute)" }}>
            The shop appears in this distributor&apos;s network and reports. Leave it on HueVista
            Direct for shops you look after yourself.
          </p>
        </div>
      </div>

      {created && (
        <div role="status" style={{ marginTop: 24, padding: "14px 16px", border: "1px solid var(--sage)", color: "var(--fg)", font: "400 15px/1.5 var(--sans)", borderRadius: "var(--radius)" }}>
          ✓ Shop account created for <strong>{created.shop}</strong> under <strong>{created.distributor}</strong>,
          on the free plan. We&apos;ve emailed them a sign-in link — give them the password yourself.
        </div>
      )}
      {error && <div className="field-error" role="alert" aria-live="assertive" style={{ marginTop: 24 }}>{error}</div>}

      <Button type="submit" variant="brass" disabled={pending} style={{ marginTop: 32 }}>
        {pending ? <><Spinner size={14} color="currentColor" decorative /> Creating…</> : <>Create shop account <span className="arr">→</span></>}
      </Button>

      <style>{`
        .ad-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
        .ad-grid .field.full { grid-column: span 2; }
        @media (max-width: 720px) { .ad-grid { grid-template-columns: 1fr; } .ad-grid .field.full { grid-column: span 1; } }
      `}</style>
    </form>
  );
}

function Field({ label, name, type = "text", required, placeholder, autoComplete, full }: {
  label: string; name: string; type?: string; required?: boolean; placeholder?: string; autoComplete?: string; full?: boolean;
}) {
  return (
    <div className={`field${full ? " full" : ""}`}>
      <label className="field-label" htmlFor={name}>{label}</label>
      <input id={name} name={name} type={type} required={required} placeholder={placeholder} autoComplete={autoComplete} />
    </div>
  );
}
