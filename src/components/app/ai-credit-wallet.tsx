"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CountUp } from "@/components/ui/count-up";
import { api } from "@/lib/api";
import { formatRupees } from "@/lib/money";
import { buyAiCredits } from "@/lib/payments";
import { QUALITY_LABELS } from "@/lib/render-labels";
import type { AiCreditSummary, RenderQuality } from "@/lib/types";

/**
 * The AI image wallet: what is in it, what a credit costs, and how to buy more.
 *
 * <b>Why there is a second balance.</b> Points are a shop's loyalty currency — earned at a
 * kiosk, spendable only by a shop on shop things. This is the other kind: bought with money
 * and held by whoever wants the picture. After a shop hands a project to a customer, that
 * is the customer — an account that can hold no points and buy no plan, so without this
 * there is no way for them to pay for the image at all.
 *
 * <b>Some of them carry a date now.</b> A credit bought off the customer catalogue is good
 * for a year, which the cart says on the line; a credit sold to a shop still never expires,
 * exactly as it was sold. That is why the expiry line below is conditional rather than a
 * fixed sentence — the panel says "never expires" to nobody, and names a real date to the
 * people who have one.
 *
 * <b>It renders nothing when it cannot be used.</b> The backend answers `eligible: false`
 * for a painter or distributor, who own no projects and would have nothing to spend a
 * credit on, and the whole panel disappears rather than offering buttons that come back
 * 403. A failed fetch does the same: a wallet that cannot say what is in it is worse than
 * no wallet on the page.
 */

/** Top-up sizes. Small numbers, because most people are buying one picture. */
const QUICK_BUY = [1, 3, 5, 10];

/**
 * @param showBuy whether this panel sells credits as well as showing them.
 *
 * False on the customer's own Projects &amp; credits page, where the cart above it does the
 * selling. Two ways to buy the same thing on one screen — a quick-buy row and a basket —
 * is how a customer ends up with two prices in front of them and no idea which applies.
 * The BALANCE and the statement still belong there, so the panel stays; only the buttons go.
 */
/**
 * @param reloadKey bump it to refetch the balance.
 *
 * The panel is a counter, and a counter that only ever reads once is wrong the moment
 * something is bought elsewhere on the same screen — which on the customer's billing
 * page is the whole point of the screen. See {@code ProjectsAndCredits}.
 */
export function AiCreditWallet({
  compact = false,
  showBuy = true,
  reloadKey = 0,
}: {
  compact?: boolean;
  showBuy?: boolean;
  reloadKey?: number;
}) {
  const [wallet, setWallet] = useState<AiCreditSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.getAiCredits()
      .then((w) => !cancelled && setWallet(w))
      // 403 for an account that cannot hold credits, so a failure here is normal —
      // the panel simply does not appear.
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const purchase = useCallback(async (credits: number) => {
    setBuying(true);
    setError(null);
    setNotice(null);
    try {
      const fresh = await buyAiCredits(credits);
      // null = the buyer closed Checkout. Not an error, and not a reason to say anything.
      if (fresh) {
        setWallet(fresh);
        setNotice(
          `${credits} AI image credit${credits === 1 ? "" : "s"} added — ready to spend on any room.`,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the payment.");
    } finally {
      setBuying(false);
    }
  }, []);

  if (loading || !wallet || !wallet.eligible) return null;

  const discounted = wallet.discountPercent > 0 && wallet.listPricePaise > wallet.pricePaise;

  return (
    <section className={`hv-aiw${compact ? " is-compact" : ""}`} aria-labelledby="hv-aiw-title">
      <header className="hv-aiw-head">
        <h2 id="hv-aiw-title" className="hv-aiw-title">
          AI image credits
        </h2>
        {/* The balance is the answer somebody came here for, so it is set as a figure
            rather than as a line of the paragraph — large, quiet, and with the word that
            explains it beneath rather than beside, where it would compete. */}
        <p className="hv-aiw-balance" aria-live="polite">
          {/* Rolled up rather than printed, the same way the projects counter beside it
              is. CountUp renders the final value outright on the server and under
              reduced motion, so the balance is never a number somebody has to wait
              for — and aria-live still announces the value, not the count. */}
          <CountUp className="hv-aiw-balance-n" value={wallet.balance} />
          <span className="hv-aiw-balance-w">
            credit{wallet.balance === 1 ? "" : "s"}
          </span>
        </p>
      </header>

      <p className="hv-aiw-lead">
        One credit makes one AI image of your room — a real photograph of a combination from
        your colour boards. They work on any room.
        {tierNote(wallet)}
      </p>

      {/* When some of these lapse, and how many. Only for a wallet that actually holds
          dated credits — a shop's never expire, and inventing a date for them would be a
          promise nobody made. */}
      {wallet.soonestExpiryAt && (wallet.expiringCredits ?? 0) > 0 && (
        <p className="hv-aiw-expiry">
          {wallet.expiringCredits} of your credits are good until{" "}
          {new Date(wallet.soonestExpiryAt).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
          .
        </p>
      )}

      {showBuy && (
      <p className="hv-aiw-price">
        {discounted ? (
          <>
            <s>{formatRupees(wallet.listPricePaise)}</s>{" "}
            <strong>{formatRupees(wallet.pricePaise)}</strong> each
            <span className="hv-aiw-tag">{wallet.discountPercent}% off — launch offer</span>
          </>
        ) : (
          <>
            <strong>{formatRupees(wallet.pricePaise)}</strong> each
          </>
        )}
      </p>
      )}

      {showBuy && (
        <>
          <div className="hv-aiw-buy">
            {QUICK_BUY.filter((n) => n >= wallet.minPurchase && n <= wallet.maxPurchase).map((n) => (
              <Button
                key={n}
                variant={n === 1 ? "brass" : "ghost"}
                size="sm"
                disabled={buying}
                onClick={() => void purchase(n)}
              >
                {n} · {formatRupees(wallet.pricePaise * n)}
              </Button>
            ))}
          </div>
          <p className="hv-aiw-fine">
            {buying ? "Opening payment…" : "UPI / cards / netbanking"}
          </p>
        </>
      )}

      {notice && (
        <p className="hv-aiw-note" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="hv-aiw-error" role="alert">
          {error}
        </p>
      )}

      {/* The statement. Hidden while empty rather than shown as an empty table — a wallet
          nobody has spent from has nothing to account for. */}
      {!compact && wallet.recentActivity.length > 0 && (
        <ul className="hv-aiw-log">
          {wallet.recentActivity.slice(0, 6).map((row) => (
            <li key={row.id}>
              <span className={`hv-aiw-log-n${row.credits < 0 ? " is-out" : ""}`}>
                {row.credits > 0 ? "+" : ""}
                {row.credits}
              </span>
              <span className="hv-aiw-log-note">{row.note ?? label(row.type)}</span>
              <span className="hv-aiw-log-bal">{row.balanceAfter} left</span>
            </li>
          ))}
        </ul>
      )}

      <style>{`
        /* One card language across the customer's billing screens: a generous radius, a
           single wash of accent from one corner, and a lit hairline along the top edge.
           The panels differ in what they say and not in how they are built, which is what
           makes a page of three of them read as one thing. */
        .hv-aiw {
          position: relative; overflow: hidden;
          border: 1px solid var(--rule); border-radius: calc(var(--radius) * 1.8);
          background:
            radial-gradient(110% 80% at 0% 0%, rgba(192,139,78,.07), transparent 60%),
            var(--surface);
          padding: 30px; margin-top: 32px;
        }
        .hv-aiw::before {
          content: ""; position: absolute; inset: 0 0 auto; height: 1px;
          background: linear-gradient(90deg, transparent, var(--rule-brass), transparent);
        }
        .hv-aiw.is-compact { padding: 18px; margin-top: 0; border-radius: calc(var(--radius) * 1.4); }
        .hv-aiw-head { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
        .hv-aiw-title { font: 600 22px/1.25 var(--serif); color: var(--fg); margin: 0; letter-spacing: -.01em; }
        .hv-aiw-balance { display: flex; align-items: baseline; gap: 8px; margin: 0; }
        .hv-aiw-balance-n {
          font: 300 40px/1 var(--serif); color: var(--accent-text);
          letter-spacing: -.02em; font-variant-numeric: tabular-nums;
        }
        .hv-aiw-balance-w {
          font: 500 11px/1.5 var(--sans); letter-spacing: .14em; text-transform: uppercase;
          color: var(--fg-mute);
        }
        .hv-aiw-lead { font: 400 14.5px/1.7 var(--sans); color: var(--fg-soft); margin: 14px 0 0; max-width: 58ch; }
        .hv-aiw-price { font: 400 15px/1.45 var(--sans); color: var(--fg); margin: 16px 0 0; }
        .hv-aiw-expiry { font: 400 13px/1.55 var(--sans); color: var(--fg-mute); margin: 10px 0 0; }
        .hv-aiw-price s { color: var(--fg-mute); }
        .hv-aiw-tag {
          display: inline-block; margin-left: 10px; padding: 3px 10px; border-radius: var(--radius-pill);
          font: 500 11.5px/1.5 var(--sans); color: var(--accent-text);
          border: 1px solid var(--rule-brass); background: transparent;
        }
        .hv-aiw-buy { display: flex; flex-wrap: wrap; gap: 9px; margin-top: 18px; }
        .hv-aiw-fine { font: 400 12.5px/1.5 var(--sans); color: var(--fg-mute); margin: 12px 0 0; }
        .hv-aiw-note { font: 400 14px/1.55 var(--sans); color: var(--fg); margin: 14px 0 0; }
        .hv-aiw-error { font: 400 14px/1.55 var(--sans); color: var(--danger, #b3261e); margin: 14px 0 0; }
        .hv-aiw-log { list-style: none; margin: 22px 0 0; padding: 18px 0 0; border-top: 1px solid var(--rule); display: grid; gap: 11px; }
        .hv-aiw-log li { display: grid; grid-template-columns: 46px minmax(0, 1fr) auto; gap: 12px; align-items: baseline; }
        .hv-aiw-log-n { font: 600 14px/1.3 var(--sans); color: var(--accent-text); font-variant-numeric: tabular-nums; }
        .hv-aiw-log-n.is-out { color: var(--fg-mute); }
        .hv-aiw-log-note { font: 400 13.5px/1.5 var(--sans); color: var(--fg); overflow-wrap: anywhere; }
        .hv-aiw-log-bal { font: 400 12.5px/1.5 var(--sans); color: var(--fg-mute); white-space: nowrap; }
        @media (max-width: 560px) { .hv-aiw { padding: 20px; } }
      `}</style>
    </section>
  );
}

/**
 * What an image costs, in the wallet's own words.
 *
 * Reads the tiers off the server rather than naming them here, so a screen that has not
 * been redeployed still quotes whatever is actually being sold. Falls back to the single
 * render cost for an older backend that knows nothing about tiers.
 */
function tierNote(wallet: AiCreditSummary): string {
  const tiers = wallet.renderTiers ?? [];
  if (tiers.length > 1) {
    const parts = tiers.map((t) => {
      // The label a person says, falling back to the raw enum for a tier this build has
      // not heard of — a sentence reading "LUXURY is 2 credits" is odd, one with a gap
      // in it looks broken.
      const name = QUALITY_LABELS[t.quality as RenderQuality] ?? t.quality;
      return `${name} is ${t.credits} credit${t.credits === 1 ? "" : "s"}`;
    });
    return ` ${parts.join(", ")}.`;
  }
  return wallet.renderCost > 1 ? ` Each image costs ${wallet.renderCost} credits.` : "";
}

/** A fallback line for a movement the server sent no note with. */
function label(type: AiCreditSummary["recentActivity"][number]["type"]): string {
  switch (type) {
    case "PURCHASED":
      return "Credits bought";
    case "SPENT_ON_RENDER":
      return "1 AI image";
    case "RENDER_REFUNDED":
      return "Credit returned — the image could not be made";
    case "GRANTED":
      return "Given by HueVista";
    case "EXPIRED":
      return "Credits expired";
  }
}
