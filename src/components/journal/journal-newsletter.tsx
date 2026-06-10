"use client";

import { useState } from "react";
import { Lead, Mono } from "@/components/ui/eyebrow";

export function JournalNewsletter() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  return (
    <section style={{ background: "var(--band)", borderTop: "1px solid var(--band-rule)", borderBottom: "1px solid var(--band-rule)", padding: "140px 0", marginTop: 120, textAlign: "center" }} className="full-bleed">
      <div className="reveal" style={{ maxWidth: 1100, margin: "0 auto", padding: "0 var(--gutter)" }}>
        <Mono brass>Monthly letter</Mono>
        <h3 style={{ fontFamily: "var(--serif)", fontWeight: 600, fontSize: "clamp(40px, 5.5vw, 80px)", lineHeight: 1, letterSpacing: "-.015em", color: "var(--ivory)", margin: "24px 0 0" }}>
          One letter, <br /><i>once a month.</i>
        </h3>
        <Lead style={{ margin: "32px auto 0", maxWidth: "48ch" }}>
          On the first Sunday of the month, a single essay arrives in your inbox. Nothing more. Cancel quietly, any time.
        </Lead>
        <form
          onSubmit={(e) => { e.preventDefault(); setSubmitted(true); }}
          style={{ marginTop: 40, display: "inline-flex", gap: 8, borderBottom: "1px solid var(--ivory)", paddingBottom: 12, width: "min(440px, 90vw)", justifyContent: "space-between", alignItems: "center" }}
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email"
            disabled={submitted}
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--ivory)", font: "400 18px/1 var(--serif)", padding: 0 }}
          />
          <button type="submit" disabled={submitted} style={{ background: "transparent", border: "none", color: "var(--brass)", font: "400 11px/1 var(--mono)", letterSpacing: ".26em", textTransform: "uppercase", cursor: submitted ? "default" : "pointer", padding: "8px 12px" }}>
            {submitted ? "Thank you ✓" : "Subscribe"}
          </button>
        </form>
        <Mono style={{ marginTop: 24, display: "block", color: "var(--mute)" }}>No tracking pixel. No nudges. Plain text.</Mono>
      </div>
    </section>
  );
}
