"use client";

import { useState } from "react";
import Link from "next/link";
import { subscribeToPlan } from "@/lib/payments";
import { HttpError } from "@/lib/http-error";
import { FREE_PLAN_PROJECTS } from "@/lib/free-plan";
import type { PurchasablePlan } from "@/lib/types";

/**
 * One line in a tier's feature list. A plain string is the whole line; the
 * object form carries a `detail` shown on hover/focus, for the arithmetic and
 * the jargon that used to live in the line itself.
 */
type Feature = string | { text: string; detail: string };

interface Tier {
  name: string;
  monthlyN: number;
  lede: string;
  features: ReadonlyArray<Feature>;
  inherits?: string;
  note?: string;
  featured: boolean;
  ribbon?: string;
  /**
   * The plan checkout sells, or null for the free tier — which is granted with the
   * account and has nothing to charge for. A null here is what swaps the card's
   * "Buy now" for "Start free", so a ₹0 card can never grow a button whose only
   * possible answer is "there's nothing to pay".
   */
  plan: PurchasablePlan | null;
}

// Feature lists describe what ships TODAY. Anything still being built is
// labelled "coming soon" — a counter owner comparing tiers must never buy a
// line item that doesn't exist yet. (Annual billing, device limits and the
// paint quantity estimator were removed for exactly that reason.)
//
// The quota model behind the numbers: one PROJECT is one photograph turned into a
// recolour-ready scene, and it covers the whole automatic pipeline — the compulsory
// AI photo clean-up AND the AI wall detection. Marking walls by hand instead costs
// the same, because the project is what is charged, not the step. Out of allowance
// mid-month? Extras are bought one at a time at the tier's own rate — cheaper the
// bigger the plan — with points or by card.
//
// Quotas state the TOTAL, with the arithmetic behind it available on hover.
// Both extremes have been wrong here. A bare "45 projects" under "Everything in
// Starter, plus" was read as Starter's 15 AND another 45 — so the cards started
// printing "15 + 30 = 45 projects a month" instead, and then the maths was doing
// the copywriting: nobody deciding on a plan wants to solve a sum to find out
// what they get. The number a shop is buying is the number on the card; the
// derivation is a footnote, and is now written like one.
//
// Points are introduced on first use for the same reason. They appeared on the
// cards as a price ("60 points or ₹65") seven FAQ answers before anything said
// what a point was. The rupee price leads, and the detail explains the credit.
//
// Enterprise is deliberately absent. It was a card with no price, no checkout path and
// no tier behind it that a shop could actually be put on, so every question it raised
// ("what does unlimited cost?") had no answer. The backend does not serve it from
// /api/billing/plans either — the two must agree, or this page advertises a plan the
// subscription page cannot sell.
//
// Free IS served, and is a real card here. It is the plan every shop is on until it buys
// one and the plan it returns to if it stops paying, so leaving it off the comparison
// made the ladder start at ₹999 and the first question a shop asks ("what do I get for
// nothing?") go unanswered on the page built to answer it. Its card leads to /trial
// rather than to checkout, because there is nothing to charge.
const TIERS: ReadonlyArray<Tier> = [
  { name: "Free", plan: null, monthlyN: 0, lede: "For trying it at your own counter, and for staying. Two rooms a month, every month.", featured: false, features: [
    { text: "For paint shops only", detail: "The free plan is a SHOP plan — it comes with a shop account and the counter tools that go with it. A customer visualising their own room doesn't need it: the access code their paint shop hands them is already free for them, at /unlock." },
    `${FREE_PLAN_PROJECTS} projects a month — clean-up and walls included`,
    { text: "Renews every month, for as long as you keep the account", detail: "Not a trial with a deadline: the two projects come back on the same monthly cycle a paid plan runs on, and nothing expires if you don't use them." },
    { text: "Extra projects ₹99 each, or 80 points", detail: "Points are HueVista credit bought up front — they buy extras at a lower rate than paying by card. This is the dearest rate; every paid tier's is cheaper." },
    "Mark walls yourself as often as you like — no extra charge",
    "5 colour boards a month (4 photos each)",
    { text: "One paint company — Asian Paints, in full", detail: "Every shade, code and finish that company has, with the full search over it. The other companies your distributor has assigned you open on any paid plan." },
    "Send by link or WhatsApp",
    "Codes for your customers",
    { text: "No colour finder", detail: "Reading a photograph and answering with the nearest catalogue shade codes is on the paid tiers. It's the one tool that earns at the counter without a project behind it." },
  ] },
  { name: "Starter", plan: "STARTER", monthlyN: 999, lede: "For a single shop. Photos cleaned up and walls found for you on every project.", featured: false, inherits: "Everything in Free, plus", features: [
    "15 projects a month — clean-up and walls included",
    { text: "Every paint company your distributor has assigned you", detail: "The free plan carries one company. From Starter up, the whole catalogue your distributor gave you is in the studio, the colour finder and the codes you issue." },
    { text: "Extra projects ₹65 each, or 60 points", detail: "Points are HueVista credit bought up front — they buy extras at a lower rate than paying by card." },
    { text: "Colour finder — read any photo, get the shade codes", detail: "The tool the free plan doesn't carry: point at a wall in a photograph and get the nearest codes from your catalogue." },
    "25 colour boards a month (4 photos each)",
    "Email support",
  ] },
  { name: "Professional", plan: "PROFESSIONAL", monthlyN: 2499, lede: "For busy shops. Three times the projects, and extras cost less.", featured: true, ribbon: "Recommended", inherits: "Everything in Starter, plus", features: [
    { text: "45 projects a month", detail: "Starter's 15 plus 30 more on this plan — 45 in total, not 15 and another 45." },
    { text: "Extra projects ₹55 each, or 50 points", detail: "Points are HueVista credit bought up front — they buy extras at a lower rate than paying by card." },
    "Paint each wall its own colour",
    { text: "100 colour boards a month (8 photos each)", detail: "Starter's 25 plus 75 more on this plan — 100 in total." },
    "Colour scheme suggestions",
    "Priority support",
  ] },
  { name: "Business", plan: "BUSINESS", monthlyN: 4999, lede: "For dealers running more than one counter on one account.", featured: false, inherits: "Everything in Professional, plus", note: "Your own web address and the painter portal are on the way — Business shops get them first.", features: [
    { text: "100 projects a month", detail: "Professional's 45 plus 55 more on this plan — 100 in total." },
    { text: "Extra projects ₹45 each, or 40 points — the lowest rate", detail: "Points are HueVista credit bought up front — they buy extras at a lower rate than paying by card." },
    { text: "300 colour boards a month (12 photos each)", detail: "Professional's 100 plus 200 more on this plan — 300 in total." },
    "Project allowance that suits several counters",
    "Your own web address (coming soon)",
    "Painter portal (coming soon)",
    "A named person to call",
  ] },
];

const inr = (n: number) => n.toLocaleString("en-IN");

interface PricingTiersProps {
  /** Signed-in CUSTOMER accounts can't buy shop plans — swap the buy CTA for guidance. */
  isCustomer?: boolean;
  /**
   * Somebody is signed in.
   *
   * The free card's CTA is a signup link, and signup is now closed to anyone
   * already holding an account — so for them it would be a button that bounces
   * straight back to the home page. They already have the plan it is offering;
   * the useful destination is their own dashboard.
   */
  signedIn?: boolean;
}

export function PricingTiers({ isCustomer = false, signedIn = false }: PricingTiersProps) {
  const [busyPlan, setBusyPlan] = useState<PurchasablePlan | null>(null);
  const [payError, setPayError] = useState<{ plan: PurchasablePlan; message: string } | null>(null);

  // "Buy now": create a Razorpay subscription, pay in the in-app Checkout, then land
  // on the dashboard with the plan already active. Not signed in (401) → route to
  // sign-in and come back to pricing to continue. Closing Checkout re-enables the button.
  async function handleBuy(plan: PurchasablePlan) {
    setPayError(null);
    setBusyPlan(plan);
    try {
      const paid = await subscribeToPlan(plan);
      if (paid) {
        window.location.assign("/dashboard?subscribed=1");
        return; // keep the button busy through navigation
      }
      setBusyPlan(null); // buyer dismissed the checkout
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) {
        window.location.assign(`/sign-in?next=${encodeURIComponent("/pricing")}`);
        return;
      }
      setPayError({ plan, message: e instanceof Error ? e.message : "Could not start checkout." });
      setBusyPlan(null);
    }
  }

  return (
    <>
      <div className="reveal d2" style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ font: "400 16px/1.4 var(--serif)", color: "var(--fg-soft)" }}>
          Billed monthly · cancel any time · every shop has the free plan, no card asked for.
        </span>
        <span style={{ font: "400 14px/1.5 var(--serif)", color: "var(--fg-soft)" }}>
          One project is one photo turned into a room you can paint, and it covers the
          clean-up and finding the walls together — there is no second allowance to run
          out of. Used up the month&apos;s projects? Buy more one at a time at your
          plan&apos;s rate: 80 points or ₹99 on Free, 60 or ₹65 on Starter, down to 40 or
          ₹45 on Business. Or wait — the month turns over and the allowance comes back, on
          the free plan as much as on a paid one. Upgrade any time and whatever you had
          left comes with you.
        </span>
      </div>

      {isCustomer && (
        <div
          role="note"
          className="reveal d2"
          style={{ marginTop: 20, padding: "12px 16px", border: "1px solid var(--rule-strong)", background: "var(--surface-soft)", borderRadius: 8, font: "300 16px/1.5 var(--serif)", color: "var(--fg-soft)", maxWidth: 620 }}
        >
          These plans are for paint shops. Visualising your own room?{" "}
          <Link href="/unlock" style={{ color: "var(--accent-soft)" }}>Unlock with the access code</Link>{" "}
          from your paint shop instead — it&apos;s free for you.
        </div>
      )}

      <section style={{ paddingTop: 60 }}>
        {/* Four columns now Free is one of them. It drops to two at the lg breakpoint
            and one below that, same as before — a 4-up row of these cards is unreadable
            on anything narrower than a desktop. */}
        <div className="reveal r-cols-lg-2 r-cols-xs-1" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: "var(--rule)", border: "1px solid var(--rule)" }}>
          {TIERS.map((t) => {
            // Pulled out of the JSX so the null check narrows inside the click handler
            // too — a property read would widen straight back to `PurchasablePlan | null`
            // the moment it crossed into a closure.
            const plan = t.plan;
            return (
            <div key={t.name} className={t.featured ? "hv-tier hv-tier--featured" : "hv-tier"} style={{ background: t.featured ? "var(--accent-deep)" : "var(--charcoal-soft)", color: t.featured ? "#fff" : "var(--ivory)", padding: "56px 36px", display: "flex", flexDirection: "column", gap: 24, position: "relative" }}>
              {t.ribbon && (<span style={{ position: "absolute", top: 0, right: 24, background: "#fff", color: "var(--accent-deep)", font: "500 12px/1 var(--mono)", letterSpacing: ".28em", textTransform: "uppercase", padding: "8px 14px", transform: "translateY(-50%)" }}>{t.ribbon}</span>)}
              <div style={{ font: "400 12px/1 var(--mono)", letterSpacing: ".3em", textTransform: "uppercase", color: t.featured ? "rgba(255,255,255,.85)" : "var(--brass)" }}>{t.name}</div>
              <div style={{ minHeight: 84 }}>
                <div style={{ fontFamily: "var(--serif)", fontWeight: 600, fontSize: 72, lineHeight: 1, letterSpacing: "-.025em", color: t.featured ? "#fff" : "var(--ivory)" }}>
                  {/* "₹0 / month" reads like an invoice for nothing. The free card says
                      the word instead, and keeps the same type size so the row of prices
                      still scans as one ladder. */}
                  {plan === null ? "Free" : `₹${inr(t.monthlyN)}`}
                  <span style={{ font: "400 18px/1 var(--serif)", color: t.featured ? "rgba(255,255,255,.88)" : "var(--tier-ink-soft)", marginLeft: 6 }}>
                    {/* Who the plan is FOR, not how long it lasts. "For good" answered a
                        question nobody was asking — the one people do ask about a ₹0 card
                        is who is allowed on it, and the answer is: a paint shop. A walk-in
                        customer is free too, but through their shop's access code, not
                        here. The renewal promise moves to the line below, which was
                        already about the billing terms. */}
                    {plan === null ? "for paint shops" : "/ month"}
                  </span>
                </div>
                <div style={{ marginTop: 8, font: "400 12px/1.4 var(--mono)", letterSpacing: ".14em", textTransform: "uppercase", color: t.featured ? "rgba(255,255,255,.88)" : "var(--tier-ink-soft)" }}>
                  {plan === null ? "No card · renews every month, for good" : "Billed monthly · cancel anytime"}
                </div>
              </div>
              <p style={{ font: "400 17px/1.5 var(--serif)", color: t.featured ? "rgba(255,255,255,.85)" : "var(--ivory-soft)", borderTop: "1px solid " + (t.featured ? "rgba(255,255,255,.25)" : "var(--rule)"), paddingTop: 18 }}>{t.lede}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
                {t.inherits && (
                  <div style={{ font: "italic 400 14px/1.45 var(--serif)", color: t.featured ? "rgba(255,255,255,.88)" : "var(--tier-ink-soft)" }}>{t.inherits}</div>
                )}
                {t.features.map((f) => {
                  const text = typeof f === "string" ? f : f.text;
                  const detail = typeof f === "string" ? null : f.detail;
                  return (
                    <div key={text} style={{ display: "flex", gap: 10, font: "300 15px/1.45 var(--sans)", color: t.featured ? "#fff" : "var(--ivory-soft)" }}>
                      <span aria-hidden style={{ color: t.featured ? "#fff" : "var(--brass)", fontFamily: "var(--mono)", fontSize: 12, lineHeight: "22px" }}>✓</span>
                      {detail ? (
                        // The derivation (and what a "point" is) sits behind a
                        // dotted underline rather than inside the sentence, so
                        // the card states what you get and the footnote stays a
                        // footnote. tabIndex makes it reachable without a mouse.
                        <span className="hv-tier-detail" title={detail} tabIndex={0}>{text}</span>
                      ) : (
                        <span>{text}</span>
                      )}
                    </div>
                  );
                })}
                {t.note && (
                  <div style={{ font: "italic 400 13px/1.5 var(--serif)", color: t.featured ? "rgba(255,255,255,.88)" : "var(--tier-ink-soft)", marginTop: 4 }}>{t.note}</div>
                )}
              </div>
              <div style={{ marginTop: "auto" }}>
                {!isCustomer ? (
                  plan === null ? (
                    // Nothing to charge, so nothing to check out. The free card's only
                    // action is the one that gets you the account the plan comes with —
                    // or, for somebody who already has one, the account itself.
                    <Link href={signedIn ? "/dashboard" : "/trial"} className="btn">
                      {signedIn ? "Go to your dashboard" : "Start free"} <span className="arr">→</span>
                    </Link>
                  ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => void handleBuy(plan)}
                      disabled={busyPlan === plan}
                      className="btn"
                      style={t.featured ? { background: "#fff", color: "var(--accent-deep)", borderColor: "#fff" } : undefined}
                    >
                      {busyPlan === plan ? "Starting checkout…" : (<>Buy now <span className="arr">→</span></>)}
                    </button>
                    {/* The paid cards' second way out: take the free plan for now.
                        It is a signup link, so it has nothing to offer somebody who
                        is already signed in — they are on the free plan already, and
                        signup would bounce them back to the home page. */}
                    {!signedIn && (
                      <Link
                        href="/trial"
                        className="btn btn-ghost"
                        style={t.featured ? { borderColor: "rgba(255,255,255,.55)", color: "#fff" } : undefined}
                      >
                        Start free instead
                      </Link>
                    )}
                  </div>
                  )
                ) : (
                  <Link
                    href="/unlock"
                    className={t.featured ? "btn" : "btn btn-ghost"}
                    style={t.featured ? { background: "#fff", color: "var(--accent-deep)", borderColor: "#fff" } : undefined}
                  >
                    Unlock with a shop code <span className="arr">→</span>
                  </Link>
                )}
                {payError && payError.plan === plan && (
                  <div className="field-error" role="alert" style={{ marginTop: 10 }}>
                    {payError.message}
                  </div>
                )}
                <div style={{ marginTop: 12, font: "400 12px/1.5 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase", color: "var(--tier-ink-soft)" }}>
                  {plan === null ? "Free forever · no card" : "Billed monthly · cancel anytime"}
                </div>
              </div>
            </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
