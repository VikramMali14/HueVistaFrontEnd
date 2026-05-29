"use client";

import { useState } from "react";
import Link from "next/link";

interface Tier {
  name: string;
  monthly: string;
  annual: string;
  annualNote?: string;
  lede: string;
  features: ReadonlyArray<string>;
  featured: boolean;
  ribbon?: string;
  ctaLabel: string;
}

const TIERS: ReadonlyArray<Tier> = [
  { name: "Starter", monthly: "₹499", annual: "₹4,990", lede: "For a single shop. The Atelier, the catalogue, the WhatsApp share — at counter speed.", featured: false, features: ["XX AI renders / month", "Asian Paints catalogue · full", "WhatsApp & link share", "1 counter device", "Email support"], ctaLabel: "Begin a trial" },
  { name: "Professional", monthly: "₹999", annual: "₹9,990", lede: "A working counter. Auto-mask, refine, per-region recolour, quantity estimates.", featured: true, ribbon: "Recommended", features: ["LX AI renders / month", "Per-region recolour", "SAM 2 manual regions", "Paint quantity estimator", "3 counter devices", "Priority support"], ctaLabel: "Begin a trial" },
  { name: "Business", monthly: "₹1,999", annual: "₹19,990", lede: "For multi-shop dealerships. White-label subdomain, your palette, your name on the door.", featured: false, features: ["CL AI renders / month", "White-label subdomain", "Custom palette & wordmark", "10 counter devices", "Painter portal · beta", "Dedicated account lead"], ctaLabel: "Begin a trial" },
  { name: "Enterprise", monthly: "On request", annual: "On request", lede: "For manufacturers and large chains. SLA, API access, dedicated catalogue ingestion.", featured: false, features: ["Unlimited renders", "API & SDK access", "Dedicated catalogue ingest", "SLA · 99.9%", "Unlimited devices", "Named technical lead"], ctaLabel: "Talk to us" },
];

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
              {p === "monthly" ? "Monthly" : "Annual"}
            </button>
          ))}
        </div>
        <span style={{ font: "300 italic 16px/1 var(--serif)", color: "var(--ivory-soft)" }}>
          {period === "annual" ? "Two months at our cost when paid annually." : "Fourteen days · no card · cancel quietly."}
        </span>
      </div>

      <section style={{ paddingTop: 60 }}>
        <div className="reveal r-cols-lg-2 r-cols-xs-1" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: "var(--rule)", border: "1px solid var(--rule)" }}>
          {TIERS.map((t) => {
            const price = period === "monthly" ? t.monthly : t.annual;
            const perLabel = price === "On request" ? "" : period === "monthly" ? "/ month" : "/ year";
            return (
              <div key={t.name} style={{ background: t.featured ? "var(--ivory)" : "var(--charcoal)", color: t.featured ? "var(--charcoal)" : "var(--ivory)", padding: "56px 36px", display: "flex", flexDirection: "column", gap: 24, position: "relative" }}>
                {t.ribbon && (<span style={{ position: "absolute", top: 0, right: 24, background: "var(--brass)", color: "var(--charcoal)", font: "500 9px/1 var(--mono)", letterSpacing: ".28em", textTransform: "uppercase", padding: "8px 14px", transform: "translateY(-50%)" }}>{t.ribbon}</span>)}
                <div style={{ font: "400 11px/1 var(--mono)", letterSpacing: ".3em", textTransform: "uppercase", color: t.featured ? "var(--brass-deep)" : "var(--brass)" }}>{t.name}</div>
                <div style={{ fontFamily: "var(--serif)", fontWeight: 300, fontSize: 72, lineHeight: 1, letterSpacing: "-.025em", color: t.featured ? "var(--charcoal)" : "var(--ivory)" }}>
                  {price}
                  {perLabel && (<span style={{ font: "400 italic 18px/1 var(--serif)", color: t.featured ? "var(--mute-deep)" : "var(--mute)", marginLeft: 6 }}>{perLabel}</span>)}
                </div>
                <p style={{ font: "300 italic 17px/1.5 var(--serif)", color: t.featured ? "var(--mute-deep)" : "var(--ivory-soft)", borderTop: "1px solid " + (t.featured ? "rgba(21,17,13,.12)" : "var(--rule)"), paddingTop: 18 }}>{t.lede}</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
                  {t.features.map((f) => (
                    <div key={f} style={{ display: "flex", gap: 10, font: "300 15px/1.45 var(--sans)", color: t.featured ? "var(--charcoal)" : "var(--ivory-soft)" }}>
                      <span style={{ color: "var(--brass)", fontFamily: "var(--mono)", fontSize: 18, lineHeight: 1 }}>·</span>
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: "auto" }}>
                  <Link href="/trial" className={t.featured ? "btn btn-brass" : "btn btn-ghost"}>{t.ctaLabel} <span className="arr">→</span></Link>
                </div>
              </div>
            );
          })}
        </div>
        <p style={{ marginTop: 24, font: "300 italic 14px/1.4 var(--serif)", color: "var(--mute)", textAlign: "center" }}>
          White-label activation, ₹1,499 one-time per retailer. Distributor commissions on request.
        </p>
      </section>
    </>
  );
}
