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
 * <b>The counter has two halves, and they discount differently.</b> The PACKAGES — the
 * special offer, and the combo — carry their saving in the price on the ticket: "three for
 * the price of two", "cheaper than buying the two on their own". The SINGLES below them are
 * a plain price list, and they are what the percentage offers are for. A basket earns an
 * offer on its singles and the offer comes off its singles; the packages are rung up at the
 * price they are advertised at, on both sides of the wire.
 *
 * <b>Why they were separated.</b> Stacking HUE25 on "the third is on us" discounts one
 * basket twice at a rate nobody set — the package price stops meaning anything, and the
 * screen ends up quoting a saving against a list price that was itself a saving. Which half
 * the offers reach is the server's decision, not this screen's ({@code offersApplyToPackages}
 * on the catalogue), so a campaign that deliberately stacks them needs no change here.
 *
 * <b>The threshold moves with the discount, deliberately.</b> A basket of packages alone
 * does not creep past ₹289 and then take nothing off — "you have earned 10%, here is ₹0"
 * reads as a bug, and it would be one. One number earns the offer and receives it.
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
type LineId = "bundle" | "combo" | "project" | "credit";

interface Line {
  id: LineId;
  name: string;
  blurb: string;
  pricePaise: number;
}

export function CreditsCart({ onPurchased }: { onPurchased?: () => void }) {
  const [cart, setCart] = useState<CartCatalogue | null>(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState<Record<LineId, number>>({
    bundle: 0,
    combo: 0,
    project: 0,
    credit: 0,
  });
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

  /**
   * The special offer, or null when it is not running.
   *
   * Everything it needs is derived from the server's own figures — the price, what the
   * same contents cost line by line, and therefore the saving. Nothing here multiplies
   * the parts itself: a strike-through worked out on this screen would one day disagree
   * with the price beside it, and of the two numbers that is the one people check.
   */
  const bundle = useMemo(() => {
    if (!cart?.bundleAvailable) return null;
    const price = cart.bundlePricePaise ?? 0;
    const list = cart.bundleListPricePaise ?? 0;
    const projects = cart.bundleProjects ?? 0;
    const credits = cart.bundleCredits ?? 0;
    if (price <= 0 || list <= price || projects + credits === 0) return null;
    return { price, list, projects, credits, saving: list - price };
  }, [cart]);

  /**
   * The combo — the other package, and the one most people take.
   *
   * It sits with the special offer rather than at the head of the price list, because that
   * is what it is: a saving already taken off the ticket, not a line to be compared against
   * the two it is made of. Leaving it in the list also meant the list had to explain, line
   * by line, which of its rows the offers below did and did not reach — and a price list
   * that needs a footnote per row is a price list in the wrong order.
   */
  const combo = useMemo(() => {
    if (!cart || cart.comboPricePaise <= 0) return null;
    const projects = cart.comboProjects;
    const credits = cart.comboCredits;
    if (projects + credits === 0) return null;
    return {
      name: projects === 1 ? "Room + pictures" : `${projects} rooms + pictures`,
      blurb:
        `${projects} project and ${credits} AI image credit${credits === 1 ? "" : "s"} — `
        + "a room to paint, and the photographs of it at the end. Cheaper than buying the "
        + "two on their own.",
      price: cart.comboPricePaise,
      /** What the same contents cost line by line, so the saving is stated and not implied.
       *  Both figures are the server's own rates; only the multiplication is done here. */
      list: projects * cart.projectPricePaise + credits * cart.creditPricePaise,
      projects,
      credits,
    };
  }, [cart]);

  /** The plain price list: one of each thing, at the price of one of each thing. */
  const lines: Line[] = useMemo(() => {
    if (!cart) return [];
    return [
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

  /** The two halves of the basket, kept apart because they discount differently. */
  const singlesSubtotal = useMemo(
    () => lines.reduce((sum, line) => sum + line.pricePaise * qty[line.id], 0),
    [lines, qty],
  );
  const packagesSubtotal = useMemo(
    () => (combo?.price ?? 0) * qty.combo + (bundle?.price ?? 0) * qty.bundle,
    [combo, bundle, qty],
  );
  const subtotal = singlesSubtotal + packagesSubtotal;

  /**
   * What the percentage is measured against AND taken off — one number for both.
   *
   * The packages are outside it unless the server says otherwise, and the server saying
   * otherwise is a campaign setting rather than anything this screen decides. Using one
   * number for the threshold and the discount is what stops a basket of packages alone
   * lighting up "10% applied" and then taking ₹0 off it.
   */
  const discountBase = cart?.offersApplyToPackages ? subtotal : singlesSubtotal;

  /**
   * The offer this basket has earned, and the one it is next reaching for.
   *
   * Deliberately mirrors the server's rule — the best PERCENTAGE among the offers whose
   * threshold the DISCOUNT BASE has passed, with the tapped code preferred when it also
   * qualifies. The base is the singles half of the basket, not its total; see above. If the two ever disagree the server wins; this is the number the buyer reads
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
    const earned = offers.filter((o) => discountBase >= o.minSubtotalPaise);
    const chosen = earned.find((o) => o.code === code)
      ?? earned.reduce<(typeof earned)[number] | null>(
        (best, o) => (best === null || o.percentOff > best.percentOff ? o : best),
        null,
      );
    const upcoming = offers
      .filter((o) => discountBase < o.minSubtotalPaise)
      .sort((a, b) => a.minSubtotalPaise - b.minSubtotalPaise)[0] ?? null;
    return { applied: chosen ?? null, next: upcoming };
  }, [cart, discountBase, code]);

  const discount = applied ? Math.floor((discountBase * applied.percentOff) / 100) : 0;
  const total = subtotal - discount;
  const itemCount = qty.bundle + qty.combo + qty.project + qty.credit;

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
        bundles: qty.bundle,
        discountCode: code ?? undefined,
      });
      // null = the buyer closed Checkout. Not an error, and not a reason to say anything.
      if (fresh) {
        setCart(fresh);
        setQty({ bundle: 0, combo: 0, project: 0, credit: 0 });
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

      {/* ── Packages ──────────────────────────────────────────────────────────
          The two lines whose saving is already in their price, gathered under one heading
          and above the plain list. They are not things to compare against the price list —
          they are the price list, in the quantities people actually buy, with the discount
          taken off before it reaches the ticket. Which is exactly why the percentage offers
          further down do not touch them, and why that is said here rather than left to be
          discovered on the bill. */}
      {(bundle || combo) && (
        <p className="hv-cart-group">
          Packages
          <span className="hv-cart-group-note">
            {cart.offersApplyToPackages
              ? "Saving already included."
              : "Saving already included — the offers below apply to the single lines."}
          </span>
        </p>
      )}

      {/* The special offer, first among them and looking nothing like anything else on the
          screen. It is the one thing here somebody can decide in a second. */}
      {bundle && (
        <div className="hv-cart-special">
          <div className="hv-cart-special-text">
            <span className="hv-cart-special-flag">Special offer</span>
            <p className="hv-cart-special-name">
              {bundle.projects} projects &amp; {bundle.credits} AI image credits
            </p>
            <p className="hv-cart-special-blurb">
              For the price of two of each — the third room and the third picture are on us.
              A whole flat, or one room you want to see three ways.
            </p>
            <p className="hv-cart-special-price">
              <span className="hv-cart-special-now">{formatRupees(bundle.price)}</span>
              <s className="hv-cart-special-was">{formatRupees(bundle.list)}</s>
              <span className="hv-cart-special-save">
                Save {formatRupees(bundle.saving)}
              </span>
            </p>
          </div>
          <Stepper
            label="Special offer"
            value={qty.bundle}
            max={cart.maxQuantity}
            disabled={paying || stuck}
            onStep={(by) => step("bundle", by)}
          />
        </div>
      )}

      {/* The combo, in the same family as the offer above it and quieter than it: one is a
          whole flat, the other is the room most people start with. Its own saving is stated
          the same way the offer's is — a price, what it replaces, and the difference — so
          the two read as one shelf rather than as an offer and an odd line out. */}
      {combo && (
        <div className="hv-cart-special is-combo">
          <div className="hv-cart-special-text">
            <span className="hv-cart-tag">Most people start here</span>
            <p className="hv-cart-special-name">{combo.name}</p>
            <p className="hv-cart-special-blurb">{combo.blurb}</p>
            <p className="hv-cart-special-price">
              <span className="hv-cart-special-now">{formatRupees(combo.price)}</span>
              {combo.list > combo.price && (
                <>
                  <s className="hv-cart-special-was">{formatRupees(combo.list)}</s>
                  <span className="hv-cart-special-save">
                    Save {formatRupees(combo.list - combo.price)}
                  </span>
                </>
              )}
            </p>
          </div>
          <Stepper
            label={combo.name}
            value={qty.combo}
            max={cart.maxQuantity}
            disabled={paying || stuck}
            onStep={(by) => step("combo", by)}
          />
        </div>
      )}

      {/* ── On their own ──────────────────────────────────────────────────────
          The plain price list, and the half the percentage offers are for. */}
      <p className="hv-cart-group">
        On their own
        {!cart.offersApplyToPackages && cart.offers.length > 0 && (
          <span className="hv-cart-group-note">What the offers below come off.</span>
        )}
      </p>

      <ul className="hv-cart-lines">
        {lines.map((line) => (
          <li key={line.id} className="hv-cart-line">
            <div className="hv-cart-line-text">
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
          <p className="hv-cart-offers-title">
            {cart.offersApplyToPackages ? "Offers" : "Offers on the single lines"}
          </p>
          <div className="hv-cart-offers-row">
            {cart.offers.map((offer) => {
              const earned = discountBase >= offer.minSubtotalPaise;
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
                        : `Add ${formatRupees(offer.minSubtotalPaise - discountBase)} more`}
                  </span>
                </button>
              );
            })}
          </div>
          {next && itemCount > 0 && (
            <p className="hv-cart-nudge" aria-live="polite">
              Add {formatRupees(next.minSubtotalPaise - discountBase)} more
              {cart.offersApplyToPackages
                ? " to save "
                : " of single projects or credits to save "}
              {next.percentOff}%
              {cart.offersApplyToPackages ? " on the whole basket." : " on them."}
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
                {/* Named when it matters and silent when it does not. A basket with no
                    package in it has nothing to explain, and "off the single lines" on a
                    bill where every line is single is noise. */}
                {!cart.offersApplyToPackages && packagesSubtotal > 0
                  ? ` ${formatRupees(discountBase)} of single lines`
                  : ""}
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
        /* Not a card. This is the lower half of the page — at full width it ran to
           about 1,400px, and a rounded rectangle that tall is a section wearing a
           card's clothes. Every option inside it was then a card too, inside a card,
           inside a rail: four levels of the same border-radius-fill treatment, so
           nothing on the page could be more important than anything else. The shop
           is now a titled section, and the emphasis is spent once, on the offer. */
        .hv-cart {
          position: relative;
          /* A price list needs the price near the thing it prices. Stretched to the
             page's full 1120px, every row put its description on the left margin and
             its stepper on the right with a hand's width of nothing between them, so
             reading one line meant crossing the screen twice. */
          max-width: 760px;
        }
        .hv-cart-title {
          font: 600 26px/1.2 var(--serif); color: var(--fg); margin: 0; letter-spacing: -.015em;
        }
        .hv-cart-lead { font: 400 15px/1.65 var(--sans); color: var(--fg-soft); margin: 10px 0 0; max-width: 58ch; }

        /* ── The special offer ───────────────────────────────────────────────
           Deliberately the loudest thing on the panel and the only gradient on it.
           It is one decision, and the layout says so: no comparison, no small print,
           a price with what it replaces struck through beside it. */
        .hv-cart-special {
          position: relative; margin-top: 12px; padding: 20px;
          display: flex; gap: 18px; align-items: center; justify-content: space-between;
          flex-wrap: wrap;
          border: 1px solid var(--rule-brass); border-radius: calc(var(--radius) * 1.5);
          background:
            linear-gradient(135deg, rgba(192,139,78,.13), rgba(192,139,78,.03) 55%),
            var(--surface-soft);
        }
        .hv-cart-special-text { flex: 1 1 280px; min-width: 0; }
        /* Cream on --brass (#c08b4e) measured 2.69:1 — the one badge on the page
           that failed AA, and it is the label on the thing the page most wants
           read. --brass-deep clears it at 4.23; this is a touch deeper again so
           the small caps hold up at 10.5px, where AA's 4.5 is the honest bar. */
        .hv-cart-special-flag {
          display: inline-block; padding: 3px 10px; border-radius: var(--radius-pill);
          font: 600 10.5px/1.5 var(--sans); letter-spacing: .12em; text-transform: uppercase;
          color: var(--bg); background: #8a5f28;
        }
        .hv-cart-special-name {
          font: 600 19px/1.3 var(--serif); color: var(--fg); margin: 12px 0 0;
          letter-spacing: -.01em;
        }
        .hv-cart-special-blurb {
          font: 400 13.5px/1.6 var(--sans); color: var(--fg-soft); margin: 6px 0 0; max-width: 46ch;
        }
        .hv-cart-special-price {
          display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin: 14px 0 0;
        }
        .hv-cart-special-now { font: 600 22px/1.2 var(--sans); color: var(--fg); }
        .hv-cart-special-was { font: 400 14px/1.2 var(--sans); color: var(--fg-mute); }
        .hv-cart-special-save {
          padding: 3px 9px; border-radius: var(--radius-pill);
          font: 500 12px/1.5 var(--sans); color: var(--accent-text);
          border: 1px solid var(--rule-brass);
        }

        /* The two shelf headings. Small caps and a rule's worth of space, so the counter
           reads as two halves rather than as one list with an odd row at the top. */
        .hv-cart-group {
          display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;
          margin: 30px 0 0; padding-bottom: 4px;
          font: 500 11px/1.2 var(--sans); letter-spacing: .14em; text-transform: uppercase;
          color: var(--fg-mute);
        }
        .hv-cart-group-note {
          font: 400 12.5px/1.5 var(--sans); letter-spacing: 0; text-transform: none;
          color: var(--fg-mute);
        }
        /* The combo is the same row as the singles, marked. It used to be a second
           card in the offer's shape, which put two "pick me" blocks side by side and
           split the emphasis the offer above it was supposed to own. */
        .hv-cart-special.is-combo {
          margin-top: 4px; padding: 20px 0;
          border: none; border-top: 1px solid var(--rule-soft, var(--rule));
          border-radius: 0; background: none;
        }

        /* Rows on a ruled list, the way a price list is actually set. As bordered,
           filled, rounded boxes they read as four competing offers; the two of them
           are simply the two things sold on their own. */
        .hv-cart-lines { list-style: none; margin: 4px 0 0; padding: 0; display: block; }
        .hv-cart-line {
          display: flex; gap: 16px; align-items: center; justify-content: space-between;
          padding: 20px 0; border-top: 1px solid var(--rule-soft, var(--rule));
          background: none; flex-wrap: wrap;
        }
        .hv-cart-lines > .hv-cart-line:first-child { border-top: none; }
        .hv-cart-line-text { flex: 1 1 260px; min-width: 0; }
        .hv-cart-tag {
          display: inline-block; margin-bottom: 8px; padding: 2px 9px; border-radius: var(--radius-pill);
          font: 500 10.5px/1.6 var(--sans); letter-spacing: .1em; text-transform: uppercase;
          color: var(--accent-text); border: 1px solid var(--rule-brass); background: transparent;
        }
        .hv-cart-line-name { font: 600 16.5px/1.35 var(--sans); color: var(--fg); margin: 0; }
        .hv-cart-line-blurb { font: 400 13.5px/1.6 var(--sans); color: var(--fg-soft); margin: 5px 0 0; max-width: 52ch; }
        .hv-cart-line-price { font: 600 16px/1.3 var(--sans); color: var(--fg); margin: 10px 0 0; }

        .hv-cart-offers { margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--rule); }
        .hv-cart-offers-title { font: 500 11px/1.2 var(--sans); letter-spacing: .14em; text-transform: uppercase; color: var(--fg-mute); margin: 0 0 12px; }
        .hv-cart-offers-row { display: flex; gap: 10px; flex-wrap: wrap; }
        /* A dashed grey outline at 50% opacity is how this app draws a thing that is
           broken or switched off, and these are offers the customer has not reached
           yet — three of them side by side made the bottom of the shop look like a
           failed render. An unearned offer is now simply quiet and solid, and says
           what it is waiting for; the one in reach is drawn in the accent. */
        .hv-cart-offer {
          display: grid; gap: 3px; text-align: left; cursor: pointer;
          padding: 11px 15px; border: 1px solid var(--rule); border-radius: var(--radius);
          background: transparent; color: var(--fg);
          transition: border-color .25s var(--ease), background .25s var(--ease);
        }
        .hv-cart-offer:hover:not(:disabled) { background: var(--surface-soft); }
        .hv-cart-offer.is-on {
          border-color: var(--brass); background: var(--surface-soft);
        }
        .hv-cart-offer:not(.is-locked):not(.is-on) { border-color: var(--rule-brass); }
        .hv-cart-offer.is-locked { cursor: not-allowed; color: var(--fg-mute); }
        .hv-cart-offer.is-locked .hv-cart-offer-state { color: var(--fg-mute); }
        .hv-cart-offer-code { font: 600 13px/1.2 var(--mono, var(--sans)); letter-spacing: .06em; }
        .hv-cart-offer-terms { font: 400 12.5px/1.45 var(--sans); color: var(--fg-soft); }
        .hv-cart-offer-state { font: 500 11.5px/1.45 var(--sans); color: var(--accent-text); }
        .hv-cart-nudge { font: 400 13px/1.55 var(--sans); color: var(--fg-soft); margin: 12px 0 0; }

        /* The bill stays boxed — it is a receipt, and the one place on the page
           where a container means "these figures belong together and total below". */
        .hv-cart-bill {
          margin-top: 28px; padding: 18px 20px; display: grid; gap: 7px;
          border: 1px solid var(--rule); border-radius: var(--radius);
          background: var(--surface-soft);
        }
        .hv-cart-bill-row { display: flex; justify-content: space-between; gap: 16px; font: 400 14px/1.5 var(--sans); color: var(--fg-soft); margin: 0; }
        .hv-cart-bill-row.is-off { color: var(--accent-text); }
        .hv-cart-bill-row.is-total { font: 600 18px/1.4 var(--sans); color: var(--fg); padding-top: 9px; border-top: 1px solid var(--rule); }
        .hv-cart-bill-note { font: 400 12.5px/1.55 var(--sans); color: var(--fg-mute); margin: 3px 0 0; }
        .hv-cart-go { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; margin-top: 22px; }
        .hv-cart-fine { font: 400 12.5px/1.55 var(--sans); color: var(--fg-mute); }
        .hv-cart-note { font: 400 14px/1.55 var(--sans); color: var(--fg); margin: 16px 0 0; }
        .hv-cart-error { font: 400 14px/1.55 var(--sans); color: var(--danger, #b3261e); margin: 16px 0 0; }
        @media (max-width: 560px) {
          .hv-cart-title { font-size: 22px; }
          .hv-cart-line, .hv-cart-special { align-items: flex-start; }
        }
        @media (prefers-reduced-motion: reduce) {
          .hv-cart-line { transition: none; }
          .hv-cart-offer { transition: none; }
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
          border: 1px solid var(--rule-brass); border-radius: var(--radius-pill);
          background: var(--surface); overflow: hidden;
        }
        .hv-step-btn {
          width: 42px; height: 42px; border: 0; background: transparent; cursor: pointer;
          font: 400 19px/1 var(--sans); color: var(--accent-text);
          transition: background .2s var(--ease);
        }
        .hv-step-btn:hover:not(:disabled) { background: var(--surface-soft); }
        .hv-step-btn:disabled { opacity: .3; cursor: not-allowed; }
        .hv-step-value {
          min-width: 30px; text-align: center; font: 600 15px/1 var(--sans); color: var(--fg);
        }
        @media (prefers-reduced-motion: reduce) { .hv-step-btn { transition: none; } }
      `}</style>
    </span>
  );
}

/** "2 projects and 5 AI credits" — what the basket actually hands over, offers unpacked. */
function describeBasket(qty: Record<LineId, number>, cart: CartCatalogue): string {
  const projects = qty.project
    + qty.combo * cart.comboProjects
    + qty.bundle * (cart.bundleProjects ?? 0);
  const credits = qty.credit
    + qty.combo * cart.comboCredits
    + qty.bundle * (cart.bundleCredits ?? 0);
  const parts: string[] = [];
  if (projects > 0) parts.push(`${projects} project${projects === 1 ? "" : "s"}`);
  if (credits > 0) parts.push(`${credits} AI image credit${credits === 1 ? "" : "s"}`);
  return parts.join(" and ");
}
