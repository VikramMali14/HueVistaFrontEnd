"use client";

import { useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api, HttpError } from "@/lib/api";
import { clearSession } from "@/lib/auth";
import type { AuthUser } from "@/lib/types";

const label: React.CSSProperties = {
  font: "400 10px/1 var(--mono)",
  letterSpacing: ".22em",
  textTransform: "uppercase",
  color: "var(--fg-mute)",
  alignSelf: "center",
};
const value: React.CSSProperties = { font: "400 17px/1.4 var(--serif)", color: "var(--fg)", margin: 0 };
const fieldStyle: React.CSSProperties = {
  padding: "9px 12px",
  border: "1px solid var(--rule-strong)",
  borderRadius: 6,
  background: "var(--surface)",
  color: "var(--fg)",
  font: "400 15px/1.2 var(--sans, system-ui)",
  width: "100%",
  maxWidth: 340,
};

function roleLabel(role: string): string {
  if (role === "CUSTOMER") return "Customer";
  if (role === "RETAILER") return "Retailer";
  return role.charAt(0) + role.slice(1).toLowerCase();
}

function msg(e: unknown): string {
  if (e instanceof HttpError) return e.message;
  return e instanceof Error ? e.message : "Something went wrong.";
}

function VerifiedChip({ verified }: { verified: boolean }) {
  return verified ? (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--accent)" }}>
      <span aria-hidden>✓</span>
      <Mono brass>Verified</Mono>
    </span>
  ) : (
    <Mono>Not verified</Mono>
  );
}

/**
 * The account page's interactive profile block: edit the display name
 * (PATCH /api/auth/profile), see email/mobile verification state (with inline
 * email OTP), and change the password (LOCAL accounts).
 */
export function AccountDetails({ user: initial }: { user: AuthUser }) {
  const [user, setUser] = useState(initial);

  // --- Name editing ---
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(initial.name);
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const saveName = async () => {
    const name = nameDraft.trim();
    if (!name || name === user.name) {
      setEditingName(false);
      setNameError(null);
      return;
    }
    if (name.length < 2) {
      setNameError("Your name needs at least two characters.");
      return;
    }
    setSavingName(true);
    setNameError(null);
    try {
      const updated = await api.updateMyProfile({ name });
      setUser((u) => ({ ...u, name: updated?.name ?? name }));
      setEditingName(false);
    } catch (e) {
      setNameError(msg(e));
    } finally {
      setSavingName(false);
    }
  };

  // --- Email verification (inline OTP, same endpoints as the dashboard card) ---
  const [emailVerified, setEmailVerified] = useState(Boolean(initial.emailVerified));
  const [otpPhase, setOtpPhase] = useState<"idle" | "sending" | "code" | "confirming">("idle");
  const [otpCode, setOtpCode] = useState("");
  const [otpDest, setOtpDest] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);

  const sendEmailCode = async () => {
    setOtpError(null);
    setOtpPhase("sending");
    try {
      const res = await api.sendEmailCode();
      setOtpDest(res.destination);
      setOtpPhase("code");
    } catch (e) {
      setOtpError(msg(e));
      setOtpPhase("idle");
    }
  };
  const confirmEmailCode = async () => {
    if (otpCode.trim().length < 4) return;
    setOtpError(null);
    setOtpPhase("confirming");
    try {
      await api.confirmEmailCode(otpCode.trim());
      setEmailVerified(true);
    } catch (e) {
      setOtpError(msg(e));
      setOtpPhase("code");
    }
  };

  return (
    <>
      <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "14px 28px", margin: 0 }}>
        <dt style={label}>Name</dt>
        <dd style={{ ...value, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {editingName ? (
            <>
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void saveName();
                  if (e.key === "Escape") {
                    setEditingName(false);
                    setNameError(null);
                  }
                }}
                aria-label="Your name"
                maxLength={100}
                style={fieldStyle}
              />
              <Button size="sm" onClick={() => void saveName()} disabled={savingName}>
                {savingName ? (
                  <>
                    <Spinner size={12} color="currentColor" /> Saving…
                  </>
                ) : (
                  "Save"
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditingName(false);
                  setNameDraft(user.name);
                  setNameError(null);
                }}
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              <span>{user.name}</span>
              <Button size="sm" variant="ghost" onClick={() => setEditingName(true)}>
                Edit
              </Button>
            </>
          )}
          {nameError && (
            <span className="field-error" role="alert" style={{ font: "400 12px/1.4 var(--sans, system-ui)", flexBasis: "100%" }}>
              {nameError}
            </span>
          )}
        </dd>

        <dt style={label}>Email</dt>
        <dd style={{ ...value, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span>{user.email}</span>
          <VerifiedChip verified={emailVerified} />
          {!emailVerified && (otpPhase === "idle" || otpPhase === "sending") && (
            <Button size="sm" variant="ghost" onClick={() => void sendEmailCode()} disabled={otpPhase === "sending"}>
              {otpPhase === "sending" ? (
                <>
                  <Spinner size={12} color="currentColor" /> Sending…
                </>
              ) : (
                "Verify now"
              )}
            </Button>
          )}
          {!emailVerified && (otpPhase === "code" || otpPhase === "confirming") && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {otpDest && <Mono>Code sent to {otpDest}</Mono>}
              <input
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                onKeyDown={(e) => e.key === "Enter" && void confirmEmailCode()}
                placeholder="6-digit code"
                aria-label="Email verification code"
                inputMode="numeric"
                autoComplete="one-time-code"
                style={{ ...fieldStyle, letterSpacing: ".3em", width: 140 }}
              />
              <Button size="sm" onClick={() => void confirmEmailCode()} disabled={otpCode.trim().length < 4 || otpPhase === "confirming"}>
                Confirm
              </Button>
            </span>
          )}
          {otpError && (
            <span className="field-error" role="alert" style={{ font: "400 12px/1.4 var(--sans, system-ui)", flexBasis: "100%" }}>
              {otpError}
            </span>
          )}
        </dd>

        <dt style={label}>Mobile</dt>
        <dd style={{ ...value, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span>{user.phoneNumber || "—"}</span>
          {user.phoneNumber ? (
            <VerifiedChip verified={Boolean(user.phoneVerified)} />
          ) : (
            <Mono>None on file</Mono>
          )}
        </dd>

        <dt style={label}>Account</dt>
        <dd style={value}>{roleLabel(user.role)}</dd>
      </dl>

      <ChangePasswordSection provider={user.provider} />
    </>
  );
}

/**
 * Change password (LOCAL accounts only — Google accounts have no HueVista
 * password). Success revokes EVERY session server-side, so we clear the local
 * cookies and land on sign-in rather than letting the next refresh fail
 * somewhere random.
 */
function ChangePasswordSection({ provider }: { provider: AuthUser["provider"] }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (provider !== "LOCAL") {
    return (
      <section style={{ marginTop: 48 }}>
        <h2 style={{ font: "600 18px/1.2 var(--serif)", color: "var(--fg)", margin: "0 0 8px" }}>Password</h2>
        <p style={{ font: "400 15px/1.6 var(--sans)", color: "var(--fg-soft)", margin: 0, maxWidth: "54ch" }}>
          You sign in with Google, so there&apos;s no HueVista password to change.
        </p>
      </section>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next.length < 8) {
      setError("The new password needs at least eight characters.");
      return;
    }
    // Mirrors the backend rule so the common case fails fast, client-side.
    if (!/(?=.*\p{L})(?=.*\d)/u.test(next)) {
      setError("The new password needs at least one letter and one number.");
      return;
    }
    if (next !== confirm) {
      setError("The new passwords don't match.");
      return;
    }
    setSaving(true);
    try {
      await api.changeMyPassword({ currentPassword: current, newPassword: next });
      setDone(true);
      // Every session is revoked server-side; clear the cookies and sign back
      // in with the new password. Small pause so the confirmation is readable.
      setTimeout(() => {
        void clearSession().finally(() => {
          window.location.href = "/sign-in?next=/account";
        });
      }, 1800);
    } catch (err) {
      setError(msg(err));
      setSaving(false);
    }
  };

  return (
    <section style={{ marginTop: 48 }}>
      <h2 style={{ font: "600 18px/1.2 var(--serif)", color: "var(--fg)", margin: "0 0 8px" }}>Change password</h2>
      <p style={{ font: "400 15px/1.6 var(--sans)", color: "var(--fg-soft)", margin: "0 0 18px", maxWidth: "54ch" }}>
        At least eight characters, with a letter and a number. Changing it signs you out everywhere —
        you&apos;ll sign back in with the new one.
      </p>
      {done ? (
        <p role="status" style={{ font: "400 15px/1.5 var(--sans)", color: "var(--accent)", margin: 0 }}>
          Password changed. Taking you to sign-in…
        </p>
      ) : (
        <form onSubmit={(e) => void submit(e)} style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 340 }}>
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="Current password"
            aria-label="Current password"
            autoComplete="current-password"
            required
            style={fieldStyle}
          />
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="New password"
            aria-label="New password"
            autoComplete="new-password"
            required
            style={fieldStyle}
          />
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Repeat the new password"
            aria-label="Repeat the new password"
            autoComplete="new-password"
            required
            style={fieldStyle}
          />
          {error && (
            <span className="field-error" role="alert" style={{ font: "400 13px/1.4 var(--sans, system-ui)" }}>
              {error}
            </span>
          )}
          <div>
            <Button type="submit" disabled={saving || !current || !next || !confirm}>
              {saving ? (
                <>
                  <Spinner size={13} color="currentColor" /> Changing…
                </>
              ) : (
                "Change password"
              )}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
