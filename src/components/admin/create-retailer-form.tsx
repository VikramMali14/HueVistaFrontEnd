"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { createRetailerAction } from "@/lib/auth";

const STATES = [
  "Andhra Pradesh", "Assam", "Bihar", "Chhattisgarh", "Delhi", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra",
  "Odisha", "Punjab", "Rajasthan", "Tamil Nadu", "Telangana", "Uttar Pradesh", "Uttarakhand",
  "West Bengal", "Other",
];

export function CreateRetailerForm() {
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
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
        startTransition(async () => {
          setError(null);
          setCreated(null);
          const res = await createRetailerAction(fd);
          if (res.error) setError(res.error);
          else {
            setCreated(shop);
            formRef.current?.reset();
          }
        });
      }}
      noValidate
      aria-busy={pending}
      style={{ marginTop: 40 }}
    >
      <div className="ad-grid">
        <Field label="Owner name" name="name" required placeholder="Priya Mehta" autoComplete="off" />
        <Field label="Email" name="email" type="email" required placeholder="shop@mehtapaints.in" autoComplete="off" />
        <div className="field">
          <label className="field-label" htmlFor="password">Initial password</label>
          <div style={{ position: "relative" }}>
            <input id="password" name="password" type={showPw ? "text" : "password"} required minLength={8}
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
          <label className="field-label" htmlFor="state">State</label>
          <select id="state" name="state" defaultValue="Karnataka">{STATES.map((s) => <option key={s}>{s}</option>)}</select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="tier">Plan tier</label>
          <select id="tier" name="tier" defaultValue="pro">
            <option value="starter">Starter</option>
            <option value="pro">Professional</option>
            <option value="business">Business</option>
          </select>
        </div>
      </div>

      {created && (
        <div role="status" style={{ marginTop: 24, padding: "14px 16px", border: "1px solid var(--sage)", color: "var(--fg)", font: "400 15px/1.5 var(--sans)", borderRadius: "var(--radius)" }}>
          ✓ Shop account created for <strong>{created}</strong>. They can sign in with the email and password you set.
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
