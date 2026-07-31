import type { Metadata } from "next";
import { contact } from "@/lib/config";
import { SiteHeader } from "@/components/layout/site-header";
import { Footer } from "@/components/layout/footer";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy",
  description: "How subscriptions and points are cancelled and refunded on HueVista.",
};

const SECTIONS: ReadonlyArray<{ h: string; p: string }> = [
  {
    h: "1 · Overview",
    p: "HueVista is a subscription software service for paint retailers, billed monthly through our payment processor, Razorpay. This policy explains how cancellations are handled and when a payment is, or is not, refundable. It sits alongside our Terms of Service.",
  },
  {
    h: "2 · Free trial",
    p: "Every new shop starts with a seven-day trial. We do not ask for a card to begin, and nothing is charged automatically when the trial ends. There is nothing to refund for a trial — you simply choose whether to subscribe.",
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
    h: "5 · Points",
    p: "Points are a balance on a HueVista account, spendable on extra projects and project reopens. They arrive two ways: earned free when a customer buys a visualisation through your in-store kiosk link, or bought at the published rate. Both kinds behave identically once credited. What a project costs in points depends on the plan covering the account at the time it is bought. Points have no cash value, cannot be transferred to another account, and are not withdrawable or convertible back to money in any circumstance — a purchase of points is a purchase of service credit, not a deposit.",
  },
  {
    h: "6 · Points expiry and refunds",
    p: "Points expire one year from the day they are credited, whether earned or bought. We email you ten days before a batch expires and again on the expiry day itself, and spending always uses the oldest points first so nothing lapses while newer points sit unused. Expired points are not reinstated and are not refundable. A purchase of points is refundable only if the points were never credited — once they are on your account and available to spend, the service has been delivered. Where a kiosk payment is refunded to the customer, the points that sale earned are removed; if they have already been spent, the shortfall is set against points credited later.",
  },
  {
    h: "7 · What points buy",
    p: "Extra projects bought beyond your plan allowance — with points or by card — are consumed on use and do not themselves expire once credited. Once a charge has been applied and the corresponding project has been delivered, it is non-refundable. Where a run fails on our side, the credit for that run is returned to you automatically at no charge. Projects carried over from a plan you have upgraded away from are unused allowance rather than a purchase: they last the billing cycle they are carried into and are not refundable if unspent.",
  },
  {
    h: "8 · Duplicate or erroneous charges",
    p: "If you believe you have been charged in error — for example a duplicate payment or a charge for a service that was never delivered — write to us within 7 days of the transaction with your payment reference. Verified erroneous charges are refunded to the original payment method, typically within 5–7 business days once approved.",
  },
  {
    h: "9 · How to reach us",
    p: `For any cancellation, billing or refund question, use the in-app support chat or write to ${contact.billing} with your account and payment details. We reply within one business day. Postal enquiries: HueVista, Proprietor ${contact.legalName}, ${contact.addressInline}. Phone: ${contact.phone}.`,
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
