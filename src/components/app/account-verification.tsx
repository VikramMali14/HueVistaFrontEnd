"use client";

import { useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api, HttpError } from "@/lib/api";
import type { AuthUser } from "@/lib/types";

type Phase = "idle" | "sending" | "code" | "confirming";

/**
 * Non-blocking "secure your account" card: verify email and mobile with a
 * 6-digit OTP. Self-hides once both are verified. Reads initial status from the
 * server-rendered user, then talks to /api/auth/verify/* via the BFF.
 */
export function AccountVerification({ user }: { user: AuthUser | null }) {
  const [emailVerified, setEmailVerified] = useState(Boolean(user?.emailVerified));
  const [phoneVerified, setPhoneVerified] = useState(Boolean(user?.phoneVerified));
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber ?? "");

  if (!user || (emailVerified && phoneVerified)) return null;

  return (
    <section
      style={{
        border: "1px solid var(--rule-strong)",
        background: "var(--surface-soft)",
        padding: 24,
        marginBottom: 32,
        borderRadius: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <span style={{ font: "600 22px/1 var(--serif)", color: "var(--fg)" }}>Secure your account</span>
        <Mono brass>{`${(emailVerified ? 1 : 0) + (phoneVerified ? 1 : 0)} of 2 verified`}</Mono>
      </div>
      <p style={{ font: "400 15px/1.5 var(--sans)", color: "var(--fg-soft)", margin: "8px 0 20px", maxWidth: "60ch" }}>
        Verify your email and mobile number before you create your first project — it&apos;s how we reach
        you about your work and keep your account safe.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <EmailRow email={user.email} verified={emailVerified} onVerified={() => setEmailVerified(true)} />
        <PhoneRow
          phoneNumber={phoneNumber}
          setPhoneNumber={setPhoneNumber}
          verified={phoneVerified}
          onVerified={() => setPhoneVerified(true)}
        />
      </div>
    </section>
  );
}

function EmailRow({ email, verified, onVerified }: { email: string; verified: boolean; onVerified: () => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [code, setCode] = useState("");
  const [dest, setDest] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setError(null);
    setPhase("sending");
    try {
      const res = await api.sendEmailCode();
      setDest(res.destination);
      setPhase("code");
    } catch (e) {
      setError(msg(e));
      setPhase("idle");
    }
  };
  const confirm = async () => {
    if (code.trim().length < 4) return;
    setError(null);
    setPhase("confirming");
    try {
      await api.confirmEmailCode(code.trim());
      onVerified();
    } catch (e) {
      setError(msg(e));
      setPhase("code");
    }
  };

  return (
    <Row
      label="Email"
      value={email}
      verified={verified}
      phase={phase}
      code={code}
      setCode={setCode}
      dest={dest}
      error={error}
      onSend={() => void send()}
      onConfirm={() => void confirm()}
    />
  );
}

function PhoneRow({
  phoneNumber,
  setPhoneNumber,
  verified,
  onVerified,
}: {
  phoneNumber: string;
  setPhoneNumber: (v: string) => void;
  verified: boolean;
  onVerified: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [code, setCode] = useState("");
  const [dest, setDest] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!phoneNumber.trim()) {
      setError("Enter your mobile number first.");
      return;
    }
    setError(null);
    setPhase("sending");
    try {
      const res = await api.sendPhoneCode(phoneNumber.trim());
      setDest(res.destination);
      setPhase("code");
    } catch (e) {
      setError(msg(e));
      setPhase("idle");
    }
  };
  const confirm = async () => {
    if (code.trim().length < 4) return;
    setError(null);
    setPhase("confirming");
    try {
      await api.confirmPhoneCode(code.trim());
      onVerified();
    } catch (e) {
      setError(msg(e));
      setPhase("code");
    }
  };

  return (
    <Row
      label="Mobile"
      verified={verified}
      value={verified ? phoneNumber : undefined}
      phase={phase}
      code={code}
      setCode={setCode}
      dest={dest}
      error={error}
      onSend={() => void send()}
      onConfirm={() => void confirm()}
      input={
        !verified && phase === "idle" ? (
          <input
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="+91 98 8654 7321"
            aria-label="Mobile number"
            inputMode="tel"
            style={fieldStyle}
          />
        ) : undefined
      }
    />
  );
}

/** Shared presentation for a single channel row. */
function Row({
  label,
  value,
  verified,
  phase,
  code,
  setCode,
  dest,
  error,
  onSend,
  onConfirm,
  input,
}: {
  label: string;
  value?: string;
  verified: boolean;
  phase: Phase;
  code: string;
  setCode: (v: string) => void;
  dest: string | null;
  error: string | null;
  onSend: () => void;
  onConfirm: () => void;
  input?: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--rule)",
        borderRadius: 6,
        padding: "14px 16px",
        background: "var(--bg)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Mono style={{ minWidth: 56 }}>{label}</Mono>
        {value && <span style={{ font: "400 14px/1 var(--sans, system-ui)", color: "var(--fg)" }}>{value}</span>}
        <div style={{ flex: 1 }} />
        {verified ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--accent)" }}>
            <span aria-hidden>✓</span>
            <Mono brass>Verified</Mono>
          </span>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {input}
            {phase !== "code" && (
              <Button size="sm" variant="ghost" onClick={onSend} disabled={phase === "sending"}>
                {phase === "sending" ? (
                  <>
                    <Spinner size={12} color="currentColor" /> Sending…
                  </>
                ) : (
                  "Send code"
                )}
              </Button>
            )}
          </div>
        )}
      </div>

      {!verified && phase === "code" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {dest && <Mono>Code sent to {dest}</Mono>}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && onConfirm()}
              placeholder="6-digit code"
              aria-label={`${label} verification code`}
              inputMode="numeric"
              autoComplete="one-time-code"
              style={{ ...fieldStyle, letterSpacing: ".3em", width: 140 }}
            />
            <Button size="sm" onClick={onConfirm} disabled={code.trim().length < 4}>
              Confirm
            </Button>
            <button type="button" onClick={onSend} style={linkBtn}>
              Resend
            </button>
          </div>
        </div>
      )}

      {error && (
        <span className="field-error" role="alert" style={{ font: "400 12px/1.4 var(--sans, system-ui)" }}>
          {error}
        </span>
      )}
    </div>
  );
}

const fieldStyle: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid var(--rule-strong)",
  borderRadius: 6,
  background: "var(--surface)",
  color: "var(--fg)",
  font: "500 14px/1 var(--sans, system-ui)",
};

const linkBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  cursor: "pointer",
  color: "var(--fg-mute)",
  font: "400 11px/1 var(--mono)",
  letterSpacing: ".18em",
  textTransform: "uppercase",
};

function msg(e: unknown): string {
  if (e instanceof HttpError) return e.message;
  return e instanceof Error ? e.message : "Something went wrong.";
}
