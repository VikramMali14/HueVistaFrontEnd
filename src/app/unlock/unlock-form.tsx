"use client";

import { useState } from "react";
import Link from "next/link";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/components/auth/logout-button";
import { Spinner } from "@/components/ui/spinner";
import { addCodeToAccountAction, unlockAccountAction } from "@/lib/auth";
import { ACCESS_CODE_LENGTH, normalizeAccessCode, validateAccessCode } from "@/lib/validation";
import type { UserRole } from "@/lib/types";

/** Who is holding this browser, resolved server-side by the page. Null = nobody. */
export interface SignedInAs {
  name: string;
  role: UserRole;
}

/** What happened, once a code has been accepted. */
type Done =
  /** A new passwordless customer account was created and signed in. */
  | { kind: "account"; name: string; shopName: string }
  /** The code was added to the account already signed in. */
  | { kind: "added"; shopName: string; projects: number }
  /** A guest code (kiosk purchase) was resumed — the room is in the guest studio. */
  | { kind: "guest"; shopName: string; validDays: number };

/** Plural, human name for a role, for the "you're signed in as…" refusal. */
const ROLE_NAMES: Partial<Record<UserRole, string>> = {
  RETAILER: "a shop",
  ADMIN: "an administrator",
  DISTRIBUTOR: "a distributor",
  PAINTER: "a painter",
};

/**
 * The shop-code box.
 *
 * It behaves differently depending on who is already signed in, because "redeem this
 * code" means three different things:
 *
 *  - Signed out → auto-create the customer's account (named by the shop) and sign in.
 *  - Signed in as a CUSTOMER → add the code to that account. It used to run the
 *    signed-out route, which signs the customer out and mints a SECOND account keyed
 *    to the new code — so following the app's own "unlock your projects" link lost
 *    them every project they had, in an account most of them have no password for.
 *  - Signed in as anything else → refuse. The backend will not flip a shop account to
 *    CUSTOMER, and the walk-in route would have quietly swapped the shop's own session
 *    for the customer's in the middle of a sale.
 */
export function UnlockForm({ signedInAs = null }: { signedInAs?: SignedInAs | null }) {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "unlocking" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Done | null>(null);

  const isCustomer = signedInAs?.role === "CUSTOMER";
  const wrongAccount = signedInAs !== null && !isCustomer;

  async function unlock() {
    const value = normalizeAccessCode(code);
    const invalid = validateAccessCode(value);
    if (invalid) {
      setError(invalid);
      return;
    }
    setStatus("unlocking");
    setError(null);

    // Signed-in customer: the code joins the account in hand. Nothing is signed out
    // and nothing they already made is left behind.
    if (isCustomer) {
      const res = await addCodeToAccountAction(value);
      if ("error" in res) {
        setError(res.error);
        setStatus("idle");
        return;
      }
      setResult({ kind: "added", shopName: res.shopName, projects: res.projects });
      setStatus("done");
      return;
    }

    const res = await unlockAccountAction(value);
    if ("error" in res) {
      setError(res.error);
      setStatus("idle");
      return;
    }
    setResult(
      "guest" in res
        ? { kind: "guest", shopName: res.shopName, validDays: res.validDays }
        : { kind: "account", name: res.name, shopName: res.shopName },
    );
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
            <strong>huevista.com/unlock</strong> in a private window and let them enter
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

  return (
    <div>
      <header style={{ marginBottom: 32 }}>
        <Eyebrow>Unlock · shop code</Eyebrow>
        <h1 className="display" style={{ fontSize: "clamp(40px, 5vw, 72px)", marginTop: 12 }}>
          Have a code from{" "}<br /><i>your paint shop?</i>
        </h1>
        <Lead style={{ marginTop: 20, maxWidth: "52ch" }}>
          {isCustomer
            ? "Enter it below and it joins this account — the rooms you've already made stay exactly where they are."
            : "Enter it below — no account, no password. We'll set you up and sign you straight in."}
        </Lead>
      </header>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", maxWidth: 460 }}>
        <input
          value={code}
          onChange={(e) => {
            setCode(normalizeAccessCode(e.target.value));
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && void unlock()}
          placeholder="e.g. 7K2NQ9PX"
          aria-label="Access code"
          maxLength={ACCESS_CODE_LENGTH}
          spellCheck={false}
          aria-invalid={error ? "true" : undefined}
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
        <Button onClick={() => void unlock()} disabled={status === "unlocking" || validateAccessCode(code) !== null}>
          {status === "unlocking" ? <><Spinner size={14} color="currentColor" /> Unlocking…</> : <>Unlock <span className="arr">→</span></>}
        </Button>
      </div>

      {error && <p className="field-error" role="alert" style={{ marginTop: 16 }}>{error}</p>}

      <p style={{ font: "400 14px/1.5 var(--serif)", color: "var(--fg-mute)", marginTop: 20, maxWidth: "52ch" }}>
        {isCustomer ? (
          <>
            You&apos;re signed in as {signedInAs.name}. The projects your shop assigned are
            added to the ones you already hold, and your access runs for as long as the new
            code lasts.
          </>
        ) : (
          <>
            Unlocking creates a customer account in your name and signs you in for as long as
            your shop&apos;s code lasts. Retailers don&apos;t need a code —{" "}
            <Link href="/sign-in" style={{ color: "var(--accent-soft)" }}>sign in here</Link>.
          </>
        )}
      </p>
    </div>
  );
}

/** The three success screens, each pointing at the place the customer should go next. */
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

  if (result.kind === "guest") {
    return (
      <div style={{ textAlign: "center", padding: "40px 0" }}>
        <span aria-hidden style={{ fontSize: 44, color: "var(--accent)" }}>✓</span>
        <h1 className="display" style={{ fontSize: "clamp(40px, 5vw, 64px)", margin: "12px 0 16px" }}>
          Welcome <i>back.</i>
        </h1>
        <Lead style={{ maxWidth: "46ch", margin: "0 auto 28px" }}>
          That code is already open{result.shopName ? ` at ${result.shopName}` : ""} — we&apos;ve
          picked your session back up on this device. Your room and the colours you chose are
          waiting, for {result.validDays} day{result.validDays === 1 ? "" : "s"} from when you
          started.
        </Lead>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
          <a className="btn btn-brass" href="/guest-studio">Open your room <span className="arr">→</span></a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ textAlign: "center", padding: "40px 0" }}>
      <span aria-hidden style={{ fontSize: 44, color: "var(--accent)" }}>✓</span>
      <h1 className="display" style={{ fontSize: "clamp(40px, 5vw, 64px)", margin: "12px 0 16px" }}>
        Welcome, {result.name.split(" ")[0]}.
      </h1>
      <Lead style={{ maxWidth: "46ch", margin: "0 auto 28px" }}>
        You&apos;re signed in{result.shopName ? ` as a customer of ${result.shopName}` : ""}. Your projects and
        the products your shop picked for you are ready — upload a room photo and start visualising.
      </Lead>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
        {/* Full reload so the app shell re-renders signed in as the new CUSTOMER. */}
        <a className="btn btn-brass" href="/dashboard">Go to your dashboard <span className="arr">→</span></a>
        <a className="btn btn-ghost" href="/assigned-products">See your products <span className="arr">→</span></a>
      </div>
    </div>
  );
}
