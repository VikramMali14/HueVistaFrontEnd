"use client";

import { useState } from "react";

const FAQ: ReadonlyArray<{ q: string; a: string }> = [
  { q: "Do I need any special hardware to use HueVista?", a: "No. HueVista runs in any modern browser — your existing counter tablet, the customer's phone, a laptop in the back room. The recolour shader runs on the device's GPU; nothing to install, nothing to provision." },
  { q: "How is “AI render” counted?", a: "A render is one scene processed through the segmentation stack (chapter III of the Method). Recolouring that scene afterwards — to any number of shades — does not consume a render. A customer testing forty colours on one room counts as one render." },
  { q: "What about brands beyond Asian Paints?", a: "Berger and Nerolac catalogues are in ingestion now, with Dulux to follow. Enterprise customers can have any catalogue ingested in three to five working days, with code, name, and finish preserved." },
  { q: "Does the customer see my branding or HueVista's?", a: "On Starter and Professional, the share carries a small HueVista byline. On Business and Enterprise, you receive a white-label subdomain ({your-shop}.huevista.com) with your wordmark, your palette, and no mention of HueVista to the customer." },
  { q: "What happens after the fourteen-day trial?", a: "Nothing automatic. We do not ask for a card to begin. On the fifteenth day, your saved scenes remain accessible for thirty days; you choose if and when to subscribe." },
  { q: "Are customer photographs stored?", a: "By default, scenes are stored privately to your shop account so you can re-open them with the customer later. You can configure ephemeral mode (auto-deletion after the session) for any device — typical for high-traffic counters." },
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
              style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", width: "100%", background: "transparent", border: "none", cursor: "pointer", color: "var(--ivory)", fontFamily: "var(--serif)", fontSize: 28, padding: 0, textAlign: "left", lineHeight: 1.2 }}
              aria-expanded={isOpen}
            >
              <span>{item.q}</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 18, color: "var(--brass)", transition: "transform .35s var(--ease)", transform: isOpen ? "rotate(45deg)" : "none", marginLeft: 24 }}>+</span>
            </button>
            <div
              style={{
                maxHeight: isOpen ? 400 : 0,
                overflow: "hidden",
                transition: "max-height .5s var(--ease), margin-top .3s var(--ease)",
                marginTop: isOpen ? 20 : 0,
                font: "300 italic 19px/1.55 var(--serif)",
                color: "var(--ivory-soft)",
                maxWidth: "70ch",
              }}
            >
              {item.a}
            </div>
          </div>
        );
      })}
    </div>
  );
}
