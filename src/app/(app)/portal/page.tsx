import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { RetailerCustomers } from "@/components/app/retailer-customers";
import { AccessCodes } from "@/components/app/access-codes";
import { PortalSubdomain } from "@/components/app/portal-subdomain";
import { ShopCombos } from "@/components/app/shop-combos";
import { StoreKioskPanel } from "@/components/app/store-kiosk-panel";
import { getCatalogueOrSample } from "@/lib/catalogue";

export const metadata: Metadata = {
  title: "Customer portal",
  description: "Customer portal — your white-label storefront.",
};

export default async function PortalPage() {
  // The portal is a retailer/admin-only feature; deny shoppers and distributors.
  await requireRole(["RETAILER", "ADMIN"]);
  // Shades feed the combination builder's search; falls back to the bundled sample.
  const shades = await getCatalogueOrSample();
  return (
    <>
      <header style={{ marginBottom: 48 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
          <Eyebrow>Customer portal</Eyebrow>
          <PortalSubdomain />
        </div>
        <h1 className="display" style={{ fontSize: "clamp(48px, 6vw, 84px)" }}>Your white-label<br />customer portal</h1>
        <Lead style={{ marginTop: 24 }}>Issue temporary access codes for your customers. They visualise colours on your subdomain — without seeing shade codes. When they're ready, they "Send to retailer" and you receive the full project.</Lead>
      </header>
      <section style={{ marginBottom: 56 }}>
        <h2 className="display" style={{ fontSize: "clamp(28px, 4vw, 44px)", marginBottom: 8 }}>Active codes</h2>
        <p style={{ font: "300 17px/1.6 var(--serif)", color: "var(--fg-soft)", maxWidth: "52ch", marginBottom: 28 }}>
          Issue a code and share it with a customer. They enter it at <Mono>huevista.com/redeem</Mono> to start
          visualising — with one project and a validity window you control.
        </p>
        <AccessCodes />
      </section>
      <section style={{ marginBottom: 56 }}>
        <h2 className="display" style={{ fontSize: "clamp(28px, 4vw, 44px)", marginBottom: 8 }}>
          Store kiosk &amp; wallet
        </h2>
        <p style={{ font: "300 17px/1.6 var(--serif)", color: "var(--fg-soft)", maxWidth: "52ch", marginBottom: 28 }}>
          Publish a public link where walk-in customers order like at a kiosk: they pay your price
          (min ₹50), upload one room photo and pick colours. Everything above the ₹50 base lands in
          your wallet — redeem it to your UPI whenever you like.
        </p>
        <StoreKioskPanel />
      </section>
      <section style={{ marginBottom: 56 }}>
        <h2 className="display" style={{ fontSize: "clamp(28px, 4vw, 44px)", marginBottom: 8 }}>
          Suggested combinations
        </h2>
        <p style={{ font: "300 17px/1.6 var(--serif)", color: "var(--fg-soft)", maxWidth: "52ch", marginBottom: 28 }}>
          Curate three-shade pairings — main wall, accent wall, trim — for interiors and exteriors.
          They appear under &ldquo;Your shop suggests&rdquo; in the studio&rsquo;s AI Suggest tab the moment a
          customer uploads a photo, applied to the whole room in one tap.
        </p>
        <ShopCombos shades={shades} />
      </section>
      <section style={{ marginBottom: 56 }}>
        <h2 className="display" style={{ fontSize: "clamp(28px, 4vw, 44px)", marginBottom: 8 }}>
          Customers &amp; projects
        </h2>
        <p style={{ font: "300 17px/1.6 var(--serif)", color: "var(--fg-soft)", maxWidth: "52ch", marginBottom: 28 }}>
          Each customer gets one project with their access code. Grant another when they want a second
          room — or they can pay for one themselves from the visualiser.
        </p>
        <RetailerCustomers />
      </section>
      <section style={{ marginTop: 56, borderTop: "1px solid var(--rule)", paddingTop: 48 }}>
        <Mono style={{ marginBottom: 18, display: "block" }}>What they see</Mono>
        <h2 className="display" style={{ fontSize: "clamp(32px, 4.5vw, 52px)", marginBottom: 20 }}>Simple. Branded. Yours.</h2>
        <p style={{ font: "300 17px/1.6 var(--serif)", color: "var(--fg-soft)", maxWidth: "44ch" }}>The customer sees your shopfront, your logo, your subdomain — and a single instruction: upload a photo. They never see shade codes; they pick by feel. You get the codes.</p>
      </section>
    </>
  );
}
