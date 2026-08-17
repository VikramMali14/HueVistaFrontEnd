"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { formatRupees } from "@/lib/money";
import { checkoutCart, PaymentVerificationError } from "@/lib/payments";
import type { CartCatalogue } from "@/lib/types";

/**
 * The customer's counter: pick quantities, apply an offer, pay once.
 *
 * <b>Why a basket replaced the buttons.</b> Everything a customer could buy used to be a
 * single item behind a single button — one project, or one AI credit, each opening its own
 * payment sheet. That is the wrong shape for the person it is aimed at: somebody doing up
 * two rooms wants two rooms and four pictures, and the old flow made them pay six times
 * while taking no notice of the fact that they had. A basket puts the size of the order in
 * front of both sides, which is the only reason an offer at ₹289 can exist.
 *
 * <b>The arithmetic here is a courtesy, not the price.</b> Every figure on this screen is
 * the server's own rate multiplied by a quantity, and the server prices the order again
 * when Checkout opens. That matters for the offers in particular: the code is a preference,
 * and the server works out the best offer the basket has actually earned whatever this
 * screen sends — so a code that has not been reached takes nothing off rather than being
 * silently honoured.
 *
 * <b>It renders nothing when it cannot be used.</b> The backend answers `eligible: false`
 * for a shop (which buys at its plan's rate) and for accounts that own no projects, and the
 * whole counter disappears rather than offering buttons that can only come back 403.
 */

/** A line on the counter, in the order it is shown. */
type LineId = "combo" | "project" | "credit";

interface Line {
  id: LineId;
  name: string;
  blurb: string;
  pricePaise: number;
  /** The badge over the recommended line. Only the combo has one. */
  tag?: string;
}

export function CreditsCart({ onPurchased }: { onPurchased?: () => void }) {
  const [cart, setCart] = useState<CartCatalogue | null>(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState<Record<LineId, number>>({ combo: 0, project: 0, credit: 0 });
  /** The offer the buyer tapped. The server still decides what it is worth. */
  const [code, setCode] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** A failed verification means the money has already left — see PaymentVerificationError.
   *  It has to stop the Pay button rather than sit beside a live one. */
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.getCart()
      .then((c) => !cancelled && setCart(c))
      // 403 for an account this counter is not for. Normal, and the panel simply
      // does not appear.
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const lines: Line[] = useMemo(() => {
    if (!cart) return [];
    const credits = cart.comboCredits;
    const projects = cart.comboProjects;
    return [
      {
        id: "combo",
        name: projects === 1 ? "Room + pictures" : `${projects} rooms + pictures`,
        blurb:
          `${projects} project and ${credits} AI image credit${credits === 1 ? "" : "s"} — `
          + "a room to paint, and the photographs of it at the end. Cheaper than buying the "
          + "two on their own.",
        pricePaise: cart.comboPricePaise,
        tag: "Most people start here",
      },
      {
        id: "project",
        name: "One project",
        blurb:
          "One room: your photo, its walls marked, every colour you try, and the colour "
          + "board at the end.",
        pricePaise: cart.projectPricePaise,
      },
      {
        id: "credit",
        name: "One AI image credit",
        blurb:
          "One photorealistic picture of your room in colours you have chosen. Spendable on "
          + "any room, at any time.",
        pricePaise: cart.creditPricePaise,
      },
    ];
  }, [cart]);

  const subtotal = useMemo(
    () => lines.reduce((sum, line) => sum + line.pricePaise * qty[line.id], 0),
    [lines, qty],
  );

  /**
   * The offer this basket has earned, and the one it is next reaching for.
   *
   * Deliberately mirrors the server's rule — the best PERCENTAGE among the offers whose
   * threshold the subtotal has passed, with the tapped code preferred when it also
   * qualifies. If the two ever disagree the server wins; this is the number the buyer reads
   * before pressing Pay, so being wrong here is worse than being absent.
   *
   * <b>The best one is already on before anything is tapped.</b> The server applies it
   * whatever this screen sends, so showing it as un-applied until somebody notices the
   * strip would mean quoting a total higher than the one they are then charged — a cart
   * that lies in the customer's favour is still a cart that lies. Tapping picks BETWEEN
   * offers, which is a real choice once a basket has earned more than one; it is not a
   * switch that turns the discount off, and there is no state in which pressing a chip
   * makes the bill go up by itself.
   */
  const { applied, next } = useMemo(() => {
    const offers = cart?.offers ?? [];
    const earned = offers.filter((o) => subtotal >= o.minSubtotalPaise);
    const chosen = earned.find((o) => o.code === code)
      ?? earned.reduce<(typeof earned)[number] | null>(
        (best, o) => (best === null || o.percentOff > best.percentOff ? o : best),
        null,
      );
    const upcoming = offers
      .filter((o) => subtotal < o.minSubtotalPaise)
      .sort((a, b) => a.minSubtotalPaise - b.minSubtotalPaise)[0] ?? null;
    return { applied: chosen ?? null, next: upcoming };
  }, [cart, subtotal, code]);

  const discount = applied ? Math.floor((subtotal * applied.percentOff) / 100) : 0;
  const total = subtotal - discount;
  const itemCount = qty.combo + qty.project + qty.credit;

  const step = useCallback(
    (id: LineId, by: number) => {
      const max = cart?.maxQuantity ?? 20;
      setQty((prev) => ({ ...prev, [id]: Math.min(max, Math.max(0, prev[id] + by)) }));
      setNotice(null);
    },
    [cart],
  );

  const pay = useCallback(async () => {
    if (itemCount === 0 || paying || stuck) return;
    setPaying(true);
    setError(null);
    setNotice(null);
    try {
      const fresh = await checkoutCart({
        projects: qty.project,
        credits: qty.credit,
        combos: qty.combo,
        discountCode: code ?? undefined,
      });
      // null = the buyer closed Checkout. Not an error, and not a reason to say anything.
      if (fresh) {
        setCart(fresh);
        setQty({ combo: 0, project: 0, credit: 0 });
        setCode(null);
        setNotice(
          "Paid — your projects and credits are on your account, and both are good for a year.",
        );
        onPurchased?.();
      }
    } catch (e) {
      if (e instanceof PaymentVerificationError) {
        setStuck(true);
        setError(
          `${e.message} Your payment went through — do not pay again. Reload this page in a `
          + "minute, and write to us if it still hasn't appeared.",
        );
      } else {
        setError(e instanceof Error ? e.message : "Could not start the payment.");
      }
    } finally {
      setPaying(false);
    }
  }, [itemCount, paying, stuck, qty, code, onPurchased]);

  if (loading || !cart || !cart.eligible) return null;

  const years = Math.round(cart.validDays / 365);
  const validity = cart.validDays === 365 || years === 1
    ? "a year"
    : `${cart.validDays} days`;

  return (
    <section className="hv-cart" aria-labelledby="hv-cart-title">
      <header className="hv-cart-head">
        <h2 id="hv-cart-title" className="hv-cart-title">
          Buy projects &amp; credits
        </h2>
        <p className="hv-cart-lead">
          Add what you need and pay once. Everything you buy here is good for {validity} from
          the day it lands.
        </p>
      </header>

      <ul className="hv-cart-lines">
        {lines.map((line) => (
          <li key={line.id} className="hv-cart-line">
            <div className="hv-cart-line-text">
              {line.tag && <span className="hv-cart-tag">{line.tag}</span>}
              <p className="hv-cart-line-name">{line.name}</p>
              <p className="hv-cart-line-blurb">{line.blurb}</p>
              <p className="hv-cart-line-price">{formatRupees(line.pricePaise)}</p>
            </div>
            <Stepper
              label={line.name}
              value={qty[line.id]}
              max={cart.maxQuantity}
              disabled={paying || stuck}
              onStep={(by) => step(line.id, by)}
            />
          </li>
        ))}
      </ul>

      {/* The offers. Shown as a strip you tap rather than a box you type into: every code
          here is one we are already offering, so making somebody remember and re-type it
          would be a quiz with one answer. The box stays honest about what is NOT yet
          earned, because "spend ₹52 more and save ₹59" is the useful half. */}
      {cart.offers.length > 0 && (
        <div className="hv-cart-offers">
          <p className="hv-cart-offers-title">Offers</p>
          <div className="hv-cart-offers-row">
            {cart.offers.map((offer) => {
              const earned = subtotal >= offer.minSubtotalPaise;
              const on = applied?.code === offer.code;
              return (
                <button
                  key={offer.code}
                  type="button"
                  className={`hv-cart-offer${on ? " is-on" : ""}${earned ? "" : " is-locked"}`}
                  disabled={!earned || paying || stuck}
                  aria-pressed={on}
                  onClick={() => setCode(offer.code)}
                >
                  <span className="hv-cart-offer-code">{offer.code}</span>
                  <span className="hv-cart-offer-terms">
                    {offer.percentOff}% off over {formatRupees(offer.minSubtotalPaise)}
                  </span>
                  <span className="hv-cart-offer-state">
                    {on
                      ? "Applied"
                      : earned
                        ? "Tap to use this one"
                        : `Add ${formatRupees(offer.minSubtotalPaise - subtotal)} more`}
                  </span>
                </button>
              );
            })}
          </div>
          {next && itemCount > 0 && (
            <p className="hv-cart-nudge" aria-live="polite">
              Add {formatRupees(next.minSubtotalPaise - subtotal)} more to save{" "}
              {next.percentOff}% on the whole basket.
            </p>
          )}
        </div>
      )}

      {/* The bill. Only once there is something in the basket — an empty one with a row of
          zeroes reads as a form to fill in rather than a counter to buy from. */}
      {itemCount > 0 && (
        <div className="hv-cart-bill" aria-live="polite">
          <p className="hv-cart-bill-row">
            <span>Item total</span>
            <span>{formatRupees(subtotal)}</span>
          </p>
          {applied && (
            <p className="hv-cart-bill-row is-off">
              <span>
                {applied.code} · {applied.percentOff}% off
              </span>
              <span>−{formatRupees(discount)}</span>
            </p>
          )}
          <p className="hv-cart-bill-row is-total">
            <span>To pay</span>
            <span>{formatRupees(total)}</span>
          </p>
          <p className="hv-cart-bill-note">
            {describeBasket(qty, cart)} · valid for {validity}
          </p>
        </div>
      )}

      <div className="hv-cart-go">
        <button
          type="button"
          className="btn btn-brass"
          disabled={itemCount === 0 || paying || stuck}
          onClick={() => void pay()}
        >
          {paying ? (
            <>
              <Spinner size={12} color="currentColor" /> Opening payment…
            </>
          ) : itemCount === 0 ? (
            "Add something to your basket"
          ) : (
            `Pay ${formatRupees(total)}`
          )}
        </button>
        <span className="hv-cart-fine">
          UPI / cards / netbanking · you hold {cart.availableProjects} project
          {cart.availableProjects === 1 ? "" : "s"} and {cart.creditBalance} credit
          {cart.creditBalance === 1 ? "" : "s"} right now
        </span>
      </div>

      {notice && (
        <p className="hv-cart-note" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="hv-cart-error" role="alert">
          {error}
        </p>
      )}

      <style>{`
        .hv-cart {
          border: 1px solid var(--rule); border-radius: var(--radius);
          background: var(--surface); padding: 24px;
        }
        .hv-cart-title { font: 600 20px/1.2 var(--serif); color: var(--fg); margin: 0; }
        .hv-cart-lead { font: 400 14px/1.6 var(--sans); color: var(--fg-soft); margin: 8px 0 0; max-width: 58ch; }
        .hv-cart-lines { list-style: none; margin: 20px 0 0; padding: 0; display: grid; gap: 14px; }
        .hv-cart-line {
          display: flex; gap: 16px; align-items: center; justify-content: space-between;
          padding: 14px; border: 1px solid var(--rule); border-radius: var(--radius);
          background: var(--surface-soft); flex-wrap: wrap;
        }
        .hv-cart-line-text { flex: 1 1 260px; min-width: 0; }
        .hv-cart-tag {
          display: inline-block; margin-bottom: 6px; padding: 2px 8px; border-radius: 999px;
          font: 500 11px/1.4 var(--sans); color: var(--brass);
          border: 1px solid var(--brass); background: var(--surface);
        }
        .hv-cart-line-name { font: 600 16px/1.3 var(--sans); color: var(--fg); margin: 0; }
        .hv-cart-line-blurb { font: 400 13.5px/1.55 var(--sans); color: var(--fg-soft); margin: 4px 0 0; max-width: 52ch; }
        .hv-cart-line-price { font: 600 15px/1.3 var(--sans); color: var(--fg); margin: 8px 0 0; }
        .hv-cart-offers { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--rule); }
        .hv-cart-offers-title { font: 500 13px/1.2 var(--sans); letter-spacing: .08em; text-transform: uppercase; color: var(--fg-mute); margin: 0 0 10px; }
        .hv-cart-offers-row { display: flex; gap: 10px; flex-wrap: wrap; }
        .hv-cart-offer {
          display: grid; gap: 2px; text-align: left; cursor: pointer;
          padding: 10px 14px; border: 1px dashed var(--rule); border-radius: var(--radius);
          background: var(--surface-soft); color: var(--fg);
        }
        .hv-cart-offer.is-on { border-style: solid; border-color: var(--brass); box-shadow: inset 0 0 0 1px var(--brass); }
        .hv-cart-offer.is-locked { opacity: .55; cursor: not-allowed; }
        .hv-cart-offer-code { font: 600 13px/1.2 var(--mono, var(--sans)); letter-spacing: .06em; }
        .hv-cart-offer-terms { font: 400 12.5px/1.4 var(--sans); color: var(--fg-soft); }
        .hv-cart-offer-state { font: 500 11.5px/1.4 var(--sans); color: var(--brass); }
        .hv-cart-nudge { font: 400 13px/1.5 var(--sans); color: var(--fg-soft); margin: 10px 0 0; }
        .hv-cart-bill { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--rule); display: grid; gap: 6px; }
        .hv-cart-bill-row { display: flex; justify-content: space-between; gap: 16px; font: 400 14px/1.5 var(--sans); color: var(--fg-soft); margin: 0; }
        .hv-cart-bill-row.is-off { color: var(--brass); }
        .hv-cart-bill-row.is-total { font: 600 17px/1.4 var(--sans); color: var(--fg); padding-top: 6px; border-top: 1px solid var(--rule); }
        .hv-cart-bill-note { font: 400 12.5px/1.5 var(--sans); color: var(--fg-mute); margin: 2px 0 0; }
        .hv-cart-go { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; margin-top: 20px; }
        .hv-cart-fine { font: 400 12.5px/1.5 var(--sans); color: var(--fg-mute); }
        .hv-cart-note { font: 400 14px/1.5 var(--sans); color: var(--fg); margin: 14px 0 0; }
        .hv-cart-error { font: 400 14px/1.5 var(--sans); color: var(--danger, #b3261e); margin: 14px 0 0; }
        @media (max-width: 560px) {
          .hv-cart { padding: 18px; }
          .hv-cart-line { align-items: flex-start; }
        }
      `}</style>
    </section>
  );
}

/**
 * The − 0 + control.
 *
 * A quantity that starts at zero and grows in taps, rather than a number field: this is a
 * counter on a phone, and the two things somebody does here are "one more" and "one fewer".
 * A free-text field would also let a quantity be typed that the server then refuses, which
 * is a worse way to learn about the twenty-per-line limit than a plus button that stops.
 */
function Stepper({
  label,
  value,
  max,
  disabled,
  onStep,
}: {
  label: string;
  value: number;
  max: number;
  disabled: boolean;
  onStep: (by: number) => void;
}) {
  return (
    <span className="hv-step" role="group" aria-label={`Quantity of ${label}`}>
      <button
        type="button"
        className="hv-step-btn"
        onClick={() => onStep(-1)}
        disabled={disabled || value === 0}
        aria-label={`One fewer ${label}`}
      >
        −
      </button>
      {/* aria-live so a screen reader hears the new quantity, which is the only feedback
          a stepper gives. */}
      <output className="hv-step-value" aria-live="polite">
        {value}
      </output>
      <button
        type="button"
        className="hv-step-btn"
        onClick={() => onStep(1)}
        disabled={disabled || value >= max}
        aria-label={`One more ${label}`}
      >
        +
      </button>
      <style>{`
        .hv-step {
          display: inline-flex; align-items: center; gap: 2px;
          border: 1px solid var(--brass); border-radius: var(--radius); overflow: hidden;
        }
        .hv-step-btn {
          width: 40px; height: 40px; border: 0; background: transparent; cursor: pointer;
          font: 500 18px/1 var(--sans); color: var(--brass);
        }
        .hv-step-btn:disabled { opacity: .35; cursor: not-allowed; }
        .hv-step-value {
          min-width: 34px; text-align: center; font: 600 15px/1 var(--sans); color: var(--fg);
        }
      `}</style>
    </span>
  );
}

/** "2 projects and 5 AI credits" — what the basket actually hands over, combos unpacked. */
function describeBasket(qty: Record<LineId, number>, cart: CartCatalogue): string {
  const projects = qty.project + qty.combo * cart.comboProjects;
  const credits = qty.credit + qty.combo * cart.comboCredits;
  const parts: string[] = [];
  if (projects > 0) parts.push(`${projects} project${projects === 1 ? "" : "s"}`);
  if (credits > 0) parts.push(`${credits} AI image credit${credits === 1 ? "" : "s"}`);
  return parts.join(" and ");
}
