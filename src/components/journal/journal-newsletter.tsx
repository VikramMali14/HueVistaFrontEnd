"use client";

import { useState, useTransition } from "react";
import { Lead, Mono } from "@/components/ui/eyebrow";
import { joinNewsletterAction } from "@/lib/newsletter";

/**
 * The monthly-letter sign-up.
 *
 * This form used to be a prop: submitting it set `submitted` to true, printed
 * "Thank you ✓" and threw the address away. Nobody was subscribed, no list existed and
 * no letter could ever arrive — the one promise the section makes was the one thing it
 * did not do. It now posts to the real endpoint, which stores the address and sends the
 * welcome mail, and it only says thank you once the server has said yes.
 */
export function JournalNewsletter() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section id="newsletter" style={{ background: "var(--band)", borderTop: "1px solid var(--band-rule)", borderBottom: "1px solid var(--band-rule)", padding: "100px 0", marginTop: 80, textAlign: "center" }} className="full-bleed">
      <div className="reveal" style={{ maxWidth: 1100, margin: "0 auto", padding: "0 var(--gutter)" }}>
        <Mono brass>Monthly letter</Mono>
        <h3 style={{ fontFamily: "var(--serif)", fontWeight: 600, fontSize: "clamp(36px, 5vw, 72px)", lineHeight: 1, letterSpacing: "-.015em", color: "var(--ivory)", margin: "20px 0 0" }}>
          One letter, <br /><i>once a month.</i>
        </h3>
        <Lead style={{ margin: "24px auto 0", maxWidth: "48ch", color: "rgba(247,247,245,.72)" }}>
          On the first Sunday of the month, a single essay arrives in your inbox. Nothing more. Cancel quietly, any time.
        </Lead>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (submitted || pending) return;
            if (!e.currentTarget.reportValidity()) return;
            setError(null);
            startTransition(async () => {
              const res = await joinNewsletterAction(email);
              if (res.error) setError(res.error);
              else setSubmitted(true);
            });
          }}
          style={{ marginTop: 40, display: "inline-flex", gap: 8, borderBottom: "1px solid var(--ivory)", paddingBottom: 12, width: "min(440px, 90vw)", justifyContent: "space-between", alignItems: "center" }}
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email"
            aria-label="Email address"
            disabled={submitted || pending}
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--ivory)", font: "400 18px/1 var(--serif)", padding: 0, transition: "opacity .3s var(--ease)", opacity: submitted ? 0.45 : 1 }}
          />
          <button type="submit" disabled={submitted || pending} style={{ background: "transparent", border: "none", color: "var(--brass)", font: "400 12px/1 var(--mono)", letterSpacing: ".26em", textTransform: "uppercase", cursor: submitted || pending ? "default" : "pointer", padding: "8px 12px" }}>
            <span key={submitted ? "done" : pending ? "busy" : "idle"} className="hv-fade-swap">
              {submitted ? "Thank you ✓" : pending ? "Sending…" : "Subscribe"}
            </span>
          </button>
        </form>
        {submitted && (
          <p className="mono" role="status" style={{ marginTop: 20, color: "var(--brass)" }}>
            You&apos;re on the list — a welcome note is on its way
          </p>
        )}
        {error && (
          <p className="mono" role="alert" style={{ marginTop: 20, color: "var(--terracotta)" }}>
            {error}
          </p>
        )}
        <Mono style={{ marginTop: 24, display: "block", color: "var(--mute)" }}>No tracking pixel. No nudges. Plain text.</Mono>
      </div>
    </section>
  );
}
