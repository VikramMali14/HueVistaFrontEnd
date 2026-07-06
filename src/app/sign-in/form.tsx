"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GoogleButton } from "@/components/auth/google-button";

interface SignInFormProps {
  action: (formData: FormData) => Promise<{ error?: string; otpRequired?: boolean } | void>;
  /** Admin 2FA second step — same credentials + the emailed 6-digit code. */
  otpAction?: (formData: FormData) => Promise<{ error?: string } | void>;
  next: string;
  /** "register" renders the free-account variant (name fields, new-password). */
  mode?: "signin" | "register";
  /** Seed an error (e.g. when redirected back from a failed Google sign-in). */
  initialError?: string;
  /** Passed through as a hidden field — "customer" creates a CUSTOMER-role account. */
  accountType?: string;
  /** Hide the Google button (the customer signup omits it so the account stays CUSTOMER). */
  showGoogle?: boolean;
}

export function SignInForm({ action, otpAction, next, mode = "signin", initialError, accountType, showGoogle = true }: SignInFormProps) {
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [pending, startTransition] = useTransition();
  const [showPassword, setShowPassword] = useState(false);
  // Admin 2FA: the password checked out and a code was emailed — the same form
  // re-submits with the extra code field through otpAction.
  const [otpRequired, setOtpRequired] = useState(false);
  const register = mode === "register";

  return (
    <form
      style={{ display: "flex", flexDirection: "column", gap: 28, marginTop: 48 }}
      onSubmit={(e) => {
        e.preventDefault();
        // Surface the browser's bubble on the exact offending field (works with noValidate).
        if (!e.currentTarget.reportValidity()) return;
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          setError(null);
          try {
            const submit = otpRequired && otpAction ? otpAction : action;
            const res = await submit(fd);
            if (res && "otpRequired" in res && res.otpRequired) setOtpRequired(true);
            if (res && "error" in res && res.error) setError(res.error);
          } catch (err) {
            setError(err instanceof Error ? err.message : register ? "Could not create the account." : "Could not sign in.");
          }
        });
      }}
      noValidate
      aria-busy={pending}
    >
      <input type="hidden" name="next" value={next} />
      {accountType && <input type="hidden" name="accountType" value={accountType} />}

      {showGoogle && (
        <>
          <GoogleButton next={next} />
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
            }}
          >
            <span style={{ flex: 1, height: 1, background: "var(--rule)" }} />
            or use your email
            <span style={{ flex: 1, height: 1, background: "var(--rule)" }} />
          </div>
        </>
      )}

      {register && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div className="field">
            <label className="field-label" htmlFor="firstName">
              First name
            </label>
            <input id="firstName" name="firstName" type="text" placeholder="Priya" required autoComplete="given-name" />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="lastName">
              Last name
            </label>
            <input id="lastName" name="lastName" type="text" placeholder="Mehta" required autoComplete="family-name" />
          </div>
        </div>
      )}

      <div className="field">
        <label className="field-label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          placeholder="priya@mehtapaints.in"
          required
          autoComplete="email"
          inputMode="email"
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? "signin-error" : undefined}
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="password">
          Password
        </label>
        <div style={{ position: "relative" }}>
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            placeholder={register ? "At least eight characters" : "••••••••••••"}
            required
            minLength={8}
            autoComplete={register ? "new-password" : "current-password"}
            aria-invalid={error ? "true" : undefined}
            aria-describedby={error ? "signin-error" : undefined}
            style={{ paddingRight: 56 }}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-pressed={showPassword}
            aria-controls="password"
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
      </div>
      {!register && (
        <div
          style={{
            display: "flex",
            gap: 16,
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
          }}
        >
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              font: "400 10px/1 var(--mono)",
              letterSpacing: ".22em",
              textTransform: "uppercase",
              color: "var(--fg-soft)",
              cursor: "pointer",
            }}
          >
            <input type="checkbox" name="remember" defaultChecked style={{ accentColor: "var(--accent)" }} />
            Remember me
          </label>
          <Link
            href="/sign-in/forgot"
            style={{
              font: "400 15px/1 var(--serif)",
              color: "var(--accent-soft)",
              borderBottom: "1px solid var(--rule-brass)",
              paddingBottom: 2,
            }}
          >
            Forgot password?
          </Link>
        </div>
      )}
      {otpRequired && (
        <div className="field">
          <label className="field-label" htmlFor="otp-code">
            Sign-in code
          </label>
          <input
            id="otp-code"
            name="code"
            type="text"
            placeholder="6-digit code"
            required
            autoFocus
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
          />
          <p style={{ margin: "8px 0 0", font: "300 14px/1.5 var(--serif)", color: "var(--fg-mute)" }}>
            Admin accounts need a second step: we emailed you a 6-digit code. It expires in ten minutes.
          </p>
        </div>
      )}
      {error && (
        <div id="signin-error" className="field-error" role="alert" aria-live="assertive">
          {error}
        </div>
      )}
      <Button type="submit" disabled={pending} style={{ justifyContent: "center" }}>
        {pending ? (
          <>
            <span className="hv-mix" aria-hidden>
              <i style={{ background: "#b96b48" }} />
              <i style={{ background: "#7b8a72" }} />
              <i style={{ background: "#8c98a8" }} />
            </span>
            <span>Mixing your colours…</span>
          </>
        ) : (
          <>
            {otpRequired ? "Verify code" : register ? "Create free account" : "Sign in"} <span className="arr">→</span>
          </>
        )}
      </Button>
    </form>
  );
}
