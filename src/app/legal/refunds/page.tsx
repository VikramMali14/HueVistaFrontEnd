import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { Footer } from "@/components/layout/footer";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy",
  description: "How subscriptions, wallet credit and pay-per-use charges are cancelled and refunded on HueVista.",
};

const SECTIONS: ReadonlyArray<{ h: string; p: string }> = [
  {
    h: "1 · Overview",
    p: "HueVista is a subscription software service for paint retailers, billed monthly through our payment processor, Razorpay. This policy explains how cancellations are handled and when a payment is, or is not, refundable. It sits alongside our Terms of Service.",
  },
  {
    h: "2 · Free trial",
    p: "Every new shop starts with a fourteen-day trial. We do not ask for a card to begin, and nothing is charged automatically when the trial ends. There is nothing to refund for a trial — you simply choose whether to subscribe.",
  },
  {
    h: "3 · Subscription cancellation",
    p: "You may cancel your plan at any time from your subscription page. Cancellation takes effect at the end of the current billing cycle: your plan stays active until then, and your card is not charged again. We do not provide partial or pro-rata refunds for the unused portion of a cycle that has already been paid.",
  },
  {
    h: "4 · Changing plans",
    p: "Upgrading to a higher tier starts immediately with a fresh quota, and your previous plan is cancelled automatically so you are never billed twice. To move to a smaller plan, cancel your current one — it stays active until the period ends — and subscribe to the smaller tier after that. Plan changes do not generate a refund.",
  },
  {
    h: "5 · Wallet credit",
    p: "Amounts added to your prepaid wallet are usage credit, not a deposit. Wallet credit is used to pay for extra images and auto-masks beyond your monthly allowance. It does not expire, but it is non-refundable and non-withdrawable — it cannot be converted back to cash or transferred.",
  },
  {
    h: "6 · Pay-per-use charges",
    p: "Extra images and AI auto-masks purchased beyond your plan allowance are consumed on use and do not expire. Once a charge has been applied and the corresponding image or auto-mask has been delivered, it is non-refundable. Where a run fails on our side, the credit for that run is returned to you automatically at no charge.",
  },
  {
    h: "7 · Duplicate or erroneous charges",
    p: "If you believe you have been charged in error — for example a duplicate payment or a charge for a service that was never delivered — write to us within 7 days of the transaction with your payment reference. Verified erroneous charges are refunded to the original payment method, typically within 5–7 business days once approved.",
  },
  {
    h: "8 · GST and invoices",
    p: "All plans and pay-per-use top-ups carry 18% GST, and Razorpay emails a tax invoice for every payment. Any approved refund is processed net of applicable taxes in accordance with the original invoice.",
  },
  {
    h: "9 · How to reach us",
    p: "For any cancellation, billing or refund question, use the in-app support chat or write to hello@huevista.com with your account and payment details. We reply within one business day.",
  },
];

export default function RefundsPage() {
  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "96px var(--gutter) 140px" }}>
        <Eyebrow>Legal</Eyebrow>
        <h1 className="display" style={{ fontSize: "clamp(40px, 6vw, 72px)", marginTop: 16 }}>
          Refund &amp; cancellation <i>policy.</i>
        </h1>
        <Lead style={{ marginTop: 20 }}>
          When a subscription can be cancelled, and when a payment is refundable. Last updated July 2026.
        </Lead>
        <div style={{ marginTop: 56, display: "flex", flexDirection: "column", gap: 36 }}>
          {SECTIONS.map((s) => (
            <section key={s.h}>
              <h2 style={{ font: "600 18px/1.3 var(--sans, system-ui)", color: "var(--fg)", margin: "0 0 8px" }}>{s.h}</h2>
              <p style={{ font: "300 18px/1.6 var(--serif)", color: "var(--fg-soft)", margin: 0 }}>{s.p}</p>
            </section>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
