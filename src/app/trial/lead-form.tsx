"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { validatePhone } from "@/lib/validation";

interface ShopLeadFormProps {
  action: (formData: FormData) => Promise<{ ok?: true; error?: string }>;
}

const TIERS = [
  { v: "starter", l: "Starter · ₹19", d: "Single counter, single device. 20 AI previews a month." },
  { v: "pro", l: "Professional · ₹999", d: "Recommended. 60 AI previews a month, per-wall recolouring." },
  { v: "business", l: "Business · ₹1,999", d: "Multi-shop, 150 AI previews a month." },
];

const STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh", "Delhi", "Goa",
  "Gujarat", "Haryana", "Himachal Pradesh", "Jammu & Kashmir", "Jharkhand", "Karnataka", "Kerala",
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry",
  "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand",
  "West Bengal", "Other",
];

/**
 * Public "request a shop account" form. Shops are provisioned by an admin, so
 * this captures a lead (no account, no password, no card) and promises a call
 * back — replacing the retired self-serve trial signup the old CTAs pointed at.
 */
export function ShopLeadForm({ action }: ShopLeadFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div role="status" style={{ textAlign: "center", padding: "48px 0" }}>
        <span aria-hidden style={{ fontSize: 44, color: "var(--accent)" }}>✓</span>
        <h2 className="display" style={{ fontSize: "clamp(32px, 4.5vw, 52px)", margin: "12px 0 12px" }}>
          Request received.
        </h2>
        <p style={{ font: "300 18px/1.6 var(--serif)", color: "var(--fg-soft)", maxWidth: "46ch", margin: "0 auto" }}>
          We&apos;ll call you within a working day to set up your shop account —
          your login, your organisation, and a 14-day trial, ready to use at the counter.
        </p>
      </div>
    );
  }

  return (
    <form
      style={{ display: "flex", flexDirection: "column", gap: 0 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!e.currentTarget.reportValidity()) return;
        const fd = new FormData(e.currentTarget);
        const phone = String(fd.get("phone") ?? "");
        const phoneMsg = phone ? validatePhone(phone) : null;
        if (phoneMsg) {
          setPhoneError(phoneMsg);
          (e.currentTarget.elements.namedItem("phone") as HTMLInputElement | null)?.focus();
          return;
        }
        startTransition(async () => {
          setError(null);
          try {
            const res = await action(fd);
            if (res.error) setError(res.error);
            else setDone(true);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not send your request.");
          }
        });
      }}
      noValidate
      aria-busy={pending}
    >
      <Step num="I." title={<>You and <i>your shop.</i></>}>
        <div className="form-grid">
          <Field label="Your name" name="name" required placeholder="Priya Mehta" autoComplete="name" />
          <Field label="Shop name" name="shopName" required placeholder="Mehta Paint House" />
          <Field label="Email" name="email" type="email" required placeholder="priya@mehtapaints.in" autoComplete="email" />
          <div className="field">
            <label className="field-label" htmlFor="phone">Phone · WhatsApp</label>
            <input
              id="phone"
              name="phone"
              type="tel"
              required
              placeholder="+91 98 2210 4476"
              autoComplete="tel"
              inputMode="tel"
              aria-invalid={phoneError ? "true" : undefined}
              aria-describedby={phoneError ? "phone-error" : undefined}
              onChange={() => setPhoneError(null)}
            />
            {phoneError && (
              <p id="phone-error" className="field-error" role="alert">{phoneError}</p>
            )}
          </div>
          <Field label="City" name="city" required placeholder="Pune" />
          <Select label="State" name="state" defaultValue="Karnataka">{STATES.map((s) => <option key={s}>{s}</option>)}</Select>
        </div>
      </Step>
      <Step num="II." title={<>The tier that <i>fits.</i></>}>
        <div className="seg">
          {TIERS.map((t, i) => (
            <label key={t.v}>
              <input type="radio" name="tier" value={t.v} defaultChecked={i === 1} />
              <span className="l">{t.l}</span>
              <span className="d">{t.d}</span>
            </label>
          ))}
        </div>
        <p style={{ marginTop: 20, fontFamily: "var(--serif)", fontSize: 17, color: "var(--fg-mute)" }}>
          Nothing is charged now. Every new shop starts with a 14-day trial — we set it up with you.
        </p>
      </Step>
      <Step num="III." title={<>A word, <i>if you&apos;d like.</i></>}>
        <div className="field">
          <label className="field-label" htmlFor="notes">Anything we should know? · optional</label>
          <textarea id="notes" name="notes" rows={3} placeholder="Counter footfall, catalogues you stock, languages your customers speak." style={{ resize: "vertical" }} />
        </div>
      </Step>
      {error && <div className="field-error" role="alert" aria-live="assertive" style={{ marginTop: 24 }}>{error}</div>}
      <div style={{ marginTop: 40, display: "flex", alignItems: "center", gap: 32, flexWrap: "wrap" }}>
        <Button variant="brass" type="submit" disabled={pending}>
          {pending ? (
            <>
              <Spinner size={14} color="currentColor" />
              <span>Sending…</span>
            </>
          ) : (
            <>
              Request my shop account <span className="arr">→</span>
            </>
          )}
        </Button>
        <span style={{ font: "300 italic 16px/1.4 var(--serif)", color: "var(--fg-mute)" }}>
          We call back within a working day.
        </span>
      </div>
      <style>{`
        .step { padding: 56px 0; border-top: 1px solid var(--rule); }
        .step:first-of-type { border-top: none; padding-top: 0; }
        .step-head { display: flex; align-items: baseline; gap: 24px; margin-bottom: 40px; }
        .step-num { font: 300 italic 22px/1 var(--serif); color: var(--accent); }
        .step-title { font-family: var(--serif); font-weight: 300; font-size: 36px; line-height: 1; color: var(--fg); }
        .step-title i { color: var(--accent-soft); }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
        .seg { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .seg label { position: relative; display: flex; flex-direction: column; padding: 18px 20px; border: 1px solid var(--rule-strong); cursor: pointer; transition: background .25s var(--ease), border-color .25s var(--ease); background: var(--surface); }
        .seg label:hover { border-color: var(--accent); }
        .seg input[type="radio"] { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
        .seg label:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
        .seg label:has(input:checked) { background: var(--accent); border-color: var(--accent); }
        .seg label:has(input:checked) .l, .seg label:has(input:checked) .d { color: var(--bg); }
        .seg .l { font: 400 10px/1 var(--mono); letter-spacing: .28em; text-transform: uppercase; color: var(--fg); }
        .seg .d { font: 300 italic 16px/1.3 var(--serif); color: var(--fg-soft); margin-top: 8px; }
        .seg .l, .seg .d { transition: color .25s var(--ease); }
        @media (max-width: 1100px) {
          .form-grid { grid-template-columns: 1fr; gap: 24px; }
          .seg { grid-template-columns: 1fr; }
        }
      `}</style>
    </form>
  );
}

function Step({ num, title, children }: { num: string; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="step"><div className="step-head"><span className="step-num">{num}</span><span className="step-title">{title}</span></div>{children}</div>
  );
}
function Field({ label, name, type = "text", required, placeholder, autoComplete }: { label: string; name: string; type?: string; required?: boolean; placeholder?: string; autoComplete?: string }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={name}>{label}</label>
      <input id={name} name={name} type={type} required={required} placeholder={placeholder} autoComplete={autoComplete} />
    </div>
  );
}
function Select({ label, name, defaultValue, children }: { label: string; name: string; defaultValue?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={name}>{label}</label>
      <select id={name} name={name} defaultValue={defaultValue}>{children}</select>
    </div>
  );
}
