"use client";

import { useState } from "react";

const FAQ: ReadonlyArray<{ q: string; a: string }> = [
  { q: "Do I need any special hardware to use HueVista?", a: "No. HueVista runs in any modern browser — your existing counter tablet, the customer's phone, a laptop in the back room. The recolour shader runs on the device's GPU; nothing to install, nothing to provision." },
  { q: "How is “AI preview” counted?", a: "A preview is one photograph turned into a recolour-ready scene. Trying any number of shades on that same photo afterwards does not count as another preview — a customer testing forty colours on one room is still a single preview." },
  { q: "What happens if I use all my AI previews mid-month?", a: "The studio keeps working — every saved scene stays open and recolourable, since trying shades costs nothing. New photo previews resume on the 1st, or upgrade mid-cycle and pay only the difference." },
  { q: "What about brands beyond Asian Paints?", a: "Berger, Nerolac, Dulux and Nippon catalogues are already loaded — 10,000+ shades with their real codes. Enterprise customers can have any additional catalogue ingested in three to five working days, with code, name, and finish preserved." },
  { q: "Does the customer see my branding or HueVista's?", a: "Today every share carries a small HueVista byline. A white-label subdomain ({your-shop}.huevista.com) with your wordmark and palette is rolling out to Business and Enterprise shops — ask us for early access." },
  { q: "What happens after the fourteen-day trial?", a: "Nothing automatic. We do not ask for a card to begin. Your saved scenes stay accessible; you choose if and when to subscribe." },
  { q: "Can I change plans later?", a: "Upgrade any time and the difference is prorated; downgrades apply from the next cycle. No calls, no forms — it's a button in your dashboard." },
  { q: "Do you provide a GST invoice?", a: "On request while automated invoicing rolls out — write to us with your GSTIN and shop details and we'll send a GST-compliant invoice for your subscription so you can claim input credit." },
  { q: "How do I pay?", a: "UPI, cards and netbanking, billed monthly. We never store card details ourselves — payments run through Razorpay." },
  { q: "Are customer photographs stored?", a: "Scenes are stored privately to your shop account so you can re-open them with the customer later, and you can delete any project — photo, walls and colours — whenever you wish." },
];

export function PricingFaq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div style={{ borderTop: "1px solid var(--rule)" }}>
      {FAQ.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={i} style={{ borderBottom: "1px solid var(--rule)", padding: "32px 0" }}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : i)}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", width: "100%", background: "transparent", border: "none", cursor: "pointer", color: "var(--fg)", fontFamily: "var(--serif)", fontSize: 28, padding: 0, textAlign: "left", lineHeight: 1.2 }}
              aria-expanded={isOpen}
            >
              <span>{item.q}</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 18, color: "var(--brass)", transition: "transform .35s var(--ease)", transform: isOpen ? "rotate(45deg)" : "none", marginLeft: 24 }}>+</span>
            </button>
            <div
              style={{
                display: "grid",
                gridTemplateRows: isOpen ? "1fr" : "0fr",
                transition: "grid-template-rows .45s var(--ease), margin-top .3s var(--ease)",
                marginTop: isOpen ? 20 : 0,
              }}
            >
              <div style={{ minHeight: 0, overflow: "hidden", font: "400 19px/1.55 var(--serif)", color: "var(--fg-soft)", maxWidth: "70ch" }}>
                {item.a}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
