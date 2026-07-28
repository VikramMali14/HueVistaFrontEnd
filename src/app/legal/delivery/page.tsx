import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { Footer } from "@/components/layout/footer";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { contact } from "@/lib/config";

export const metadata: Metadata = {
  title: "Shipping & Delivery Policy",
  description: "HueVista is delivered electronically and instantly — nothing is shipped physically.",
};

const SECTIONS: ReadonlyArray<{ h: string; p: string }> = [
  {
    h: "1 · Nothing is shipped",
    p: "HueVista is a software service. There is no physical product, no packaging and no courier: everything you buy is delivered electronically to your HueVista account. No shipping address is collected and no delivery charge is ever added to a payment.",
  },
  {
    h: "2 · When access starts",
    p: "Access is granted immediately on successful payment — typically within a few seconds, and in all cases within a few minutes. A subscription becomes active as soon as the payment is confirmed. Extra images, AI auto-masks, projects and project reopens are added to your account the moment the payment clears, and are usable straight away.",
  },
  {
    h: "3 · In-store kiosk purchases",
    p: "When a walk-in customer pays at a shop's kiosk link, their access code and visualisation session are issued on the same screen as soon as the payment succeeds. Nothing is emailed, posted or collected later. If the connection drops between payment and the code appearing, reloading the page re-issues the same code — the purchase is never lost.",
  },
  {
    h: "4 · Reward points",
    p: "Reward points earned by a shop from kiosk sales are credited to the shop's account at the moment the sale is verified. They are usable immediately and expire one year from the day they are earned.",
  },
  {
    h: "5 · If something does not arrive",
    p: `If a payment succeeds and the corresponding access, credit or points do not appear on your account, write to ${contact.billing} with your payment reference. We investigate the same business day and either deliver what was bought or refund it in full.`,
  },
  {
    h: "6 · Service availability",
    p: "The service is delivered over the internet and is available worldwide, though it is built for India and billed in Indian rupees. Planned maintenance is announced in advance where it is likely to interrupt use.",
  },
];

export default function DeliveryPage() {
  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "96px var(--gutter) 140px" }}>
        <Eyebrow>Legal</Eyebrow>
        <h1 className="display" style={{ fontSize: "clamp(40px, 6vw, 72px)", marginTop: 16 }}>
          Shipping &amp; delivery <i>policy.</i>
        </h1>
        <Lead style={{ marginTop: 20 }}>
          HueVista is delivered electronically and instantly. Nothing is shipped. Last updated
          July 2026.
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
