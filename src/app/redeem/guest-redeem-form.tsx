"use client";

import { useState } from "react";
import Link from "next/link";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { redeemGuestAction } from "@/lib/auth";

/**
 * Public guest redemption. A walk-in customer enters the code from their shop
 * WITHOUT an account; on success we show the two ways to keep their work:
 * continue as a guest (history lives with the shop, gone when the code expires)
 * or sign in / create an account (history stays with them).
 */
export function GuestRedeemForm() {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "redeeming" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [shop, setShop] = useState<{ shopName: string; validDays: number } | null>(null);

  async function redeem() {
    const value = code.trim();
    if (!value) return;
    setStatus("redeeming");
    setError(null);
    const res = await redeemGuestAction(value);
    if ("error" in res) {
      setError(res.error);
      setStatus("idle");
      return;
    }
    setShop({ shopName: res.shopName, validDays: res.validDays });
    setStatus("done");
  }

  if (status === "done" && shop) {
    return (
      <div style={{ textAlign: "center", padding: "24px 0" }}>
        <span aria-hidden style={{ fontSize: 44, color: "var(--accent)" }}>✓</span>
        <h1 className="display" style={{ fontSize: "clamp(36px, 5vw, 60px)", margin: "12px 0 12px" }}>
          You&apos;re in.
        </h1>
        <Lead style={{ maxWidth: "46ch", margin: "0 auto 28px" }}>
          Code accepted{shop.shopName ? ` · ${shop.shopName}` : ""}. Your access lasts {shop.validDays}{" "}
          day{shop.validDays === 1 ? "" : "s"}. How would you like to keep your work?
        </Lead>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
          <Link className="btn btn-brass" href="/studio">
            Continue as a guest <span className="arr">→</span>
          </Link>
          <Link className="btn btn-ghost" href="/sign-in?next=/studio">
            Sign in to save your history <span className="arr">→</span>
          </Link>
        </div>
        <p style={{ font: "300 italic 14px/1.6 var(--serif)", color: "var(--fg-mute)", marginTop: 24, maxWidth: "52ch", marginInline: "auto" }}>
          As a guest, your room is saved with the shop — you&apos;ll see a single pickup code, and the shop reads
          the exact shades from it. Create a free account and your work stays with you for good.
        </p>
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
          Enter it below — no account needed. You&apos;ll get to visualise one room and pick your colours.
        </Lead>
      </header>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", maxWidth: 460 }}>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && void redeem()}
          placeholder="e.g. 7K2NQ9PX"
          aria-label="Access code"
          spellCheck={false}
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
        <Button onClick={() => void redeem()} disabled={status === "redeeming" || !code.trim()}>
          {status === "redeeming" ? <><Spinner size={14} color="currentColor" /> Redeeming…</> : <>Redeem <span className="arr">→</span></>}
        </Button>
      </div>

      {error && <div className="field-error" role="alert" style={{ marginTop: 16 }}>{error}</div>}

      <p style={{ font: "300 italic 14px/1.5 var(--serif)", color: "var(--fg-mute)", marginTop: 20, maxWidth: "48ch" }}>
        <Mono>Already have an account?</Mono>{" "}
        <Link href="/sign-in?next=/redeem" style={{ color: "var(--accent-soft)" }}>Sign in first</Link> to save
        everything to your profile.
      </p>
    </div>
  );
}
