"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { createDistributorAction } from "@/lib/auth";

const STATES = [
  "Andhra Pradesh", "Assam", "Bihar", "Chhattisgarh", "Delhi", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra",
  "Odisha", "Punjab", "Rajasthan", "Tamil Nadu", "Telangana", "Uttar Pradesh", "Uttarakhand",
  "West Bengal", "Other",
];

/** Admin-only: provision a DISTRIBUTOR account + organization. */
export function CreateDistributorForm() {
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
        const company = String(fd.get("companyName") ?? "");
        startTransition(async () => {
          setError(null);
          setCreated(null);
          const res = await createDistributorAction(fd);
          if (res.error) setError(res.error);
          else {
            setCreated(company);
            formRef.current?.reset();
          }
        });
      }}
      noValidate
      aria-busy={pending}
      style={{ marginTop: 40 }}
    >
      <div className="dist-grid">
        <Field label="Owner name" name="name" required placeholder="Arun Shetty" autoComplete="off" />
        <Field label="Email" name="email" type="email" required placeholder="office@shettytrade.in" autoComplete="off" />
        <div className="field">
          <label className="field-label" htmlFor="d-password">Initial password</label>
          <div style={{ position: "relative" }}>
            <input id="d-password" name="password" type={showPw ? "text" : "password"} required minLength={8}
              placeholder="At least eight characters" autoComplete="new-password" style={{ paddingRight: 56 }} />
            <button type="button" onClick={() => setShowPw((v) => !v)} aria-pressed={showPw}
              aria-label={showPw ? "Hide password" : "Show password"}
              style={{ position: "absolute", right: 0, bottom: 8, background: "transparent", border: "none", cursor: "pointer", color: "var(--fg-mute)", font: "400 10px/1 var(--mono)", letterSpacing: ".22em", textTransform: "uppercase" }}>
              {showPw ? "Hide" : "Show"}
            </button>
          </div>
        </div>
        <Field label="Phone · WhatsApp" name="phone" type="tel" placeholder="+91 98 8600 2244" autoComplete="off" />
        <Field label="Company name" name="companyName" required placeholder="Shetty Trade Links" full autoComplete="off" />
        <Field label="City" name="city" placeholder="Hubli" autoComplete="off" />
        <div className="field">
          <label className="field-label" htmlFor="d-state">State</label>
          <select id="d-state" name="state" defaultValue="Karnataka">{STATES.map((s) => <option key={s}>{s}</option>)}</select>
        </div>
      </div>

      {created && (
        <div role="status" style={{ marginTop: 24, padding: "14px 16px", border: "1px solid var(--sage)", color: "var(--fg)", font: "400 15px/1.5 var(--sans)", borderRadius: "var(--radius)" }}>
          ✓ Distributor account created for <strong>{created}</strong>. They can sign in and start creating
          their own shop accounts — every shop they create lands in their network automatically.
        </div>
      )}
      {error && <div className="field-error" role="alert" aria-live="assertive" style={{ marginTop: 24 }}>{error}</div>}

      <Button type="submit" variant="brass" disabled={pending} style={{ marginTop: 32 }}>
        {pending ? <><Spinner size={14} color="currentColor" decorative /> Creating…</> : <>Create distributor account <span className="arr">→</span></>}
      </Button>

      <style>{`
        .dist-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
        .dist-grid .field.full { grid-column: span 2; }
        @media (max-width: 720px) { .dist-grid { grid-template-columns: 1fr; } .dist-grid .field.full { grid-column: span 1; } }
      `}</style>
    </form>
  );
}

function Field({ label, name, type = "text", required, placeholder, autoComplete, full }: {
  label: string; name: string; type?: string; required?: boolean; placeholder?: string; autoComplete?: string; full?: boolean;
}) {
  const id = `d-${name}`;
  return (
    <div className={`field${full ? " full" : ""}`}>
      <label className="field-label" htmlFor={id}>{label}</label>
      <input id={id} name={name} type={type} required={required} placeholder={placeholder} autoComplete={autoComplete} />
    </div>
  );
}
