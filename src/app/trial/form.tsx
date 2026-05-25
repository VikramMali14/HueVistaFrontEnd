"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

interface TrialFormProps {
  action: (formData: FormData) => Promise<{ error?: string } | void>;
}

const TIERS = [
  { v: "starter", l: "Starter · ₹499", d: "Single counter, single device. XX renders / month." },
  { v: "pro", l: "Professional · ₹999", d: "Recommended. 3 devices, LX renders, all the conveniences." },
  { v: "business", l: "Business · ₹1,999", d: "Multi-shop, white-label, CL renders, painter portal." },
];

export function TrialForm({ action }: TrialFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      style={{ display: "flex", flexDirection: "column", gap: 0 }}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          setError(null);
          const res = await action(fd);
          if (res && "error" in res && res.error) setError(res.error);
        });
      }}
      noValidate
    >
      <Step num="I." title={<>Tell us <i>about you.</i></>}>
        <div className="form-grid">
          <Field label="First name" name="firstName" required placeholder="Suresh" autoComplete="given-name" />
          <Field label="Last name" name="lastName" required placeholder="Kulkarni" autoComplete="family-name" />
          <Field label="Email" name="email" type="email" required placeholder="suresh@shardapaints.in" autoComplete="email" />
          <Field label="Phone · WhatsApp" name="phone" type="tel" required placeholder="+91 98 8654 7321" autoComplete="tel" />
          <Field label="Passphrase" name="password" type="password" required minLength={8} placeholder="At least eight characters" autoComplete="new-password" full />
        </div>
      </Step>
      <Step num="II." title={<>And the <i>shop.</i></>}>
        <div className="form-grid">
          <Field label="Shop name" name="shopName" required placeholder="Sharda Paints" full />
          <Field label="City" name="city" required placeholder="Belgavi" />
          <Select label="State" name="state"><option>Karnataka</option><option>Maharashtra</option><option>Goa</option><option>Tamil Nadu</option><option>Telangana</option><option>Andhra Pradesh</option><option>Kerala</option><option>Other</option></Select>
          <Select label="Primary catalogue" name="catalogue"><option>Asian Paints</option><option>Berger</option><option>Nerolac</option><option>Dulux</option><option>Multiple</option></Select>
          <Select label="Years in trade" name="years" defaultValue="5 — 10 years"><option>‹ 2 years</option><option>2 — 5 years</option><option>5 — 10 years</option><option>10 — 20 years</option><option>20+ years</option></Select>
        </div>
      </Step>
      <Step num="III." title={<>Pick your <i>tier.</i></>}>
        <div className="seg">
          {TIERS.map((t, i) => (
            <label key={t.v}>
              <input type="radio" name="tier" value={t.v} defaultChecked={i === 1} />
              <span className="l">{t.l}</span>
              <span className="d">{t.d}</span>
            </label>
          ))}
        </div>
        <p style={{ marginTop: 20, fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 17, color: "var(--mute)" }}>You won't be charged today. You're picking the shape of your trial.</p>
      </Step>
      <Step num="IV." title={<>A word, <i>if you'd like.</i></>}>
        <div className="field">
          <label className="field-label" htmlFor="notes">Anything we should know? · optional</label>
          <textarea id="notes" name="notes" rows={3} placeholder="Counter footfall, catalogues you stock, languages your customers speak, anything else." style={{ resize: "vertical" }} />
        </div>
      </Step>
      {error && <div className="field-error" role="alert">{error}</div>}
      <div style={{ marginTop: 56, display: "flex", alignItems: "center", gap: 32, flexWrap: "wrap" }}>
        <Button variant="brass" type="submit" disabled={pending}>{pending ? "Beginning…" : <>Begin the trial <span className="arr">→</span></>}</Button>
        <p className="mono" style={{ margin: 0 }}>By beginning a trial you agree to our <a style={{ color: "var(--brass-soft)", textDecoration: "underline", textUnderlineOffset: 4 }}>terms</a> and <a style={{ color: "var(--brass-soft)", textDecoration: "underline", textUnderlineOffset: 4 }}>privacy</a>.</p>
      </div>
      <style>{`
        .step { padding: 56px 0; border-top: 1px solid var(--rule); }
        .step:first-child { border-top: none; padding-top: 0; }
        .step-head { display: flex; align-items: baseline; gap: 24px; margin-bottom: 40px; }
        .step-num { font: 300 italic 22px/1 var(--serif); color: var(--brass); }
        .step-title { font-family: var(--serif); font-weight: 300; font-size: 36px; line-height: 1; color: var(--ivory); }
        .step-title i { color: var(--brass-soft); }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
        .form-grid .field.full { grid-column: span 2; }
        .seg { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .seg label { display: flex; flex-direction: column; padding: 18px 20px; border: 1px solid var(--rule-strong); cursor: pointer; transition: all .25s var(--ease); }
        .seg label:hover { border-color: var(--brass); }
        .seg input[type="radio"] { display: none; }
        .seg label:has(input:checked) { background: var(--ivory); border-color: var(--ivory); color: var(--charcoal); }
        .seg label:has(input:checked) .l { color: var(--charcoal); }
        .seg label:has(input:checked) .d { color: var(--mute-deep); }
        .seg .l { font: 400 10px/1 var(--mono); letter-spacing: .28em; text-transform: uppercase; color: var(--ivory); }
        .seg .d { font: 300 italic 16px/1.3 var(--serif); color: var(--ivory-soft); margin-top: 8px; }
        @media (max-width: 1100px) {
          .form-grid { grid-template-columns: 1fr; gap: 24px; }
          .form-grid .field.full { grid-column: span 1; }
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
function Field({ label, name, type = "text", required, placeholder, autoComplete, minLength, full }: { label: string; name: string; type?: string; required?: boolean; placeholder?: string; autoComplete?: string; minLength?: number; full?: boolean; }) {
  return (
    <div className={`field${full ? " full" : ""}`}>
      <label className="field-label" htmlFor={name}>{label}</label>
      <input id={name} name={name} type={type} required={required} placeholder={placeholder} autoComplete={autoComplete} minLength={minLength} />
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
