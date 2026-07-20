"use client";

import { useState } from "react";
import Link from "next/link";
import { subscribeToPlan } from "@/lib/payments";
import { HttpError } from "@/lib/http-error";
import type { PurchasablePlan } from "@/lib/types";

interface Tier {
  name: string;
  monthlyN: number | null;
  lede: string;
  features: ReadonlyArray<string>;
  inherits?: string;
  note?: string;
  featured: boolean;
  ribbon?: string;
  /** Set on the directly-purchasable tiers; undefined for Enterprise (contact sales). */
  plan?: PurchasablePlan;
}

// Feature lists describe what ships TODAY. Anything still being built is
// labelled "coming soon" — a counter owner comparing tiers must never buy a
// line item that doesn't exist yet. (Annual billing, device limits and the
// paint quantity estimator were removed for exactly that reason.)
//
// The quota model behind the numbers: every image gets the compulsory AI photo
// clean-up, so IMAGES are the core allowance. After clean-up the shop chooses —
// AI wall detection (an "AI auto-mask", its own monthly allowance) or marking
// walls by hand (free and unlimited on every tier). Out of allowance mid-month?
// Extras cost ₹50 + GST per image / ₹25 + GST per auto-mask, paid from the
// prepaid wallet or directly. All prices +18% GST.
const TIERS: ReadonlyArray<Tier> = [
  { name: "Starter", plan: "STARTER", monthlyN: 999, lede: "For a single shop. Every photo professionally cleaned by AI, with a taste of automatic wall detection.", featured: false, features: ["20 images / month — AI photo clean-up on every one", "5 AI auto-masks / month (instant wall detection)", "Manual wall masking (click-to-segment) — unlimited", "25 colour-board PDFs / month (4 images each)", "Full multi-brand colour library & colour finder", "Link & WhatsApp share", "Customer access codes", "Email support"] },
  { name: "Professional", plan: "PROFESSIONAL", monthlyN: 2499, lede: "For busy shops. After the clean-up, let the AI detect walls for you — or mask by hand.", featured: true, ribbon: "Recommended", inherits: "Everything in Starter, plus", features: ["60 images / month — AI photo clean-up on every one", "40 AI auto-masks / month (instant wall detection)", "Per-wall recolouring", "100 colour-board PDFs / month (8 images each)", "AI colour palette suggestions", "Priority support"] },
  { name: "Business", plan: "BUSINESS", monthlyN: 4999, lede: "For multi-shop dealers who run several counters on one account.", featured: false, inherits: "Everything in Professional, plus", note: "White-label subdomain & painter portal are rolling out — Business shops get them first.", features: ["120 images / month — AI photo clean-up on every one", "90 AI auto-masks / month", "300 colour-board PDFs / month (12 images each)", "Multi-shop friendly quota", "White-label subdomain (coming soon)", "Painter portal (coming soon)", "Dedicated account manager"] },
  { name: "Enterprise", monthlyN: null, lede: "For manufacturers and large chains. SLA, dedicated catalogue ingestion, custom terms.", featured: false, inherits: "Everything in Business, plus", note: "Distributor commissions on request.", features: ["Unlimited images & AI auto-masks", "Unlimited colour-board PDFs (16 images each)", "Dedicated catalogue ingest", "SLA · 99.9%", "Named technical lead"] },
];

const GST_PERCENT = 18;

const inr = (n: number) => n.toLocaleString("en-IN");

/** Base ₹/mo -> "₹1,178.82" (price incl. 18% GST, trailing .00 trimmed). */
const inrWithGst = (base: number) => {
  const gross = (base * (100 + GST_PERCENT)) / 100;
  return gross.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
};

interface PricingTiersProps {
  /** Signed-in CUSTOMER accounts can't buy shop plans — swap the buy CTA for guidance. */
  isCustomer?: boolean;
}

export function PricingTiers({ isCustomer = false }: PricingTiersProps) {
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
          Billed monthly · cancel anytime · every new shop starts with a 14-day trial we set up for you.
        </span>
        <span style={{ font: "400 14px/1.5 var(--serif)", color: "var(--fg-soft)" }}>
          Prices exclude 18% GST. Every image includes the compulsory AI photo clean-up;
          manual wall masking is free and unlimited on all plans. Used your month&apos;s allowance?
          Top up your prepaid wallet and pay per use — ₹50 + GST per extra image, ₹25 + GST per
          extra AI auto-mask — or pay per item by UPI/card. Upgrades apply instantly from your dashboard.
        </span>
      </div>

      {isCustomer && (
        <div
          role="note"
          className="reveal d2"
          style={{ marginTop: 20, padding: "12px 16px", border: "1px solid var(--rule-strong)", background: "var(--surface-soft)", borderRadius: 8, font: "300 16px/1.5 var(--serif)", color: "var(--fg-soft)", maxWidth: 620 }}
        >
          These plans are for paint shops. Visualising your own room?{" "}
          <Link href="/redeem" style={{ color: "var(--accent-soft)" }}>Redeem the access code</Link>{" "}
          from your paint shop instead — it&apos;s free for you.
        </div>
      )}

      <section style={{ paddingTop: 60 }}>
        <div className="reveal r-cols-lg-2 r-cols-xs-1" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: "var(--rule)", border: "1px solid var(--rule)" }}>
          {TIERS.map((t) => (
            <div key={t.name} className={t.featured ? "hv-tier hv-tier--featured" : "hv-tier"} style={{ background: t.featured ? "var(--accent)" : "var(--charcoal-soft)", color: t.featured ? "#fff" : "var(--ivory)", padding: "56px 36px", display: "flex", flexDirection: "column", gap: 24, position: "relative" }}>
              {t.ribbon && (<span style={{ position: "absolute", top: 0, right: 24, background: "#fff", color: "var(--accent-deep)", font: "500 9px/1 var(--mono)", letterSpacing: ".28em", textTransform: "uppercase", padding: "8px 14px", transform: "translateY(-50%)" }}>{t.ribbon}</span>)}
              <div style={{ font: "400 11px/1 var(--mono)", letterSpacing: ".3em", textTransform: "uppercase", color: t.featured ? "rgba(255,255,255,.85)" : "var(--brass)" }}>{t.name}</div>
              <div style={{ minHeight: 84 }}>
                {t.monthlyN === null ? (
                  <>
                    <div style={{ font: "italic 600 40px/1.2 var(--serif)", letterSpacing: "-.02em", whiteSpace: "nowrap", color: t.featured ? "#fff" : "var(--ivory)" }}>On request</div>
                    <div style={{ marginTop: 8, font: "400 10px/1 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase", color: t.featured ? "rgba(255,255,255,.72)" : "var(--mute)" }}>custom commercial terms</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontFamily: "var(--serif)", fontWeight: 600, fontSize: 72, lineHeight: 1, letterSpacing: "-.025em", color: t.featured ? "#fff" : "var(--ivory)" }}>
                      ₹{inr(t.monthlyN)}
                      <span style={{ font: "400 18px/1 var(--serif)", color: t.featured ? "rgba(255,255,255,.72)" : "var(--mute)", marginLeft: 6 }}>/ month</span>
                    </div>
                    <div style={{ marginTop: 8, font: "400 10px/1.4 var(--mono)", letterSpacing: ".14em", textTransform: "uppercase", color: t.featured ? "rgba(255,255,255,.72)" : "var(--mute)" }}>
                      + {GST_PERCENT}% GST · ₹{inrWithGst(t.monthlyN)} all-in
                    </div>
                  </>
                )}
              </div>
              <p style={{ font: "400 17px/1.5 var(--serif)", color: t.featured ? "rgba(255,255,255,.85)" : "var(--ivory-soft)", borderTop: "1px solid " + (t.featured ? "rgba(255,255,255,.25)" : "var(--rule)"), paddingTop: 18 }}>{t.lede}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
                {t.inherits && (
                  <div style={{ font: "italic 400 14px/1.45 var(--serif)", color: t.featured ? "rgba(255,255,255,.72)" : "var(--mute)" }}>{t.inherits}</div>
                )}
                {t.features.map((f) => (
                  <div key={f} style={{ display: "flex", gap: 10, font: "300 15px/1.45 var(--sans)", color: t.featured ? "#fff" : "var(--ivory-soft)" }}>
                    <span aria-hidden style={{ color: t.featured ? "#fff" : "var(--brass)", fontFamily: "var(--mono)", fontSize: 12, lineHeight: "22px" }}>✓</span>
                    <span>{f}</span>
                  </div>
                ))}
                {t.note && (
                  <div style={{ font: "italic 400 13px/1.5 var(--serif)", color: t.featured ? "rgba(255,255,255,.72)" : "var(--mute)", marginTop: 4 }}>{t.note}</div>
                )}
              </div>
              <div style={{ marginTop: "auto" }}>
                {t.plan && !isCustomer ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => void handleBuy(t.plan!)}
                      disabled={busyPlan === t.plan}
                      className="btn"
                      style={t.featured ? { background: "#fff", color: "var(--accent-deep)", borderColor: "#fff" } : undefined}
                    >
                      {busyPlan === t.plan ? "Starting checkout…" : (<>Buy now <span className="arr">→</span></>)}
                    </button>
                    <Link
                      href="/trial"
                      className="btn btn-ghost"
                      style={t.featured ? { borderColor: "rgba(255,255,255,.55)", color: "#fff" } : undefined}
                    >
                      Request a trial account
                    </Link>
                  </div>
                ) : (
                  <Link
                    href={isCustomer ? "/redeem" : "/trial"}
                    className={t.featured ? "btn" : "btn btn-ghost"}
                    style={t.featured ? { background: "#fff", color: "var(--accent-deep)", borderColor: "#fff" } : undefined}
                  >
                    {isCustomer ? (<>Redeem a shop code <span className="arr">→</span></>) : (<>Talk to us <span className="arr">→</span></>)}
                  </Link>
                )}
                {payError && payError.plan === t.plan && (
                  <div className="field-error" role="alert" style={{ marginTop: 10 }}>
                    {payError.message}
                  </div>
                )}
                <div style={{ marginTop: 12, font: "400 10px/1.5 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase", color: "var(--mute-deep)" }}>
                  {t.monthlyN === null ? "We reply within an afternoon" : "Billed monthly · cancel anytime"}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
