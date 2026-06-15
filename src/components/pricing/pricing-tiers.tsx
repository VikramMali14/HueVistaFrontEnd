"use client";

import { useState } from "react";
import Link from "next/link";

interface Tier {
  name: string;
  monthlyN: number | null;
  annualN: number | null;
  lede: string;
  features: ReadonlyArray<string>;
  inherits?: string;
  note?: string;
  featured: boolean;
  ribbon?: string;
  ctaLabel: string;
}

const TIERS: ReadonlyArray<Tier> = [
  { name: "Starter", monthlyN: 499, annualN: 4990, lede: "For a single shop. The studio, the full colour library, and easy sharing with customers.", featured: false, features: ["20 AI previews / month", "Full Asian Paints colour library", "WhatsApp & link share", "1 device", "Email support"], ctaLabel: "Try it free" },
  { name: "Professional", monthlyN: 999, annualN: 9990, lede: "For busy shops. Automatic wall detection, per-wall recolouring, and paint quantity estimates.", featured: true, ribbon: "Recommended", inherits: "Everything in Starter, plus", features: ["60 AI previews / month", "Per-wall recolouring", "Manual wall selection", "Paint quantity estimator", "3 devices", "Priority support"], ctaLabel: "Try it free" },
  { name: "Business", monthlyN: 1999, annualN: 19990, lede: "For multi-shop dealers. Your own branded subdomain, your palette, your name on it.", featured: false, inherits: "Everything in Professional, plus", note: "White-label activation ₹1,499 one-time.", features: ["150 AI previews / month", "White-label subdomain", "Custom palette & wordmark", "10 devices", "Painter portal (beta)", "Dedicated account manager"], ctaLabel: "Try it free" },
  { name: "Enterprise", monthlyN: null, annualN: null, lede: "For manufacturers and large chains. SLA, API access, dedicated catalogue ingestion.", featured: false, inherits: "Everything in Business, plus", note: "Distributor commissions on request.", features: ["Unlimited AI previews", "API & SDK access", "Dedicated catalogue ingest", "SLA · 99.9%", "Unlimited devices", "Named technical lead"], ctaLabel: "Talk to us" },
];

const inr = (n: number) => n.toLocaleString("en-IN");
const MAX_SAVED = Math.max(...TIERS.filter((t) => t.monthlyN !== null && t.annualN !== null).map((t) => t.monthlyN! * 12 - t.annualN!));

export function PricingTiers() {
  const [period, setPeriod] = useState<"monthly" | "annual">("monthly");
  return (
    <>
      <div className="reveal d2" style={{ marginTop: 32, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
        <div style={{ display: "inline-flex", border: "1px solid var(--rule-strong)", background: "var(--charcoal-soft)" }}>
          {(["monthly", "annual"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              aria-pressed={period === p}
              style={{
                padding: "12px 22px",
                background: period === p ? "var(--ivory)" : "transparent",
                color: period === p ? "var(--charcoal)" : "var(--ivory-soft)",
                border: "none",
                font: "400 10px/1 var(--mono)",
                letterSpacing: ".26em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              {/* Literal metallic — keeps the accent legible on the charcoal toggle plate. */}
              {p === "monthly" ? "Monthly" : (
                <>Annual <span style={{ color: period === p ? "var(--brass-deep)" : "#b89968" }}>· 2 months free</span></>
              )}
            </button>
          ))}
        </div>
        <span style={{ font: "400 16px/1 var(--serif)", color: "var(--fg-soft)" }}>
          Fourteen days · no card · cancel quietly.
        </span>
        {period === "annual" && (
          <span className="hv-price-swap" style={{ font: "400 10px/1 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase", color: "var(--brass)" }}>
            Up to ₹{inr(MAX_SAVED)} saved per year
          </span>
        )}
      </div>

      <section style={{ paddingTop: 60 }}>
        <div className="reveal r-cols-lg-2 r-cols-xs-1" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: "var(--rule)", border: "1px solid var(--rule)" }}>
          {TIERS.map((t) => (
            <div key={t.name} className={t.featured ? "hv-tier hv-tier--featured" : "hv-tier"} style={{ background: t.featured ? "var(--ivory)" : "var(--charcoal-soft)", color: t.featured ? "var(--charcoal)" : "var(--ivory)", padding: "56px 36px", display: "flex", flexDirection: "column", gap: 24, position: "relative" }}>
              {t.ribbon && (<span style={{ position: "absolute", top: 0, right: 24, background: "#b89968", color: "#15110d", font: "500 9px/1 var(--mono)", letterSpacing: ".28em", textTransform: "uppercase", padding: "8px 14px", transform: "translateY(-50%)" }}>{t.ribbon}</span>)}
              <div style={{ font: "400 11px/1 var(--mono)", letterSpacing: ".3em", textTransform: "uppercase", color: t.featured ? "var(--brass-deep)" : "var(--brass)" }}>{t.name}</div>
              {/* Tall enough for the two-line annual state — no jump on toggle. */}
              <div key={period} className="hv-price-swap" style={{ minHeight: 104 }}>
                {t.monthlyN === null || t.annualN === null ? (
                  <>
                    <div style={{ font: "italic 600 40px/1.2 var(--serif)", letterSpacing: "-.02em", whiteSpace: "nowrap", color: t.featured ? "var(--charcoal)" : "var(--ivory)" }}>On request</div>
                    <div style={{ marginTop: 8, font: "400 10px/1 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase", color: t.featured ? "var(--mute-deep)" : "var(--mute)" }}>custom commercial terms</div>
                  </>
                ) : period === "monthly" ? (
                  <div style={{ fontFamily: "var(--serif)", fontWeight: 600, fontSize: 72, lineHeight: 1, letterSpacing: "-.025em", color: t.featured ? "var(--charcoal)" : "var(--ivory)" }}>
                    ₹{inr(t.monthlyN)}
                    <span style={{ font: "400 18px/1 var(--serif)", color: t.featured ? "var(--mute-deep)" : "var(--mute)", marginLeft: 6 }}>/ month</span>
                  </div>
                ) : (
                  <>
                    <div style={{ fontFamily: "var(--serif)", fontWeight: 600, fontSize: 72, lineHeight: 1, letterSpacing: "-.025em", color: t.featured ? "var(--charcoal)" : "var(--ivory)" }}>
                      ₹{inr(Math.round(t.annualN / 12))}
                      <span style={{ font: "400 18px/1 var(--serif)", color: t.featured ? "var(--mute-deep)" : "var(--mute)", marginLeft: 6 }}>/ mo billed annually</span>
                    </div>
                    <div style={{ marginTop: 10, font: "400 15px/1.3 var(--serif)" }}>
                      <span style={{ textDecoration: "line-through", color: t.featured ? "var(--mute-deep)" : "var(--mute)" }}>₹{inr(t.monthlyN * 12)}</span>
                      <span style={{ color: t.featured ? "var(--charcoal)" : "var(--ivory-soft)", marginLeft: 8 }}>₹{inr(t.annualN)} / year</span>
                    </div>
                  </>
                )}
              </div>
              <p style={{ font: "400 17px/1.5 var(--serif)", color: t.featured ? "var(--mute-deep)" : "var(--ivory-soft)", borderTop: "1px solid " + (t.featured ? "rgba(21,17,13,.12)" : "var(--rule)"), paddingTop: 18 }}>{t.lede}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
                {t.inherits && (
                  <div style={{ font: "italic 400 14px/1.45 var(--serif)", color: t.featured ? "var(--mute-deep)" : "var(--mute)" }}>{t.inherits}</div>
                )}
                {t.features.map((f) => (
                  <div key={f} style={{ display: "flex", gap: 10, font: "300 15px/1.45 var(--sans)", color: t.featured ? "var(--charcoal)" : "var(--ivory-soft)" }}>
                    <span aria-hidden style={{ color: t.featured ? "var(--brass-deep)" : "var(--brass)", fontFamily: "var(--mono)", fontSize: 12, lineHeight: "22px" }}>✓</span>
                    <span>{f}</span>
                  </div>
                ))}
                {t.note && (
                  <div style={{ font: "italic 400 13px/1.5 var(--serif)", color: t.featured ? "var(--mute-deep)" : "var(--mute)", marginTop: 4 }}>{t.note}</div>
                )}
              </div>
              <div style={{ marginTop: "auto" }}>
                <Link
                  href="/trial"
                  className={t.featured ? "btn" : "btn btn-ghost"}
                  style={t.featured ? { background: "var(--charcoal)", color: "var(--ivory)", borderColor: "var(--charcoal)" } : undefined}
                >
                  {t.ctaLabel} <span className="arr">→</span>
                </Link>
                <div style={{ marginTop: 12, font: "400 10px/1.5 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase", color: "var(--mute-deep)" }}>
                  {t.monthlyN === null ? "We reply within an afternoon" : "14 days free · no card"}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
