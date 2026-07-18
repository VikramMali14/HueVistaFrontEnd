import type { Metadata } from "next";
import { getAccessToken, requireRole } from "@/lib/auth";
import { orgApi } from "@/lib/api";
import type { OrgResponse } from "@/lib/types";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { RetailerCustomers } from "@/components/app/retailer-customers";
import { AccessCodes } from "@/components/app/access-codes";
import { PortalSubdomain } from "@/components/app/portal-subdomain";
import { StoreKioskPanel } from "@/components/app/store-kiosk-panel";
import { ShopCombos } from "@/components/app/shop-combos";
import { ShadeCodePanel } from "@/components/app/shade-code-panel";
import { getCatalogueOrSample } from "@/lib/catalogue";

export const metadata: Metadata = {
  title: "Customer portal",
  description: "Customer portal — your white-label storefront.",
};

export default async function PortalPage() {
  // The portal is a retailer/admin-only feature; deny shoppers and distributors.
  await requireRole(["RETAILER", "ADMIN"]);
  // Live catalogue for the combo builder's shade search (bundled sample on failure).
  const shades = await getCatalogueOrSample();
  // The user's orgs, fetched ONCE for the whole page — every section used to
  // fetch this same list independently (six identical requests per load, with
  // the sections free to disagree mid-load). `undefined` on failure lets each
  // section fall back to its own fetch, so a hiccup here degrades, not breaks.
  let orgs: OrgResponse[] | undefined;
  try {
    const token = await getAccessToken();
    orgs = token ? await orgApi.mine(token) : undefined;
  } catch {
    orgs = undefined;
  }
  const shopOrg = orgs === undefined ? undefined : (orgs.find((o) => o.type === "RETAILER") ?? null);
  const subdomainSlug = orgs === undefined ? undefined : (orgs.find((o) => o.slug)?.slug ?? null);
  return (
    <>
      <header style={{ marginBottom: 48 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
          <Eyebrow>Customer portal</Eyebrow>
          <PortalSubdomain slug={subdomainSlug} />
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
        <AccessCodes org={shopOrg} />
      </section>
      <section style={{ marginBottom: 56 }}>
        <h2 className="display" style={{ fontSize: "clamp(28px, 4vw, 44px)", marginBottom: 8 }}>
          Suggested combinations
        </h2>
        <p style={{ font: "300 17px/1.6 var(--serif)", color: "var(--fg-soft)", maxWidth: "52ch", marginBottom: 28 }}>
          Predefine three-shade combinations — main wall, accent, trim — for interiors and
          exteriors. Everyone visualising under your shop sees them in the studio&apos;s AI Suggest
          tab as soon as their photo is up, labelled with your shop&apos;s name.
        </p>
        <ShopCombos shades={shades} org={shopOrg} />
      </section>
      <section style={{ marginBottom: 56 }}>
        <h2 className="display" style={{ fontSize: "clamp(28px, 4vw, 44px)", marginBottom: 8 }}>
          Shade codes your customers see
        </h2>
        <p style={{ font: "300 17px/1.6 var(--serif)", color: "var(--fg-soft)", maxWidth: "52ch", marginBottom: 28 }}>
          One pattern instead of a custom code per shade. Add a prefix (up to 4 characters), a pair
          inserted after the first two characters of the real code, and a suffix (up to 4) — shade
          L124 with prefix AB, pair XY and suffix CD reads ABL1XY24CD. Customers see only the coded
          number; you read the real shade straight off their screen, and the checker below decodes
          any code without opening a project.
        </p>
        <ShadeCodePanel shades={shades} org={shopOrg} />
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
        <StoreKioskPanel org={shopOrg} />
      </section>
      <section style={{ marginBottom: 56 }}>
        <h2 className="display" style={{ fontSize: "clamp(28px, 4vw, 44px)", marginBottom: 8 }}>
          Customers &amp; projects
        </h2>
        <p style={{ font: "300 17px/1.6 var(--serif)", color: "var(--fg-soft)", maxWidth: "52ch", marginBottom: 28 }}>
          Each customer gets one project with their access code. Grant another when they want a second
          room — or they can pay for one themselves from the visualiser.
        </p>
        <RetailerCustomers org={shopOrg} />
      </section>
      <section style={{ marginTop: 56, borderTop: "1px solid var(--rule)", paddingTop: 48 }}>
        <Mono style={{ marginBottom: 18, display: "block" }}>What they see</Mono>
        <h2 className="display" style={{ fontSize: "clamp(32px, 4.5vw, 52px)", marginBottom: 20 }}>Simple. Branded. Yours.</h2>
        <p style={{ font: "300 17px/1.6 var(--serif)", color: "var(--fg-soft)", maxWidth: "44ch" }}>The customer sees your shopfront, your logo, your subdomain — and a single instruction: upload a photo. They never see shade codes; they pick by feel. You get the codes.</p>
      </section>
    </>
  );
}
