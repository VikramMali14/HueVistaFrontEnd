"use client";

import { useState } from "react";
import Link from "next/link";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { redeemAccountAction } from "@/lib/auth";
import { ACCESS_CODE_LENGTH, normalizeAccessCode, validateAccessCode } from "@/lib/validation";

/**
 * Public, no-login redemption. Entering the code auto-creates the customer's
 * account (named by the shop) and signs them in — no password, no sign-up. On
 * success we send them to their dashboard, where their assigned projects and
 * products are waiting.
 */
export function RedeemForm() {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "redeeming" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ name: string; shopName: string } | null>(null);

  async function redeem() {
    const value = normalizeAccessCode(code);
    const invalid = validateAccessCode(value);
    if (invalid) {
      setError(invalid);
      return;
    }
    setStatus("redeeming");
    setError(null);
    const res = await redeemAccountAction(value);
    if ("error" in res) {
      setError(res.error);
      setStatus("idle");
      return;
    }
    setResult(res);
    setStatus("done");
  }

  if (status === "done" && result) {
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

  return (
    <div>
      <header style={{ marginBottom: 32 }}>
        <Eyebrow>Redeem · access code</Eyebrow>
        <h1 className="display" style={{ fontSize: "clamp(40px, 5vw, 72px)", marginTop: 12 }}>
          Have a code from<br /><i>your paint shop?</i>
        </h1>
        <Lead style={{ marginTop: 20, maxWidth: "52ch" }}>
          Enter it below — no account, no password. We&apos;ll set you up and sign you straight in.
        </Lead>
      </header>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", maxWidth: 460 }}>
        <input
          value={code}
          onChange={(e) => {
            setCode(normalizeAccessCode(e.target.value));
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && void redeem()}
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
        <Button onClick={() => void redeem()} disabled={status === "redeeming" || validateAccessCode(code) !== null}>
          {status === "redeeming" ? <><Spinner size={14} color="currentColor" /> Redeeming…</> : <>Redeem <span className="arr">→</span></>}
        </Button>
      </div>

      {error && <p className="field-error" role="alert" style={{ marginTop: 16 }}>{error}</p>}

      <p style={{ font: "400 14px/1.5 var(--serif)", color: "var(--fg-mute)", marginTop: 20, maxWidth: "52ch" }}>
        Redeeming creates a customer account in your name and signs you in for the code&apos;s window
        (10 days). Already signed in as someone else? Redeeming logs you out first. Retailers don&apos;t
        need a code —{" "}
        <Link href="/sign-in" style={{ color: "var(--accent-soft)" }}>sign in here</Link>.
      </p>
    </div>
  );
}
