"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { validatePhone } from "@/lib/validation";
import type { ShopRequestStatus } from "@/lib/api";

type StepResult = { status?: ShopRequestStatus; error?: string };

interface ShopLeadFormProps {
  action: (formData: FormData) => Promise<StepResult>;
  verifyAction: (requestId: string, code: string) => Promise<StepResult>;
  resendAction: (requestId: string) => Promise<StepResult>;
}

const STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh", "Delhi", "Goa",
  "Gujarat", "Haryana", "Himachal Pradesh", "Jammu & Kashmir", "Jharkhand", "Karnataka", "Kerala",
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry",
  "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand",
  "West Bengal", "Other",
];

/**
 * The public "request a shop account" form.
 *
 * Two stages on one page. First the shop's details and the password the owner
 * will sign in with, typed twice — a mistyped password would otherwise lock them
 * out of their own counter, and there is nobody who can read it back to them.
 * Then the 6-digit code we email, which is what turns a form submission into a
 * real request: an unverified one is never seen by an admin and never becomes an
 * account.
 *
 * No plan is chosen here. Every shop opens on the free plan; buying one happens
 * later, from inside the app, and nowhere else.
 */
export function ShopLeadForm({ action, verifyAction, resendAction }: ShopLeadFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState<ShopRequestStatus | null>(null);
  const [code, setCode] = useState("");
  const [done, setDone] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Counts the resend cooldown down so the button says when it will work again
  // instead of failing with a server-side "please wait 43s".
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (done) {
    return (
      <div role="status" style={{ textAlign: "center", padding: "48px 0" }}>
        <span aria-hidden style={{ fontSize: 44, color: "var(--accent)" }}>✓</span>
        <h2 className="display" style={{ fontSize: "clamp(32px, 4.5vw, 52px)", margin: "12px 0 12px" }}>
          Email confirmed.
        </h2>
        <p style={{ font: "300 18px/1.6 var(--serif)", color: "var(--fg-soft)", maxWidth: "48ch", margin: "0 auto" }}>
          Your shop account is being set up. It opens within 24 hours at the latest —
          usually much sooner — and we&apos;ll email you the moment it does.
        </p>
        <p style={{ font: "300 italic 17px/1.6 var(--serif)", color: "var(--fg-mute)", maxWidth: "48ch", margin: "20px auto 0" }}>
          You&apos;ll sign in with this email and the password you just chose. We store it only
          in a scrambled form that nobody — including us — can read back, so keep it somewhere safe.
        </p>
      </div>
    );
  }

  // ── Stage two: the emailed code ──────────────────────────────────────────
  if (sent) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            setError(null);
            const res = await verifyAction(sent.requestId, code);
            if (res.error) setError(res.error);
            else setDone(true);
          });
        }}
        aria-busy={pending}
      >
        <Step num="II." title={<>Confirm <i>your email.</i></>}>
          <p style={{ font: "300 18px/1.6 var(--serif)", color: "var(--fg-soft)", maxWidth: "50ch", marginBottom: 28 }}>
            We&apos;ve sent a 6-digit code to <strong>{sent.email}</strong>. Enter it below and your
            account is on its way. Nothing has been created yet — the code is how we know the
            address is really yours.
          </p>
          <div className="field" style={{ maxWidth: 280 }}>
            <label className="field-label" htmlFor="code">Your 6-digit code</label>
            <input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={code}
              onChange={(e) => { setCode(e.target.value.replace(/\D/g, "")); setError(null); }}
              placeholder="000000"
              style={{ font: "400 26px/1 var(--mono)", letterSpacing: ".4em" }}
            />
          </div>
        </Step>

        {error && <div className="field-error" role="alert" aria-live="assertive" style={{ marginTop: 8 }}>{error}</div>}

        <div style={{ marginTop: 32, display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap" }}>
          <Button variant="brass" type="submit" disabled={pending || code.length < 6}>
            {pending ? (
              <><Spinner size={14} color="currentColor" /><span>Checking…</span></>
            ) : (
              <>Confirm and finish <span className="arr">→</span></>
            )}
          </Button>
          <button
            type="button"
            disabled={pending || cooldown > 0}
            onClick={() => {
              startTransition(async () => {
                setError(null);
                const res = await resendAction(sent.requestId);
                if (res.error) setError(res.error);
                else setCooldown(res.status?.cooldownSeconds ?? 60);
              });
            }}
            style={{
              background: "transparent", border: "none", padding: 0,
              cursor: cooldown > 0 ? "default" : "pointer",
              color: cooldown > 0 ? "var(--fg-mute)" : "var(--accent-soft)",
              font: "300 italic 16px/1.4 var(--serif)",
              borderBottom: cooldown > 0 ? "none" : "1px solid var(--rule-brass)",
            }}
          >
            {cooldown > 0 ? `Send another code in ${cooldown}s` : "Send another code"}
          </button>
        </div>
        <style>{stepStyles}</style>
      </form>
    );
  }

  // ── Stage one: the shop and the password ─────────────────────────────────
  return (
    <form
      style={{ display: "flex", flexDirection: "column", gap: 0 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!e.currentTarget.reportValidity()) return;
        const form = e.currentTarget;
        const fd = new FormData(form);

        const phone = String(fd.get("phone") ?? "");
        const phoneMsg = phone ? validatePhone(phone) : null;
        if (phoneMsg) {
          setPhoneError(phoneMsg);
          (form.elements.namedItem("phone") as HTMLInputElement | null)?.focus();
          return;
        }
        // Checked here as well as on the server: a mismatch caught in the browser
        // costs nothing, and the round trip would come back with the form's
        // password fields already cleared.
        const password = String(fd.get("password") ?? "");
        const confirm = String(fd.get("confirmPassword") ?? "");
        if (password !== confirm) {
          setPwError("The two passwords don't match. Type the same one twice.");
          (form.elements.namedItem("confirmPassword") as HTMLInputElement | null)?.focus();
          return;
        }

        startTransition(async () => {
          setError(null);
          try {
            const res = await action(fd);
            if (res.error) setError(res.error);
            else if (res.status) {
              setSent(res.status);
              setCooldown(res.status.cooldownSeconds);
            }
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
            {phoneError && <p id="phone-error" className="field-error" role="alert">{phoneError}</p>}
          </div>
          <Field label="City" name="city" required placeholder="Pune" />
          <Select label="State" name="state" defaultValue="Karnataka">{STATES.map((s) => <option key={s}>{s}</option>)}</Select>
        </div>
      </Step>

      <Step num="II." title={<>The password you&apos;ll <i>sign in with.</i></>}>
        <p style={{ font: "300 18px/1.6 var(--serif)", color: "var(--fg-soft)", maxWidth: "52ch", marginBottom: 28 }}>
          Choose it now and it&apos;s yours from the first day — no temporary password handed
          over by someone else. We store it scrambled, so nobody at HueVista can read it,
          which is also why we ask you to type it twice.
        </p>
        <div className="form-grid">
          <div className="field">
            <label className="field-label" htmlFor="password">Password</label>
            <div style={{ position: "relative" }}>
              <input
                id="password"
                name="password"
                type={showPw ? "text" : "password"}
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="At least eight characters"
                style={{ paddingRight: 56 }}
                onChange={() => setPwError(null)}
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                aria-pressed={showPw}
                aria-label={showPw ? "Hide password" : "Show password"}
                style={{ position: "absolute", right: 0, bottom: 8, background: "transparent", border: "none", cursor: "pointer", color: "var(--fg-mute)", font: "400 12px/1 var(--mono)", letterSpacing: ".22em", textTransform: "uppercase" }}
              >
                {showPw ? "Hide" : "Show"}
              </button>
            </div>
            <p style={{ margin: "8px 0 0", font: "300 italic 15px/1.4 var(--serif)", color: "var(--fg-mute)" }}>
              At least eight characters, with a letter and a number.
            </p>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="confirmPassword">Type it again</label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type={showPw ? "text" : "password"}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="The same password"
              aria-invalid={pwError ? "true" : undefined}
              aria-describedby={pwError ? "confirm-error" : undefined}
              onChange={() => setPwError(null)}
            />
            {pwError && <p id="confirm-error" className="field-error" role="alert">{pwError}</p>}
          </div>
        </div>
      </Step>

      <Step num="III." title={<>A word, <i>if you&apos;d like.</i></>}>
        <div className="field">
          <label className="field-label" htmlFor="notes">Anything we should know? · optional</label>
          <textarea id="notes" name="notes" rows={3} placeholder="Counter footfall, catalogues you stock, languages your customers speak." style={{ resize: "vertical" }} />
        </div>
        <p style={{ marginTop: 24, fontFamily: "var(--serif)", fontSize: 17, color: "var(--fg-mute)" }}>
          Your account opens on the free plan. No card, nothing to choose, nothing charged —
          if you later want more projects a month, you buy a plan from inside the app.
        </p>
      </Step>

      {error && <div className="field-error" role="alert" aria-live="assertive" style={{ marginTop: 24 }}>{error}</div>}

      <div style={{ marginTop: 40, display: "flex", alignItems: "center", gap: 32, flexWrap: "wrap" }}>
        <Button variant="brass" type="submit" disabled={pending}>
          {pending ? (
            <><Spinner size={14} color="currentColor" /><span>Sending…</span></>
          ) : (
            <>Create my shop account <span className="arr">→</span></>
          )}
        </Button>
        <span style={{ font: "300 italic 16px/1.4 var(--serif)", color: "var(--fg-mute)" }}>
          We&apos;ll email you a code to confirm this address.
        </span>
      </div>
      <style>{stepStyles}</style>
    </form>
  );
}

const stepStyles = `
  .step { padding: 56px 0; border-top: 1px solid var(--rule); }
  .step:first-of-type { border-top: none; padding-top: 0; }
  .step-head { display: flex; align-items: baseline; gap: 24px; margin-bottom: 40px; }
  .step-num { font: 300 italic 22px/1 var(--serif); color: var(--accent); }
  .step-title { font-family: var(--serif); font-weight: 300; font-size: 36px; line-height: 1; color: var(--fg); }
  .step-title i { color: var(--accent-soft); }
  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
  @media (max-width: 1100px) { .form-grid { grid-template-columns: 1fr; gap: 24px; } }
`;

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
