"use client";

import { useState } from "react";
import Link from "next/link";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/components/auth/logout-button";
import { Spinner } from "@/components/ui/spinner";
import {
  addCodeToAccountAction,
  confirmKioskReentryAction,
  requestKioskReentryAction,
} from "@/lib/auth";
import { site } from "@/lib/config";
import { ACCESS_CODE_LENGTH, normalizeAccessCode, validateAccessCode } from "@/lib/validation";
import type { UserRole } from "@/lib/types";

/** Who is holding this browser, resolved server-side by the page. Null = nobody. */
export interface SignedInAs {
  name: string;
  role: UserRole;
}

/** What happened, once something has been accepted. */
type Done =
  /** The code was added to the account already signed in. */
  | { kind: "added"; shopName: string; projects: number }
  /** A kiosk buyer signed back in with an emailed code. */
  | { kind: "reentered"; name: string };

/** Plural, human name for a role, for the "you're signed in as…" refusal. */
const ROLE_NAMES: Partial<Record<UserRole, string>> = {
  RETAILER: "a shop",
  ADMIN: "an administrator",
  DISTRIBUTOR: "a distributor",
  PAINTER: "a painter",
};

/**
 * The way back to your rooms — which is two different doors, because there are two
 * different things a customer can be holding.
 *
 * <p><b>A code from the counter</b> is redeemed ONTO an account. A signed-in customer
 * adds it here. A signed-out one has to sign in or register first: there is no longer a
 * route that mints an account from a code, and there should not be — such an account
 * has no password and no address, so its owner could never get back into it, and a code
 * that opened it would be a password printed on a slip that never expires.
 *
 * <p><b>A kiosk purchase</b> already has an account; it was opened at the till. The way
 * in is the address the buyer paid with, so this asks for that and emails a one-time
 * code. Their printed code stays what it was always for — the shop reading it at the
 * counter to mix the paint.
 */
export function UnlockForm({ signedInAs = null }: { signedInAs?: SignedInAs | null }) {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "working" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Done | null>(null);

  // Kiosk re-entry, which is a two-step of its own: ask for a code, then enter it.
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [emailedCode, setEmailedCode] = useState("");

  const isCustomer = signedInAs?.role === "CUSTOMER";
  const wrongAccount = signedInAs !== null && !isCustomer;

  async function addCode() {
    const value = normalizeAccessCode(code);
    const invalid = validateAccessCode(value);
    if (invalid) {
      setError(invalid);
      return;
    }
    setStatus("working");
    setError(null);
    const res = await addCodeToAccountAction(value);
    if ("error" in res) {
      setError(res.error);
      setStatus("idle");
      return;
    }
    setResult({ kind: "added", shopName: res.shopName, projects: res.projects });
    setStatus("done");
  }

  async function sendReentryCode() {
    setStatus("working");
    setError(null);
    const res = await requestKioskReentryAction(email);
    setStatus("idle");
    if ("error" in res) {
      setError(res.error);
      return;
    }
    // Deliberately unconditional. The backend will not say whether that address bought
    // anything, and neither will this — otherwise the box becomes a way of asking
    // whether a stranger has shopped here.
    setSent(true);
  }

  async function confirmReentry() {
    setStatus("working");
    setError(null);
    const res = await confirmKioskReentryAction(email, emailedCode);
    if ("error" in res) {
      setError(res.error);
      setStatus("idle");
      return;
    }
    setResult({ kind: "reentered", name: res.name });
    setStatus("done");
  }

  if (status === "done" && result) {
    return <DoneScreen result={result} />;
  }

  // A shop, distributor, painter or admin is signed in. No code box: the only honest
  // next step is to leave this account first.
  if (wrongAccount) {
    return (
      <div>
        <header style={{ marginBottom: 28 }}>
          <Eyebrow>Unlock · shop code</Eyebrow>
          <h1 className="display" style={{ fontSize: "clamp(36px, 5vw, 64px)", marginTop: 12 }}>
            This is <i>{ROLE_NAMES[signedInAs.role] ?? "another kind of"}</i> account.
          </h1>
          <Lead style={{ marginTop: 20, maxWidth: "52ch" }}>
            Access codes are for walk-in customers, and redeeming one here would take{" "}
            {signedInAs.name} off this browser and put the customer in their place. Hand
            the phone or tablet to the customer and sign out first, or open{" "}
            <strong>{site.unlockLabel}</strong> in a private window and let them enter
            it there.
          </Lead>
        </header>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
          <LogoutButton label="Sign out and unlock" />
          <Link className="btn btn-ghost" href="/dashboard">
            Back to dashboard
          </Link>
        </div>
        {signedInAs.role === "RETAILER" && (
          <p style={{ font: "400 14px/1.5 var(--serif)", color: "var(--fg-mute)", marginTop: 24, maxWidth: "52ch" }}>
            Checking what a customer has chosen? You don&apos;t need their code for that —
            open{" "}
            <Link href="/portal" style={{ color: "var(--accent-soft)" }}>
              your customer portal
            </Link>{" "}
            and the rooms made against every code you issued are listed there, with the
            real shade codes.
          </p>
        )}
      </div>
    );
  }

  // Signed in as a customer: the code joins the account in hand.
  if (isCustomer) {
    return (
      <div>
        <header style={{ marginBottom: 32 }}>
          <Eyebrow>Unlock · shop code</Eyebrow>
          <h1 className="display" style={{ fontSize: "clamp(40px, 5vw, 72px)", marginTop: 12 }}>
            Have a code from{" "}<br /><i>your paint shop?</i>
          </h1>
          <Lead style={{ marginTop: 20, maxWidth: "52ch" }}>
            Enter it below and it joins this account — the rooms you&apos;ve already made stay
            exactly where they are.
          </Lead>
        </header>

        <CodeBox
          code={code}
          setCode={(v) => { setCode(v); setError(null); }}
          onSubmit={() => void addCode()}
          busy={status === "working"}
          invalid={Boolean(error)}
        />

        {error && <p className="field-error" role="alert" style={{ marginTop: 16 }}>{error}</p>}

        <p style={{ font: "400 14px/1.5 var(--serif)", color: "var(--fg-mute)", marginTop: 20, maxWidth: "52ch" }}>
          You&apos;re signed in as {signedInAs.name}. The projects your shop assigned are added
          to the ones you already hold.
        </p>
      </div>
    );
  }

  // Signed out. The kiosk buyer is the common case and gets the top of the page.
  return (
    <div>
      <header style={{ marginBottom: 32 }}>
        <Eyebrow>Back to your rooms</Eyebrow>
        <h1 className="display" style={{ fontSize: "clamp(40px, 5vw, 72px)", marginTop: 12 }}>
          Bought a room at{" "}<br /><i>a paint shop?</i>
        </h1>
        <Lead style={{ marginTop: 20, maxWidth: "52ch" }}>
          Enter the email you gave at the shop and we&apos;ll send you a code to sign in with.
          Your printed code isn&apos;t a password — it&apos;s what the counter reads to mix your
          shades.
        </Lead>
      </header>

      {!sent ? (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", maxWidth: 460 }}>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(null); }}
            onKeyDown={(e) => e.key === "Enter" && void sendReentryCode()}
            placeholder="you@example.com"
            aria-label="The email you gave at the shop"
            style={{
              flex: 1, minWidth: 200, padding: "12px 14px",
              border: "1px solid var(--rule-strong)", background: "var(--surface)",
              color: "var(--fg)", fontSize: 16,
            }}
          />
          <Button onClick={() => void sendReentryCode()} disabled={status === "working" || !email.includes("@")}>
            {status === "working"
              ? <><Spinner size={14} color="currentColor" /> Sending…</>
              : <>Email me a code <span className="arr">→</span></>}
          </Button>
        </div>
      ) : (
        <div style={{ maxWidth: 460 }}>
          <p style={{ font: "400 15px/1.6 var(--serif)", color: "var(--fg-soft)", marginBottom: 16 }}>
            If <strong>{email}</strong> has a room with us, a six-digit code is on its way.
            It expires in 20 minutes.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={emailedCode}
              onChange={(e) => { setEmailedCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(null); }}
              onKeyDown={(e) => e.key === "Enter" && void confirmReentry()}
              placeholder="123456"
              aria-label="The code from your email"
              maxLength={6}
              style={{
                flex: 1, minWidth: 160, padding: "12px 14px",
                border: "1px solid var(--rule-strong)", background: "var(--surface)",
                color: "var(--fg)", fontFamily: "var(--mono)", letterSpacing: ".18em", fontSize: 16,
              }}
            />
            <Button onClick={() => void confirmReentry()} disabled={status === "working" || emailedCode.length < 6}>
              {status === "working"
                ? <><Spinner size={14} color="currentColor" /> Signing in…</>
                : <>Sign in <span className="arr">→</span></>}
            </Button>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ marginTop: 12 }}
            onClick={() => { setSent(false); setEmailedCode(""); setError(null); }}
          >
            Use a different email
          </button>
        </div>
      )}

      {error && <p className="field-error" role="alert" style={{ marginTop: 16 }}>{error}</p>}

      <hr style={{ border: 0, borderTop: "1px solid var(--rule)", margin: "40px 0 28px", maxWidth: 460 }} />

      <h2 style={{ font: "500 20px/1.3 var(--serif)", marginBottom: 12 }}>
        Given a code at the counter?
      </h2>
      <p style={{ font: "400 15px/1.6 var(--serif)", color: "var(--fg-mute)", maxWidth: "52ch" }}>
        A shop code is added to a HueVista account, so sign in or create one first — it
        takes a moment and it means nobody but you can reach your rooms. Then come back
        here and enter the code.
      </p>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 20 }}>
        <Link className="btn btn-brass" href="/sign-in?next=/unlock">
          Sign in <span className="arr">→</span>
        </Link>
        <Link className="btn btn-ghost" href="/join?next=/unlock">
          Create an account
        </Link>
      </div>
    </div>
  );
}

/** The eight-character shop code box. */
function CodeBox({
  code, setCode, onSubmit, busy, invalid,
}: {
  code: string;
  setCode: (v: string) => void;
  onSubmit: () => void;
  busy: boolean;
  invalid: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", maxWidth: 460 }}>
      <input
        value={code}
        onChange={(e) => setCode(normalizeAccessCode(e.target.value))}
        onKeyDown={(e) => e.key === "Enter" && onSubmit()}
        placeholder="e.g. 7K2NQ9PX"
        aria-label="Access code"
        maxLength={ACCESS_CODE_LENGTH}
        spellCheck={false}
        aria-invalid={invalid ? "true" : undefined}
        style={{
          flex: 1,
          minWidth: 200,
          padding: "12px 14px",
          border: "1px solid var(--rule-strong)",
          background: "var(--surface)",
          color: "var(--fg)",
          fontFamily: "var(--mono)",
          letterSpacing: ".18em",
          fontSize: 16,
        }}
      />
      <Button onClick={onSubmit} disabled={busy || validateAccessCode(code) !== null}>
        {busy ? <><Spinner size={14} color="currentColor" /> Adding…</> : <>Add code <span className="arr">→</span></>}
      </Button>
    </div>
  );
}

/** The success screens, each pointing at the place the customer should go next. */
function DoneScreen({ result }: { result: Done }) {
  if (result.kind === "added") {
    return (
      <div style={{ textAlign: "center", padding: "40px 0" }}>
        <span aria-hidden style={{ fontSize: 44, color: "var(--accent)" }}>✓</span>
        <h1 className="display" style={{ fontSize: "clamp(40px, 5vw, 64px)", margin: "12px 0 16px" }}>
          Code <i>added.</i>
        </h1>
        <Lead style={{ maxWidth: "46ch", margin: "0 auto 28px" }}>
          {result.projects} project{result.projects === 1 ? "" : "s"}
          {result.shopName ? ` from ${result.shopName}` : ""} added to your account. Everything
          you&apos;d already made is still here — start a new room whenever you like.
        </Lead>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
          {/* Full reload: the nav and the dashboard banner both read the entitlement
              server-side, and it has just changed underneath them. */}
          <a className="btn btn-brass" href="/studio">Start a room <span className="arr">→</span></a>
          <a className="btn btn-ghost" href="/dashboard">Back to your dashboard</a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ textAlign: "center", padding: "40px 0" }}>
      <span aria-hidden style={{ fontSize: 44, color: "var(--accent)" }}>✓</span>
      <h1 className="display" style={{ fontSize: "clamp(40px, 5vw, 64px)", margin: "12px 0 16px" }}>
        Welcome <i>back.</i>
      </h1>
      <Lead style={{ maxWidth: "46ch", margin: "0 auto 28px" }}>
        You&apos;re signed in{result.name ? ` as ${result.name}` : ""}. Your room and the colours
        you chose are exactly where you left them.
      </Lead>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
        {/* Full reload so the app shell re-renders signed in. */}
        <a className="btn btn-brass" href="/my-projects">Open your rooms <span className="arr">→</span></a>
        <a className="btn btn-ghost" href="/studio">Start a new room</a>
      </div>
    </div>
  );
}
