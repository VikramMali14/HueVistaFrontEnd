"use client";

import { useState } from "react";

const FAQ: ReadonlyArray<{ q: string; a: string }> = [
  { q: "Do I need any special hardware to use HueVista?", a: "No. HueVista runs in any modern browser — your existing counter tablet, the customer's phone, a laptop in the back room. The recolour shader runs on the device's GPU; nothing to install, nothing to provision." },
  { q: "How is a “project” counted?", a: "One photograph turned into a recolour-ready scene is one project. It covers the whole automatic pipeline — the AI photo clean-up (wires, clutter and blemishes removed) AND the AI wall detection — charged once, not once per step. Everything afterwards is free: trying any number of shades, recolouring per wall, palette suggestions, sharing. A customer testing forty colours on one room is still a single project." },
  { q: "Do I pay extra for AI wall detection?", a: "No. It is part of the project. After the clean-up you choose whether the AI detects the walls for you in seconds or you click each wall yourself in the studio — either way the project costs the same. Auto-masks used to be a second allowance you could run out of independently, which meant paying for a cleaned photo and then having no way to mask it; that is gone." },
  { q: "What happens if I use all my projects mid-month?", a: "The studio keeps working — every saved scene stays open and recolourable, since trying shades costs nothing. For new work you buy projects one at a time, at your plan's own rate: 60 points or ₹65 on Starter, 50 or ₹55 on Professional, 40 or ₹45 on Business (80 points / ₹99 with no plan). The bigger your plan, the cheaper the extra. Bought projects never expire. Or upgrade — the fresh quota applies the moment the payment completes." },
  { q: "Points or card — what's the difference?", a: "Both buy the same extra project; points are cheaper on every tier. You earn points on every kiosk sale, or buy them at ₹1 each (₹100 minimum) by UPI, card or netbanking, and spend them with one tap — no checkout each time. Points expire a year after they arrive and spending always uses the oldest first. Paying by card is the one-off route if you'd rather not hold a balance. Every purchase gets a Razorpay receipt." },
  { q: "What about brands beyond Asian Paints?", a: "Berger, Nerolac, Dulux and Nippon catalogues are already loaded — 10,000+ shades with their real codes. Enterprise customers can have any additional catalogue ingested in three to five working days, with code, name, and finish preserved." },
  { q: "Does the customer see my branding or HueVista's?", a: "Today every share carries a small HueVista byline. A white-label subdomain ({your-shop}.huevista.com) with your wordmark and palette is rolling out to Business and Enterprise shops — ask us for early access." },
  { q: "What happens after the seven-day trial?", a: "Nothing automatic. We do not ask for a card to begin. Your saved scenes stay accessible; you choose if and when to subscribe." },
  { q: "Can I change plans later?", a: "Upgrade any time from your subscription page — pay for the bigger plan and it starts immediately with its full fresh quota, while the old plan is cancelled automatically so you're never billed twice. Whatever was left of the old plan's projects comes with you: 5 unused on Starter plus a fresh 45 on Professional is 50 to spend. Carried-over projects last that billing cycle and then expire, so use them first — anything you BOUGHT outright never expires. To move to a smaller plan, cancel your current one (it stays active till the period ends) and subscribe to the smaller tier after that." },
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
