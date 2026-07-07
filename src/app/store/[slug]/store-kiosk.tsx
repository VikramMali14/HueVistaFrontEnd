"use client";

import { useState } from "react";
import Link from "next/link";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { openStoreCheckout } from "@/lib/payments";
import { createStoreOrderAction, verifyStorePaymentAction } from "@/lib/store";
import { formatRupees } from "@/lib/money";
import type { StorePublicInfo } from "@/lib/types";

interface Done {
  code: string;
  shopName: string;
  validDays: number;
  amountPaise: number;
}

const STEPS = [
  "Pay here — card, UPI or scan the QR",
  "Upload one photo of your room",
  "Pick the colours you love",
  "Show your code at the counter",
] as const;

/**
 * The kiosk flow: one big price, one big button. Pay → Razorpay Checkout
 * (UPI/QR) → server-verified → the guest studio opens with a pickup code the
 * shop redeems later. Mirrors the /redeem guest flow but the payment IS the code.
 */
export function StoreKiosk({ info, hasGuestSession }: { info: StorePublicInfo; hasGuestSession: boolean }) {
  const [status, setStatus] = useState<"idle" | "paying" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [copied, setCopied] = useState(false);

  async function start() {
    setStatus("paying");
    setError(null);
    try {
      const order = await createStoreOrderAction(info.slug);
      if ("error" in order) {
        setError(order.error);
        setStatus("idle");
        return;
      }
      const paid = await openStoreCheckout(order, async (resp) => {
        const result = await verifyStorePaymentAction(info.slug, resp);
        if ("error" in result) throw new Error(result.error);
        setDone(result);
      });
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
        <span aria-hidden style={{ fontSize: 44, color: "var(--accent)" }}>✓</span>
        <h1 className="display" style={{ fontSize: "clamp(36px, 5vw, 56px)", margin: "12px 0" }}>
          Paid. You&apos;re in.
        </h1>
        <Lead style={{ maxWidth: "46ch", margin: "0 auto 24px" }}>
          {formatRupees(done.amountPaise)} received{done.shopName ? ` · ${done.shopName}` : ""}. This is your
          pickup code — <strong>save it or take a photo</strong>. The shop reads your chosen shades from it
          at the counter.
        </Lead>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 14, border: "1px solid var(--accent)", padding: "16px 22px", marginBottom: 28 }}>
          <span style={{ fontFamily: "var(--mono)", letterSpacing: ".22em", fontSize: 26, color: "var(--accent)" }}>
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
        <p style={{ font: "400 14px/1.6 var(--serif)", color: "var(--fg-mute)", marginTop: 20, maxWidth: "52ch", marginInline: "auto" }}>
          Your session lasts {done.validDays} day{done.validDays === 1 ? "" : "s"}. Lose the tab or switch
          phones? Enter this same code at huevista.com/redeem and your room comes back.
        </p>
      </div>
    );
  }

  return (
    <div>
      <header style={{ marginBottom: 32 }}>
        <Eyebrow>{info.shopName} · in-store studio</Eyebrow>
        <h1 className="display" style={{ fontSize: "clamp(40px, 6vw, 68px)", marginTop: 12 }}>
          See your room<br /><i>in new colours.</i>
        </h1>
        <Lead style={{ marginTop: 20, maxWidth: "52ch" }}>
          Order here like at a ticket machine: pay once, upload one photo of your room, and try this
          shop&apos;s colours on your own walls. No account needed.
        </Lead>
      </header>

      <ol style={{ listStyle: "none", padding: 0, margin: "0 0 32px", display: "grid", gap: 12 }}>
        {STEPS.map((step, i) => (
          <li key={step} style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span aria-hidden style={{ width: 28, height: 28, borderRadius: 999, border: "1px solid var(--rule-strong)", display: "inline-flex", alignItems: "center", justifyContent: "center", font: "500 12px/1 var(--mono)", color: "var(--accent)", flexShrink: 0 }}>
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
          <Mono>Online payment isn&apos;t available here — pay at the counter and the shop will give you a code
            to enter at huevista.com/redeem.</Mono>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          <Button onClick={() => void start()} disabled={status === "paying"}>
            {status === "paying"
              ? <><Spinner size={14} color="currentColor" /> Opening payment…</>
              : <>Pay {formatRupees(info.pricePaise)} &amp; start <span className="arr">→</span></>}
          </Button>
          <Mono>{formatRupees(info.pricePaise)} · one photo · valid {info.validDays} day{info.validDays === 1 ? "" : "s"}</Mono>
        </div>
      )}

      {error && <p className="field-error" role="alert" style={{ marginTop: 16 }}>{error}</p>}

      {hasGuestSession && (
        <p style={{ font: "400 14px/1.5 var(--serif)", color: "var(--fg-mute)", marginTop: 24 }}>
          Already paid on this device?{" "}
          <Link href="/studio" style={{ color: "var(--accent-soft)" }}>Continue in the studio →</Link>
        </p>
      )}
    </div>
  );
}
