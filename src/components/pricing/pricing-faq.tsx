"use client";

import { useState } from "react";
import { site } from "@/lib/config";

/**
 * `catalogue` describes what is actually loaded, passed down from the page.
 *
 * The "brands beyond Asian Paints" answer used to say "Berger, Nerolac, Dulux and
 * Nippon catalogues are already loaded — 10,000+ shades with their real codes". None
 * of those four were loaded and the count was more than twice the truth, so a shop
 * could subscribe expecting a catalogue that was not there. It now names the
 * companies the backend really serves.
 */
const catalogueAnswer = (catalogue: { shades: number; names: string[] } | null): string => {
  const tail =
    " Need another company? Ask us — we usually add one within a week, keeping every code,"
    + " name and finish as the company publishes it. The shades themselves are taken from"
    + " those companies' shade cards and fan decks, so screen colour can differ from the"
    + " paint; check the card at the counter before buying.";
  if (!catalogue || catalogue.names.length === 0) {
    return `Whatever you see on the catalogue page is what is loaded today, with each company's real codes.${tail}`;
  }
  const named = new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(
    catalogue.names,
  );
  return `${named} — ${catalogue.shades.toLocaleString("en-IN")} shades in all, with their real codes. More are being added.${tail}`;
};

// Short answers. Several of these ran to eight or nine lines and answered questions
// nobody asked ("Auto-masks used to be a second allowance…"), which is how a FAQ
// stops being read. One question, one answer, the number the shop needs.
//
// They also no longer describe how anything is built. A shop owner wants to know what
// a room costs and what happens when they run out, not what runs on which device.
const FAQ: ReadonlyArray<{ q: string; a: string }> = [
  { q: "Do I need any special equipment?", a: "No. HueVista opens in a normal web browser — the tablet at your counter, a laptop in the back room, or a phone. There is nothing to install." },
  { q: "How exactly do the colours look on the wall?", a: "Close, but treat the preview as a guide. The picture is made by AI: edges, textures and lighting can come out a little differently, and results are not guaranteed. Shade colours come from the companies' own shade cards, and every screen shows colour slightly differently — so always confirm against the physical shade card before your customer buys." },
  { q: "What counts as one project?", a: "One photo turned into a room you can paint. That covers the clean-up and finding the walls, charged once. After that everything is free: try as many shades as you like, paint each wall differently, ask for suggestions, share it. A customer trying forty colours on one photo is still one project." },
  { q: "Do I pay extra when the walls are found for me?", a: "No, it is included. You can also mark the walls yourself instead — the price is the same either way." },
  { q: "What if I use up my projects mid-month?", a: "Everything you have already made keeps working — trying more shades costs nothing. For a new project, buy one at a time at your plan's rate: 80 points or ₹199 on the free plan, 60 or ₹65 on Starter, 50 or ₹55 on Professional, 40 or ₹45 on Business. You are offered it in the studio, at the photo that needs it. Or wait for the month to turn over — the allowance comes back on every plan, free included. Or upgrade, and the bigger allowance applies straight away." },
  { q: "How long does a bought project last?", a: "An unused one waits as long as you like. Once you turn it into a room you get 30 days of use — and the clock pauses while a plan is covering you, so it is not quietly used up. After that the room stays viewable with its colours, and you can reopen it for another 30 days." },
  { q: "Points or card — what's the difference?", a: "Both buy the same thing, and points are cheaper on every plan. You earn points when a customer pays at your kiosk link, or buy them at ₹1 each (₹100 minimum) from your subscription page. Points last a year. Paying by card is the one-off option if you would rather not keep a balance." },
  { q: "Which paint companies are in the catalogue?", a: "" },
  { q: "Whose name does the customer see?", a: `For now, every share carries a small HueVista line. Your own web address ({your-shop}.${site.whiteLabelDomain}) with your name on it is coming, to Business shops first — ask us for early access.` },
  { q: "Is the free plan a trial?", a: "No, and that is the point. There is no countdown and no end date: 2 complete projects a month, renewing every month for as long as you keep the account. We never ask for a card to start, and nothing is ever charged on it. Subscribe when your counter needs more than two rooms a month — not because a clock ran out." },
  { q: "What is not in the free plan?", a: "Two things. The colour finder, which reads a photograph and gives you the nearest shade codes from your catalogue; and the rest of the catalogue \u2014 a free shop works with one paint company, Asian Paints, in full. Everything else is the same product: painting rooms, wall-by-wall colours, customer codes, sharing. Any paid plan switches both on, and the companies you see are then whichever ones your distributor assigned you." },
  { q: "What happens if I cancel a paid plan?", a: "You keep everything to the end of the period you paid for, and then drop back to the free plan rather than to nothing — 2 projects a month, still yours. Projects you bought outright never expire, and any customer codes you have already handed out still work." },
  { q: "Can I change plans later?", a: "Upgrade any time and it starts immediately — the old plan is cancelled for you, so you are never billed twice. Projects left over from the old plan come with you (5 unused on Starter plus a fresh 45 on Professional is 50 to spend), and they last that month. To move to a smaller plan, cancel first — you keep access to the end of the period — then pick the smaller one, or stay on free." },
  { q: "How do I pay?", a: "UPI, cards or netbanking, billed monthly through Razorpay. We never see or store your card details." },
  { q: "Are customer photos kept?", a: "Yes, privately to your shop account, so you can open it again with the customer later. You can delete any project — photo, walls and colours — whenever you want." },
];

export function PricingFaq({
  catalogue = null,
}: {
  catalogue?: { shades: number; names: string[] } | null;
}) {
  const [open, setOpen] = useState<number | null>(0);
  // The catalogue answer is the one that depends on live data; the rest are static.
  const entries = FAQ.map((item) =>
    item.q === "Which paint companies are in the catalogue?"
      ? { ...item, a: catalogueAnswer(catalogue) }
      : item,
  );
  return (
    <div style={{ borderTop: "1px solid var(--rule)" }}>
      {entries.map((item, i) => {
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
