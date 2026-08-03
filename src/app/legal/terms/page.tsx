import type { Metadata } from "next";
import { contact } from "@/lib/config";
import { SiteHeader } from "@/components/layout/site-header";
import { Footer } from "@/components/layout/footer";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern your use of HueVista.",
};

const SECTIONS: ReadonlyArray<{ h: string; p: string }> = [
  {
    h: "1 · Acceptance",
    p: "By creating an account or using HueVista you agree to these terms. If you are using HueVista on behalf of a business, you confirm you are authorised to bind that business.",
  },
  {
    h: "2 · Your account",
    p: "You are responsible for keeping your credentials secure and for activity under your account. Notify us promptly of any unauthorised use. Access codes issued by a paint retailer are personal to the redeeming customer.",
  },
  {
    h: "3 · Acceptable use",
    p: "You may not misuse the service, attempt to disrupt it, upload unlawful content, or reverse-engineer it. Uploaded photographs must be ones you have the right to use.",
  },
  {
    h: "4 · Plans, trials and billing",
    p: "Paid plans and any included AI preview allowances are described at checkout. Trials carry no obligation. Fees are billed via our payment processor, Razorpay. Prices shown are the whole price: HueVista is not currently GST-registered, so no GST is added at checkout. Should that change we will give notice before any tax appears on a bill. Allowances reset each billing cycle and do not roll over, with one exception: if you upgrade mid-cycle, whatever is left of the old plan's allowance moves onto the new one and lasts until that cycle renews. Extra projects may be bought individually once a cycle's allowance is spent; an unspent one is held on the account indefinitely, and once it is used to create a project that project remains editable for thirty days of use, stated to you before payment. Those days are suspended for as long as a paid plan is covering the account and resume if it lapses. After the window closes the project remains viewable and its saved colours are retained; further editing requires a reopen or a live plan. If a renewal payment fails, the plan is paused and its features stop until payment succeeds; you may end a paused plan at any time from your subscription page. Cancellations and refunds are governed by our Refund & Cancellation Policy.",
  },
  {
    h: "5 · In-store kiosk and reward points",
    p: "A paint shop may publish a public kiosk link. A customer who pays there is buying a visualisation from HueVista at a price HueVista sets; the shop does not set that price and receives no share of the payment. Shops instead earn reward points on those sales. Points may also be bought at the published rate. However they arrive, they are service credit and not money: they have no cash value, cannot be sold, transferred, redeemed for money or withdrawn, and are available to shop accounts only. They may be spent on extra projects and reopens, at a published price list stated in points which varies with the subscription plan covering the account; they expire one year from the day they are credited, and we may vary the earn rate, the purchase rate, the price list or the expiry period with reasonable notice. Points earned on a payment that is later refunded are withdrawn.",
  },
  {
    h: "6 · Content and ownership",
    p: "You retain ownership of the photographs you upload and the colour previews you create. You grant us a limited licence to process them solely to provide the service. Catalogue shade data remains the property of the respective paint manufacturers.",
  },
  {
    h: "7 · AI-generated previews",
    p: "Colour previews, segmentation and recommendations are computer-generated approximations. Actual paint appearance varies with lighting, surface and finish. Always confirm with a physical sample before purchase.",
  },
  {
    h: "8 · Availability and changes",
    p: "We may update, suspend or discontinue features. We aim to give reasonable notice of material changes to these terms; continued use after changes constitutes acceptance.",
  },
  {
    h: "9 · Liability",
    p: "The service is provided “as is”. To the extent permitted by law, HueVista is not liable for indirect or consequential losses, or for colour decisions made from on-screen previews.",
  },
  {
    h: "10 · Governing law",
    p: "These terms are governed by the laws of India, and the courts at Sirohi, Rajasthan have exclusive jurisdiction over any dispute arising from them.",
  },
  {
    h: "11 · Contact",
    p: `HueVista is a ${contact.entityType.toLowerCase()}, ${contact.addressInline}. Questions about these terms? Reach us through the in-app support chat, write to ${contact.support}, or call ${contact.phone}.`,
  },
];

export default function TermsPage() {
  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "96px var(--gutter) 140px" }}>
        <Eyebrow>Legal</Eyebrow>
        <h1 className="display" style={{ fontSize: "clamp(40px, 6vw, 72px)", marginTop: 16 }}>
          Terms of <i>service.</i>
        </h1>
        <Lead style={{ marginTop: 20 }}>
          The plain-language agreement between you and HueVista. Last updated August 2026.
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
