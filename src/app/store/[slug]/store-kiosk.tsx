"use client";

import { useState } from "react";
import Link from "next/link";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { ShadeAccuracyNote } from "@/components/shared/accuracy-note";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { openStoreCheckout } from "@/lib/payments";
import {
  createStoreOrderAction,
  reportStoreCheckoutEventAction,
  verifyStorePaymentAction,
} from "@/lib/store";
import { formatRupees } from "@/lib/money";
import type { StorePublicInfo } from "@/lib/types";

interface Done {
  code: string;
  shopName: string;
  validDays: number;
  amountPaise: number;
  accountEmail?: string | null;
  /** Whether there is still an unclaimed account to offer to move. */
  claimable: boolean;
}

const STEPS = [
  "Pay here — card, UPI or scan the QR",
  "Upload one photo of your room",
  "Pick the colours you love",
  "Show your code at the counter",
] as const;

/** Good enough to catch a fumbled address at a counter; the backend decides for real. */
function emailLooksWrong(value: string): string | null {
  const v = value.trim();
  if (!v) return "Enter your email so we can send your room and your receipt.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "That doesn't look like an email address.";
  return null;
}

/**
 * The kiosk flow: one big price, one big button. Pay → Razorpay Checkout (UPI/QR) →
 * server-verified → an account opens and the studio is already theirs.
 *
 * <p>The email box is the load-bearing part of this screen, and it comes BEFORE the
 * payment on purpose. It is how the customer gets back to what they bought — the
 * printed code is what the SHOP reads to mix the paint, not a password. Asking
 * afterwards would mean asking someone who already has what they came for, standing at
 * a counter, with a queue behind them.
 */
export function StoreKiosk({ info, signedIn }: { info: StorePublicInfo; signedIn: boolean }) {
  const [status, setStatus] = useState<"idle" | "paying" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);

  async function start() {
    const invalid = emailLooksWrong(email);
    if (invalid) {
      setEmailError(invalid);
      return;
    }
    setEmailError(null);
    setStatus("paying");
    setError(null);
    try {
      const order = await createStoreOrderAction(info.slug);
      if ("error" in order) {
        setError(order.error);
        setStatus("idle");
        return;
      }
      const paid = await openStoreCheckout(
        order,
        async (resp) => {
          const result = await verifyStorePaymentAction(info.slug, {
            ...resp,
            email: email.trim(),
            name: name.trim() || undefined,
          });
          if ("error" in result) throw new Error(result.error);
          setDone(result);
        },
        // The kiosk reports through a server action, not the BFF: a walk-in has no
        // session to authenticate with until after they have paid.
        reportStoreCheckoutEventAction,
        { email: email.trim(), name: name.trim() || undefined },
      );
      setStatus(paid ? "done" : "idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The payment could not be completed. Please try again.");
      setStatus("idle");
    }
  }

  function copyCode(code: string) {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }).catch(() => {});
  }

  if (status === "done" && done) {
    return (
      <div style={{ textAlign: "center" }}>
        <span aria-hidden style={{ fontSize: 44, color: "var(--accent-text)" }}>✓</span>
        <h1 className="display" style={{ fontSize: "clamp(36px, 5vw, 56px)", margin: "12px 0" }}>
          Paid. You&apos;re in.
        </h1>
        <Lead style={{ maxWidth: "46ch", margin: "0 auto 24px" }}>
          {formatRupees(done.amountPaise)} received{done.shopName ? ` · ${done.shopName}` : ""}. This is your
          pickup code — <strong>show it at the counter</strong> and the shop will mix the shades you chose.
        </Lead>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 14, border: "1px solid var(--accent)", padding: "16px 22px", marginBottom: 28 }}>
          <span style={{ fontFamily: "var(--mono)", letterSpacing: ".22em", fontSize: 26, color: "var(--accent-text)" }}>
            {done.code}
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => copyCode(done.code)}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <div>
          <Link className="btn btn-brass" href="/studio">
            Upload your room photo <span className="arr">→</span>
          </Link>
        </div>

        {done.accountEmail ? (
          <p style={{ font: "400 14px/1.6 var(--serif)", color: "var(--fg-mute)", marginTop: 20, maxWidth: "52ch", marginInline: "auto" }}>
            Your room is saved to <strong>{done.accountEmail}</strong>, and your receipt is on its way there.
            Close the tab or change phones? Come back and ask for a sign-in code — we&apos;ll email you one.
          </p>
        ) : (
          // No address means this browser session is the only way back. Say so plainly
          // rather than letting them discover it on a different phone tomorrow.
          <p style={{ font: "400 14px/1.6 var(--serif)", color: "var(--fg-mute)", marginTop: 20, maxWidth: "52ch", marginInline: "auto" }}>
            We don&apos;t have an email for you, so this browser is the only way back to your room.
            Add an email in your account settings to be able to sign in from anywhere.
          </p>
        )}

        {done.claimable && (
          <p style={{ font: "400 14px/1.6 var(--serif)", color: "var(--fg-mute)", marginTop: 16, maxWidth: "52ch", marginInline: "auto" }}>
            Already have a HueVista account?{" "}
            <Link href="/sign-in?next=/my-projects" style={{ color: "var(--accent-text)" }}>
              Sign in and we&apos;ll move this room onto it →
            </Link>
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <header style={{ marginBottom: 32 }}>
        <Eyebrow>{info.shopName} · in-store studio</Eyebrow>
        <h1 className="display" style={{ fontSize: "clamp(40px, 6vw, 68px)", marginTop: 12 }}>
          See your room{" "}<br /><i>in new colours.</i>
        </h1>
        <Lead style={{ marginTop: 20, maxWidth: "52ch" }}>
          Pay once, upload one photo of your room, and try this shop&apos;s colours on your own
          walls. No sign-up form — we make your account for you.
        </Lead>
        {/* Before they pay, not after. This is a stranger about to hand over money
            for a picture of their own room, with no account and nobody to ask. */}
        <ShadeAccuracyNote both style={{ marginTop: 18 }} />
      </header>

      <ol style={{ listStyle: "none", padding: 0, margin: "0 0 32px", display: "grid", gap: 12 }}>
        {STEPS.map((step, i) => (
          <li key={step} style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span aria-hidden style={{ width: 28, height: 28, borderRadius: 999, border: "1px solid var(--rule-strong)", display: "inline-flex", alignItems: "center", justifyContent: "center", font: "500 12px/1 var(--mono)", color: "var(--accent-text)", flexShrink: 0 }}>
              {i + 1}
            </span>
            <span style={{ font: "400 16px/1.5 var(--serif)", color: "var(--fg-soft)" }}>{step}</span>
          </li>
        ))}
      </ol>

      {!info.active ? (
        <div style={{ border: "1px solid var(--rule)", padding: "18px 22px", maxWidth: 460 }}>
          <Mono>This kiosk is paused right now — please ask at the counter.</Mono>
        </div>
      ) : !info.paymentsConfigured ? (
        <div style={{ border: "1px solid var(--rule)", padding: "18px 22px", maxWidth: 460 }}>
          <Mono>Online payment isn&apos;t available here — pay at the counter and the shop will set you up.</Mono>
        </div>
      ) : (
        <div style={{ maxWidth: 460 }}>
          <div style={{ display: "grid", gap: 12, marginBottom: 18 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ font: "400 14px/1.4 var(--serif)", color: "var(--fg-soft)" }}>
                Your email
              </span>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                className="input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError(null); }}
                aria-invalid={Boolean(emailError)}
                disabled={status === "paying"}
              />
              <span style={{ font: "400 13px/1.5 var(--serif)", color: "var(--fg-mute)" }}>
                Your receipt goes here, and it&apos;s how you get back to your room from any phone.
              </span>
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ font: "400 14px/1.4 var(--serif)", color: "var(--fg-soft)" }}>
                Your name <span style={{ color: "var(--fg-mute)" }}>(optional)</span>
              </span>
              <input
                type="text"
                autoComplete="name"
                className="input"
                placeholder="Priya"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={status === "paying"}
              />
            </label>
            {emailError && <p className="field-error" role="alert">{emailError}</p>}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
            <Button onClick={() => void start()} disabled={status === "paying"}>
              {status === "paying"
                ? <><Spinner size={14} color="currentColor" /> Opening payment…</>
                : <>Pay {formatRupees(info.pricePaise)} &amp; start <span className="arr">→</span></>}
            </Button>
            <Mono>{formatRupees(info.pricePaise)} · one photo</Mono>
          </div>
        </div>
      )}

      {error && <p className="field-error" role="alert" style={{ marginTop: 16 }}>{error}</p>}

      <p style={{ font: "400 14px/1.5 var(--serif)", color: "var(--fg-mute)", marginTop: 24 }}>
        {signedIn ? (
          <>Already paid on this device?{" "}
            <Link href="/studio" style={{ color: "var(--accent-text)" }}>Continue in the studio →</Link></>
        ) : (
          <>Bought here before?{" "}
            <Link href="/unlock" style={{ color: "var(--accent-text)" }}>Get a sign-in code by email →</Link></>
        )}
      </p>
    </div>
  );
}
