"use client";

import { useState } from "react";
import Link from "next/link";
import { Mono } from "@/components/ui/eyebrow";
import { Spinner } from "@/components/ui/spinner";
import { validateEmail, validatePhone } from "@/lib/validation";

type Step = "request" | "reset" | "done";
type Channel = "email" | "phone";

async function postJson(path: string, body: unknown): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    let message: string | undefined;
    try {
      message = ((await res.json()) as { message?: string }).message;
    } catch {
      /* no body */
    }
    return { ok: res.ok, message };
  } catch {
    return { ok: false, message: "Network error. Please try again." };
  }
}

export function ForgotForm() {
  const [channel, setChannel] = useState<Channel>("email");
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [destError, setDestError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const isPhone = channel === "phone";
  const dest = isPhone ? phone.trim() : email.trim();

  const switchChannel = (c: Channel) => {
    if (c === channel) return;
    setChannel(c);
    setStep("request");
    setError(null);
    setDestError(null);
    setCodeError(null);
    setPasswordError(null);
  };

  // The backend returns 200 whether or not the destination matches an account —
  // only a transport failure (offline, server down) reports an error here.
  const requestCode = async (): Promise<boolean> => {
    const { ok, message } = isPhone
      ? await postJson("/api/auth/forgot-password/phone", { phone: phone.trim() })
      : await postJson("/api/auth/forgot-password", { email: email.trim() });
    if (!ok) {
      setError(message ?? "Could not send the code. Check your connection and try again.");
      return false;
    }
    return true;
  };

  const request = async () => {
    const invalid = isPhone ? validatePhone(phone) : validateEmail(email);
    if (invalid) {
      setDestError(invalid);
      return;
    }
    setDestError(null);
    setBusy(true);
    setError(null);
    const ok = await requestCode();
    setBusy(false);
    if (ok) setStep("reset");
  };

  const resend = async () => {
    setResending(true);
    setError(null);
    await requestCode();
    setResending(false);
  };

  const reset = async () => {
    const codeMsg =
      code.trim().length !== 6
        ? isPhone
          ? "Enter the 6-digit code from the text message."
          : "Enter the 6-digit code from your email."
        : null;
    const pwMsg = password.length < 8 ? "Use a new password of at least 8 characters." : null;
    setCodeError(codeMsg);
    setPasswordError(pwMsg);
    if (codeMsg || pwMsg) return;
    setBusy(true);
    setError(null);
    const { ok, message } = isPhone
      ? await postJson("/api/auth/reset-password/phone", { phone: phone.trim(), code: code.trim(), newPassword: password })
      : await postJson("/api/auth/reset-password", { email: email.trim(), code: code.trim(), newPassword: password });
    setBusy(false);
    if (ok) setStep("done");
    else setError(message ?? "Could not reset your password.");
  };

  if (step === "done") {
    return (
      <div style={{ marginTop: 40 }}>
        <span aria-hidden style={{ fontSize: 40, color: "var(--accent)" }}>✓</span>
        <h2 style={{ font: "400 28px/1.2 var(--serif)", color: "var(--fg)", margin: "12px 0 16px" }}>
          Password reset.
        </h2>
        <Link className="btn" href="/sign-in">Sign in <span className="arr">→</span></Link>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, marginTop: 48 }}>
      {step === "request" && (
        <div role="group" aria-label="Reset using" style={{ display: "inline-flex", gap: 8 }}>
          <ChannelTab active={!isPhone} onClick={() => switchChannel("email")}>Email</ChannelTab>
          <ChannelTab active={isPhone} onClick={() => switchChannel("phone")}>Mobile</ChannelTab>
        </div>
      )}

      {step === "request" ? (
        <>
          {isPhone ? (
            <div className="field">
              <label className="field-label" htmlFor="phone">Mobile number</label>
              <input
                id="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setDestError(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && void request()}
                placeholder="+91 98 2210 4476"
                aria-invalid={destError ? "true" : undefined}
                aria-describedby={destError ? "dest-error" : undefined}
              />
              {destError && <p id="dest-error" className="field-error" role="alert">{destError}</p>}
            </div>
          ) : (
            <div className="field">
              <label className="field-label" htmlFor="email">Shop email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setDestError(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && void request()}
                required
                autoComplete="email"
                inputMode="email"
                placeholder="priya@mehtapaints.in"
                aria-invalid={destError ? "true" : undefined}
                aria-describedby={destError ? "dest-error" : undefined}
              />
              {destError && <p id="dest-error" className="field-error" role="alert">{destError}</p>}
            </div>
          )}
          <button type="button" className="btn" onClick={() => void request()} disabled={busy} style={{ justifyContent: "center" }}>
            {busy ? <><Spinner size={14} color="currentColor" /> Sending…</> : <>Send reset code <span className="arr">→</span></>}
          </button>
          <Mono>
            {isPhone
              ? "We'll text a code only if a verified mobile matches — no message, no error otherwise, to protect your privacy."
              : "If no account exists, no email is sent and no error is shown — to protect your privacy."}
          </Mono>
        </>
      ) : (
        <>
          <Mono>We sent a 6-digit code to {dest}. Enter it with your new password.</Mono>
          <div className="field">
            <label className="field-label" htmlFor="code">Reset code</label>
            <input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6));
                setCodeError(null);
              }}
              placeholder="000000"
              style={{ letterSpacing: ".3em" }}
              aria-invalid={codeError ? "true" : undefined}
              aria-describedby={codeError ? "code-error" : undefined}
            />
            {codeError && <p id="code-error" className="field-error" role="alert">{codeError}</p>}
          </div>
          <div className="field">
            <label className="field-label" htmlFor="newpw">New password</label>
            <input
              id="newpw"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setPasswordError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && void reset()}
              minLength={8}
              autoComplete="new-password"
              placeholder="At least eight characters"
              aria-invalid={passwordError ? "true" : undefined}
              aria-describedby={passwordError ? "newpw-error" : undefined}
            />
            {passwordError && <p id="newpw-error" className="field-error" role="alert">{passwordError}</p>}
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" className="btn" onClick={() => void reset()} disabled={busy || resending} style={{ justifyContent: "center" }}>
              {busy ? <><Spinner size={14} color="currentColor" /> Resetting…</> : <>Reset password <span className="arr">→</span></>}
            </button>
            <button
              type="button"
              onClick={() => void resend()}
              disabled={busy || resending}
              style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--fg-mute)", font: "400 11px/1 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase" }}
            >
              {resending ? "Sending…" : "Resend code"}
            </button>
          </div>
        </>
      )}
      {error && <div className="field-error" role="alert">{error}</div>}
    </div>
  );
}

function ChannelTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        font: "400 10px/1 var(--mono)",
        letterSpacing: ".22em",
        textTransform: "uppercase",
        padding: "9px 16px",
        background: active ? "var(--accent)" : "transparent",
        color: active ? "var(--bg)" : "var(--fg-soft)",
        border: "1px solid " + (active ? "var(--accent)" : "var(--rule-strong)"),
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
