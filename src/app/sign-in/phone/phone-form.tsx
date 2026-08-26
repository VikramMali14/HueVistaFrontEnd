"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { signInWithPhoneAction } from "@/lib/auth";
import type { SmsConfirmation } from "@/lib/firebase";

/**
 * Sign in with a mobile number, in two steps: ask for the number, then the code
 * Firebase texts to it.
 *
 * <p>Everything to do with the SMS happens in the browser, against Firebase directly
 * (see `lib/firebase.ts` for why). Only the very last step touches our own servers:
 * the Firebase ID token goes to a server action, which trades it for a HueVista
 * session. The number itself is never what our backend trusts — it reads that out of
 * the signed token.
 */

/** Dial codes offered in the picker. India first: it is where the customers are. */
const DIAL_CODES = [
  { code: "+91", label: "India +91", digits: 10 },
  { code: "+971", label: "UAE +971", digits: 9 },
  { code: "+44", label: "UK +44", digits: 10 },
  { code: "+1", label: "US / Canada +1", digits: 10 },
  { code: "+61", label: "Australia +61", digits: 9 },
  { code: "+65", label: "Singapore +65", digits: 8 },
] as const;

/** Where the invisible reCAPTCHA mounts. Firebase needs a real element by id. */
const RECAPTCHA_ID = "hv-phone-recaptcha";

/** How long before the customer can ask for another text. */
const RESEND_SECONDS = 45;

interface PhoneFormProps {
  next: string;
  /**
   * False when this build has no Firebase configuration, in which case the page
   * says so instead of rendering a button that cannot work.
   */
  enabled: boolean;
}

type Step = "number" | "code";

export function PhoneSignInForm({ next, enabled }: PhoneFormProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("number");
  const [dial, setDial] = useState<string>(DIAL_CODES[0].code);
  const [national, setNational] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // The Firebase handle for the code that was texted. A ref, not state: it is not
  // rendered, and re-rendering on it would be a wasted pass mid-sign-in.
  const confirmation = useRef<SmsConfirmation | null>(null);
  const codeInput = useRef<HTMLInputElement>(null);

  const e164 = `${dial}${national.replace(/\D/g, "")}`;
  const expectedDigits = DIAL_CODES.find((c) => c.code === dial)?.digits ?? 10;

  // Tick the resend cooldown down.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // Drop the reCAPTCHA widget when the user navigates away mid-flow, so coming back
  // does not find a spent one still mounted.
  useEffect(() => {
    return () => {
      void import("@/lib/firebase").then((m) => m.clearRecaptcha());
    };
  }, []);

  if (!enabled) {
    return (
      <div className="field-error" role="alert" style={{ marginTop: 40 }}>
        Signing in by mobile isn&apos;t switched on for this site yet.{" "}
        <Link href="/sign-in" style={{ color: "var(--accent-soft)" }}>Sign in with your email instead.</Link>
      </div>
    );
  }

  const sendCode = async () => {
    const digits = national.replace(/\D/g, "");
    if (digits.length < 6) {
      setError("Enter your mobile number.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { sendSmsCode, phoneAuthErrorMessage } = await import("@/lib/firebase");
      try {
        confirmation.current = await sendSmsCode(e164, RECAPTCHA_ID);
        setStep("code");
        setCooldown(RESEND_SECONDS);
        // The code field is only rendered from this point, so focus after paint.
        setTimeout(() => codeInput.current?.focus(), 0);
      } catch (err) {
        setError(phoneAuthErrorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (cooldown > 0) return;
    setCode("");
    await sendCode();
  };

  const verify = async () => {
    if (!confirmation.current) {
      setError("That code has expired. Please request a new one.");
      setStep("number");
      return;
    }
    if (code.trim().length !== 6) {
      setError("Enter the 6-digit code from the text.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { confirmSmsCode, phoneAuthErrorMessage } = await import("@/lib/firebase");
      let idToken: string;
      try {
        idToken = await confirmSmsCode(confirmation.current, code);
      } catch (err) {
        setError(phoneAuthErrorMessage(err));
        setBusy(false);
        return;
      }
      // From here on it is our own backend. A failure now is NOT a wrong code —
      // saying so would send the customer back to re-read a text that was fine.
      const result = await signInWithPhoneAction({ idToken, name, next });
      if ("error" in result) {
        setError(result.error);
        setBusy(false);
        return;
      }
      // A full navigation, not router.push: the session cookies were just set
      // server-side and every cached route segment above this one predates them.
      router.replace(result.next);
      router.refresh();
    } catch {
      setError("Something went wrong finishing your sign-in. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, marginTop: 48 }}>
      {step === "number" ? (
        <>
          <div className="field">
            <label className="field-label" htmlFor="phone-national">Mobile number</label>
            <div style={{ display: "flex", gap: 10 }}>
              <select
                aria-label="Country dialling code"
                value={dial}
                onChange={(e) => setDial(e.target.value)}
                style={{ flex: "0 0 auto", maxWidth: 150 }}
              >
                {DIAL_CODES.map((c) => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
              <input
                id="phone-national"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                autoFocus
                placeholder={"9".repeat(expectedDigits)}
                value={national}
                // Strip as they type: a pasted "+91 98765 43210" or "(98765) 43210"
                // should just work rather than be rejected for its punctuation.
                onChange={(e) => setNational(e.target.value.replace(/[^\d]/g, "").slice(0, 15))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !busy) { e.preventDefault(); void sendCode(); }
                }}
                aria-invalid={error ? "true" : undefined}
                aria-describedby={error ? "phone-error" : "phone-hint"}
                style={{ flex: 1, minWidth: 0 }}
              />
            </div>
            <p id="phone-hint" style={hint}>
              We&apos;ll text you a 6-digit code. Standard message rates may apply.
            </p>
          </div>

          {/* Asked for once, up front, and only used if this number turns out to be
              new to us — a phone sign-in carries no name of its own. Optional, so a
              returning customer can ignore it entirely. */}
          <div className="field">
            <label className="field-label" htmlFor="phone-name">Your name <span style={optional}>optional</span></label>
            <input
              id="phone-name"
              type="text"
              autoComplete="name"
              placeholder="So we know what to call you"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 100))}
            />
          </div>

          {error && <div id="phone-error" className="field-error" role="alert">{error}</div>}

          <Button type="button" onClick={() => void sendCode()} disabled={busy} style={{ justifyContent: "center" }}>
            {busy ? "Sending the code…" : <>Text me a code <span className="arr">→</span></>}
          </Button>
        </>
      ) : (
        <>
          <div className="field">
            <label className="field-label" htmlFor="phone-code">Your 6-digit code</label>
            <input
              id="phone-code"
              ref={codeInput}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !busy) { e.preventDefault(); void verify(); }
              }}
              aria-invalid={error ? "true" : undefined}
              aria-describedby={error ? "phone-error" : "code-hint"}
              style={{ letterSpacing: ".4em", fontFamily: "var(--mono)" }}
            />
            <p id="code-hint" style={hint}>
              Sent to <strong style={{ color: "var(--fg-soft)" }}>{e164}</strong>.{" "}
              <button type="button" onClick={() => { setStep("number"); setError(null); setCode(""); }} style={linkish}>
                Wrong number?
              </button>
            </p>
          </div>

          {error && <div id="phone-error" className="field-error" role="alert">{error}</div>}

          <Button type="button" onClick={() => void verify()} disabled={busy} style={{ justifyContent: "center" }}>
            {busy ? "Checking…" : <>Sign in <span className="arr">→</span></>}
          </Button>

          <button type="button" onClick={() => void resend()} disabled={cooldown > 0 || busy} style={resendStyle(cooldown > 0 || busy)}>
            {cooldown > 0 ? `Send another code in ${cooldown}s` : "Send another code"}
          </button>
        </>
      )}

      {/* Firebase mounts the invisible reCAPTCHA here. It must stay in the DOM for
          both steps: a resend needs somewhere to render a fresh one. */}
      <div id={RECAPTCHA_ID} />
    </div>
  );
}

const hint: CSSProperties = {
  margin: "8px 0 0",
  font: "300 14px/1.5 var(--serif)",
  color: "var(--fg-mute)",
};

const optional: CSSProperties = {
  font: "400 11px/1 var(--mono)",
  letterSpacing: ".2em",
  color: "var(--fg-mute)",
  marginLeft: 8,
};

const linkish: CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  color: "var(--accent-soft)",
  font: "inherit",
  borderBottom: "1px solid var(--rule-brass)",
};

function resendStyle(disabled: boolean): CSSProperties {
  return {
    background: "none",
    border: "none",
    padding: 0,
    alignSelf: "flex-start",
    cursor: disabled ? "default" : "pointer",
    color: disabled ? "var(--fg-mute)" : "var(--accent-soft)",
    font: "400 12px/1 var(--mono)",
    letterSpacing: ".22em",
    textTransform: "uppercase",
  };
}
