"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { formatRupees } from "@/lib/money";
import { buyAiCredits } from "@/lib/payments";
import type { AiCreditSummary } from "@/lib/types";

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
        <p className="hv-aiw-balance" aria-live="polite">
          {wallet.balance.toLocaleString("en-IN")}
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
        .hv-aiw {
          border: 1px solid var(--rule); border-radius: var(--radius);
          background: var(--surface); padding: 24px; margin-top: 32px;
        }
        .hv-aiw.is-compact { padding: 16px; margin-top: 0; }
        .hv-aiw-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
        .hv-aiw-title { font: 600 20px/1.2 var(--serif); color: var(--fg); margin: 0; }
        .hv-aiw-balance { font: 600 34px/1 var(--serif); color: var(--brass); margin: 0; }
        .hv-aiw-lead { font: 400 14px/1.6 var(--sans); color: var(--fg-soft); margin: 10px 0 0; max-width: 58ch; }
        .hv-aiw-price { font: 400 15px/1.4 var(--sans); color: var(--fg); margin: 14px 0 0; }
        .hv-aiw-expiry { font: 400 13px/1.5 var(--sans); color: var(--fg-mute); margin: 8px 0 0; }
        .hv-aiw-price s { color: var(--fg-soft); }
        .hv-aiw-tag {
          display: inline-block; margin-left: 10px; padding: 3px 9px; border-radius: 999px;
          font: 500 12px/1.2 var(--sans); color: var(--brass);
          border: 1px solid var(--brass); background: var(--surface-soft);
        }
        .hv-aiw-buy { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
        .hv-aiw-fine { font: 400 12px/1.4 var(--sans); color: var(--fg-soft); margin: 10px 0 0; }
        .hv-aiw-note { font: 400 14px/1.5 var(--sans); color: var(--fg); margin: 12px 0 0; }
        .hv-aiw-error { font: 400 14px/1.5 var(--sans); color: var(--danger, #b3261e); margin: 12px 0 0; }
        .hv-aiw-log { list-style: none; margin: 18px 0 0; padding: 14px 0 0; border-top: 1px solid var(--rule); display: grid; gap: 8px; }
        .hv-aiw-log li { display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; gap: 10px; align-items: baseline; }
        .hv-aiw-log-n { font: 600 14px/1.2 var(--sans); color: var(--brass); }
        .hv-aiw-log-n.is-out { color: var(--fg-soft); }
        .hv-aiw-log-note { font: 400 13px/1.4 var(--sans); color: var(--fg); overflow-wrap: anywhere; }
        .hv-aiw-log-bal { font: 400 12px/1.4 var(--sans); color: var(--fg-soft); white-space: nowrap; }
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
    return ` An image costs ${tiers.map((t) => `${t.credits} for ${t.quality.toLowerCase()}`).join(", ")}.`;
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
