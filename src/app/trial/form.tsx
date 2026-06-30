"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { GoogleButton } from "@/components/auth/google-button";
import { validatePhone } from "@/lib/validation";

interface TrialFormProps {
  action: (formData: FormData) => Promise<{ error?: string } | void>;
  /** Where to land after sign-up (e.g. "/redeem"); defaults to the dashboard. */
  next?: string;
}

const TIERS = [
  { v: "starter", l: "Starter · ₹19", d: "Single counter, single device. 20 AI previews a month." },
  { v: "pro", l: "Professional · ₹999", d: "Recommended. 60 AI previews a month, 3 devices." },
  { v: "business", l: "Business · ₹1,999", d: "Multi-shop, white-label, 150 AI previews a month, painter portal." },
];

const STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh", "Delhi", "Goa",
  "Gujarat", "Haryana", "Himachal Pradesh", "Jammu & Kashmir", "Jharkhand", "Karnataka", "Kerala",
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry",
  "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand",
  "West Bengal", "Other",
];

export function TrialForm({ action, next }: TrialFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);

  return (
    <form
      style={{ display: "flex", flexDirection: "column", gap: 0 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!agreed) {
          setError("Please accept the terms to begin a trial.");
          return;
        }
        // Surface the browser's bubble on the exact offending field (works with noValidate).
        if (!e.currentTarget.reportValidity()) return;
        const fd = new FormData(e.currentTarget);
        const phoneMsg = validatePhone(String(fd.get("phone") ?? ""));
        if (phoneMsg) {
          setPhoneError(phoneMsg);
          (e.currentTarget.elements.namedItem("phone") as HTMLInputElement | null)?.focus();
          return;
        }
        startTransition(async () => {
          setError(null);
          try {
            const res = await action(fd);
            if (res && "error" in res && res.error) setError(res.error);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not start the trial.");
          }
        });
      }}
      noValidate
      aria-busy={pending}
    >
      {next && <input type="hidden" name="next" value={next} />}
      <div style={{ marginBottom: 32, maxWidth: 480 }}>
        <GoogleButton next={next ?? "/dashboard"} label="Start free trial with Google" />
        <div
          aria-hidden
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            color: "var(--fg-mute)",
            font: "400 10px/1 var(--mono)",
            letterSpacing: ".24em",
            textTransform: "uppercase",
            marginTop: 24,
          }}
        >
          <span style={{ flex: 1, height: 1, background: "var(--rule)" }} />
          or fill in the details
          <span style={{ flex: 1, height: 1, background: "var(--rule)" }} />
        </div>
      </div>

      <Step num="I." title={<>Tell us <i>about you.</i></>}>
        <div className="form-grid">
          <Field label="First name" name="firstName" required placeholder="Priya" autoComplete="given-name" />
          <Field label="Last name" name="lastName" required placeholder="Mehta" autoComplete="family-name" />
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
          <div className="field full">
            <label className="field-label" htmlFor="password">Password</label>
            <div style={{ position: "relative" }}>
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                minLength={8}
                placeholder="At least eight characters"
                autoComplete="new-password"
                style={{ paddingRight: 56 }}
                aria-describedby="pw-hint"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-pressed={showPassword}
                aria-label={showPassword ? "Hide password" : "Show password"}
                style={{
                  position: "absolute",
                  right: 0,
                  bottom: 8,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--fg-mute)",
                  font: "400 10px/1 var(--mono)",
                  letterSpacing: ".22em",
                  textTransform: "uppercase",
                }}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <span id="pw-hint" style={{ font: "400 14px/1.3 var(--serif)", color: "var(--fg-mute)" }}>
              Use at least 8 characters. A mixture of words is the strongest, kindest password.
            </span>
          </div>
        </div>
      </Step>
      <Step num="II." title={<>And the <i>shop.</i></>}>
        <div className="form-grid">
          <Field label="Shop name" name="shopName" required placeholder="Mehta Paint House" full />
          <Field label="City" name="city" required placeholder="Pune" />
          <Select label="State" name="state" defaultValue="Karnataka">{STATES.map((s) => <option key={s}>{s}</option>)}</Select>
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
        <p style={{ marginTop: 20, fontFamily: "var(--serif)", fontSize: 17, color: "var(--fg-mute)" }}>You won't be charged today. You're picking the shape of your trial.</p>
      </Step>
      <Step num="IV." title={<>A word, <i>if you'd like.</i></>}>
        <div className="field">
          <label className="field-label" htmlFor="notes">Anything we should know? · optional</label>
          <textarea id="notes" name="notes" rows={3} placeholder="Counter footfall, catalogues you stock, languages your customers speak, anything else." style={{ resize: "vertical" }} />
        </div>
      </Step>
      <label
        style={{
          marginTop: 32,
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          font: "400 16px/1.5 var(--serif)",
          color: "var(--fg-soft)",
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          aria-invalid={!agreed && error ? "true" : undefined}
          style={{ accentColor: "var(--accent)", marginTop: 4, flexShrink: 0 }}
          required
        />
        <span>
          I agree to the{" "}
          <a href="/legal/terms" style={{ color: "var(--accent-soft)", textDecoration: "underline", textUnderlineOffset: 4 }}>terms</a>{" "}
          and{" "}
          <a href="/legal/privacy" style={{ color: "var(--accent-soft)", textDecoration: "underline", textUnderlineOffset: 4 }}>privacy policy</a>.
        </span>
      </label>
      {error && <div className="field-error" role="alert" aria-live="assertive" style={{ marginTop: 24 }}>{error}</div>}
      <div style={{ marginTop: 40, display: "flex", alignItems: "center", gap: 32, flexWrap: "wrap" }}>
        <Button variant="brass" type="submit" disabled={pending}>
          {pending ? (
            <>
              <Spinner size={14} color="currentColor" />
              <span>Beginning…</span>
            </>
          ) : (
            <>
              Begin the trial <span className="arr">→</span>
            </>
          )}
        </Button>
      </div>
      <style>{`
        .step { padding: 56px 0; border-top: 1px solid var(--rule); }
        .step:first-of-type { border-top: none; padding-top: 0; }
        .step-head { display: flex; align-items: baseline; gap: 24px; margin-bottom: 40px; }
        .step-num { font: 300 italic 22px/1 var(--serif); color: var(--accent); }
        .step-title { font-family: var(--serif); font-weight: 300; font-size: 36px; line-height: 1; color: var(--fg); }
        .step-title i { color: var(--accent-soft); }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
        .form-grid .field.full { grid-column: span 2; }
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
