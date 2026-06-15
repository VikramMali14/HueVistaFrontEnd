import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { RetailerCustomers } from "@/components/app/retailer-customers";
import { AccessCodes } from "@/components/app/access-codes";
import { PortalSubdomain } from "@/components/app/portal-subdomain";

export const metadata: Metadata = {
  title: "Customer portal",
  description: "Customer portal — your white-label storefront.",
};

export default async function PortalPage() {
  // The portal is a retailer/admin-only feature; deny shoppers and distributors.
  await requireRole(["RETAILER", "ADMIN"]);
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
        <h2 className="display" style={{ fontSize: 48, marginBottom: 8 }}>Active codes</h2>
        <p style={{ font: "300 18px/1.6 var(--serif)", color: "var(--fg-soft)", maxWidth: "52ch", marginBottom: 28 }}>
          Issue a code and share it with a customer. They enter it at <Mono>huevista.com/redeem</Mono> to start
          visualising — with one project and a validity window you control.
        </p>
        <AccessCodes />
      </section>
      <section style={{ marginBottom: 56 }}>
        <h2 className="display" style={{ fontSize: 48, marginBottom: 8 }}>
          Customers &amp; projects
        </h2>
        <p style={{ font: "300 18px/1.6 var(--serif)", color: "var(--fg-soft)", maxWidth: "52ch", marginBottom: 28 }}>
          Each customer gets one project with their access code. Grant another when they want a second
          room — or they can pay for one themselves from the visualiser.
        </p>
        <RetailerCustomers />
      </section>
      <section style={{ marginTop: 56, borderTop: "1px solid var(--rule)", paddingTop: 48 }}>
        <Mono style={{ marginBottom: 18, display: "block" }}>What they see</Mono>
        <h2 className="display" style={{ fontSize: 56, marginBottom: 24 }}>Simple. Branded. Yours.</h2>
        <p style={{ font: "300 19px/1.6 var(--serif)", color: "var(--fg-soft)", maxWidth: "44ch" }}>The customer sees your shopfront, your logo, your subdomain — and a single instruction: upload a photo. They never see shade codes; they pick by feel. You get the codes.</p>
      </section>
    </>
  );
}
