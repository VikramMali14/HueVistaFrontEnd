"use client";

import { useState } from "react";
import Link from "next/link";
import { Mono } from "@/components/ui/eyebrow";
import { Spinner } from "@/components/ui/spinner";

type Step = "request" | "reset" | "done";

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
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = async () => {
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    // Always advances — the backend returns 200 whether or not the account exists.
    await postJson("/api/auth/forgot-password", { email: email.trim() });
    setBusy(false);
    setStep("reset");
  };

  const reset = async () => {
    if (code.trim().length < 4 || password.length < 8) {
      setError("Enter the 6-digit code and a new passphrase of at least 8 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    const { ok, message } = await postJson("/api/auth/reset-password", {
      email: email.trim(),
      code: code.trim(),
      newPassword: password,
    });
    setBusy(false);
    if (ok) setStep("done");
    else setError(message ?? "Could not reset your password.");
  };

  if (step === "done") {
    return (
      <div style={{ marginTop: 40 }}>
        <span aria-hidden style={{ fontSize: 40, color: "var(--accent)" }}>✓</span>
        <h2 style={{ font: "300 italic 28px/1.2 var(--serif)", color: "var(--fg)", margin: "12px 0 16px" }}>
          Passphrase reset.
        </h2>
        <Link className="btn" href="/sign-in">Sign in <span className="arr">→</span></Link>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, marginTop: 48 }}>
      {step === "request" ? (
        <>
          <div className="field">
            <label className="field-label" htmlFor="email">Shop email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void request()}
              required
              autoComplete="email"
              placeholder="suresh@shardapaints.in"
            />
          </div>
          <button type="button" className="btn" onClick={() => void request()} disabled={busy} style={{ justifyContent: "center" }}>
            {busy ? <><Spinner size={14} color="currentColor" /> Sending…</> : <>Send reset code <span className="arr">→</span></>}
          </button>
          <Mono>If no account exists, no email is sent and no error is shown — to protect your privacy.</Mono>
        </>
      ) : (
        <>
          <Mono>We sent a 6-digit code to {email}. Enter it with your new passphrase.</Mono>
          <div className="field">
            <label className="field-label" htmlFor="code">Reset code</label>
            <input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
              placeholder="000000"
              style={{ letterSpacing: ".3em" }}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="newpw">New passphrase</label>
            <input
              id="newpw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void reset()}
              minLength={8}
              autoComplete="new-password"
              placeholder="At least eight characters"
            />
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" className="btn" onClick={() => void reset()} disabled={busy} style={{ justifyContent: "center" }}>
              {busy ? <><Spinner size={14} color="currentColor" /> Resetting…</> : <>Reset passphrase <span className="arr">→</span></>}
            </button>
            <button
              type="button"
              onClick={() => void request()}
              disabled={busy}
              style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--fg-mute)", font: "400 11px/1 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase" }}
            >
              Resend code
            </button>
          </div>
        </>
      )}
      {error && <div className="field-error" role="alert">{error}</div>}
    </div>
  );
}
