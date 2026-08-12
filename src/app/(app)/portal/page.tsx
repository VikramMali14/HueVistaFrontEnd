import type { Metadata } from "next";
import { getAccessToken, requireFeature, requireRole } from "@/lib/auth";
import { orgApi } from "@/lib/api";
import { site } from "@/lib/config";
import type { OrgResponse } from "@/lib/types";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { RetailerCustomers } from "@/components/app/retailer-customers";
import { AccessCodes } from "@/components/app/access-codes";
import { PortalSubdomain } from "@/components/app/portal-subdomain";
import { StoreKioskPanel } from "@/components/app/store-kiosk-panel";
import { ShopCombos } from "@/components/app/shop-combos";
import { ShadeCodePanel } from "@/components/app/shade-code-panel";
import { ShopBrandsPanel } from "@/components/app/shop-brands-panel";
import { SectionNav } from "@/components/ui/section-nav";
import { getCatalogueOrSample } from "@/lib/catalogue";

export const metadata: Metadata = {
  title: "Customer portal",
  description: "Customer portal — issue access codes and see your customers' projects.",
};

export default async function PortalPage() {
  // The portal is a retailer/admin-only feature; deny shoppers and distributors.
  await requireRole(["RETAILER", "ADMIN"]);
  // …and a distributor may have switched it off for this particular shop.
  await requireFeature("CUSTOMER_PORTAL");
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
        <h1 className="display" style={{ fontSize: "clamp(48px, 6vw, 84px)" }}>Your customer{" "}<br />portal</h1>
        <Lead style={{ marginTop: 24 }}>Issue temporary access codes for your customers. They visualise colours without seeing shade codes. When they're ready, they &ldquo;Send to retailer&rdquo; and you receive the full project.</Lead>
      </header>
      <SectionNav
        items={[
          { id: "active-codes", label: "Active codes", hint: "Issue customer access codes" },
          { id: "paint-companies", label: "Paint companies", hint: "Choose which ones you show" },
          { id: "suggested-combos", label: "Suggested combos", hint: "Predefine shade combinations" },
          { id: "shade-codes", label: "Shade codes", hint: "Your custom code scheme" },
          { id: "store-kiosk", label: "Store kiosk & wallet", hint: "Public paid link + payouts" },
          { id: "customers", label: "Customers & projects", hint: "Everyone under your shop" },
          // Seven sections on the page, seven in the index. "What they see" was the
          // one section this list left out — and the only one that describes the
          // customer's side of everything above it.
          { id: "what-they-see", label: "What they see", hint: "The customer's side of it" },
        ]}
      />
      <section id="active-codes" style={{ marginBottom: 56, scrollMarginTop: 100 }}>
        <h2 className="display" style={{ fontSize: "clamp(28px, 4vw, 44px)", marginBottom: 8 }}>Active codes</h2>
        <p style={{ font: "300 17px/1.6 var(--serif)", color: "var(--fg-soft)", maxWidth: "52ch", marginBottom: 28 }}>
          Issue a code and share it with a customer. They enter it at <Mono>{site.unlockLabel}</Mono> to start
          visualising — with one project and a validity window you control.
        </p>
        <AccessCodes org={shopOrg} />
      </section>
      <section id="paint-companies" style={{ marginBottom: 56, scrollMarginTop: 100 }}>
        <h2 className="display" style={{ fontSize: "clamp(28px, 4vw, 44px)", marginBottom: 8 }}>
          Paint companies
        </h2>
        <p style={{ font: "300 17px/1.6 var(--serif)", color: "var(--fg-soft)", maxWidth: "52ch", marginBottom: 28 }}>
          Your distributor decides which companies you may carry. This is the other half: of
          those, the ones you actually stock and want shown. It applies in one go — your own
          studio, your kiosk link, every access code you issue and every customer you onboard —
          so nobody is offered a colour you cannot sell them.
        </p>
        <ShopBrandsPanel org={shopOrg} />
      </section>
      <section id="suggested-combos" style={{ marginBottom: 56, scrollMarginTop: 100 }}>
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
      <section id="shade-codes" style={{ marginBottom: 56, scrollMarginTop: 100 }}>
        <h2 className="display" style={{ fontSize: "clamp(28px, 4vw, 44px)", marginBottom: 8 }}>
          Shade codes your customers see
        </h2>
        {/* The old wording promised more than the product can deliver: "customers see
            only the coded number" is true of every HueVista screen, but our public
            catalogue at /catalogue lists shade names beside their real codes to
            anyone, signed in or not. A customer who can read the paint's NAME can
            search it there and get the number back. Hiding names is therefore not a
            second, optional switch — it is the half that makes the numbering hold. */}
        <p style={{ font: "300 17px/1.6 var(--serif)", color: "var(--fg-soft)", maxWidth: "52ch", marginBottom: 28 }}>
          One pattern instead of a custom code per shade. Add a prefix (up to 4 characters), a pair
          inserted after the first two characters of the real code, and a suffix (up to 4) — shade
          L124 with prefix AB, pair XY and suffix CD reads ABL1XY24CD. Your customers see the coded
          number on every HueVista screen; you read the real shade straight off theirs, and the
          checker below decodes any code without opening a project. Turn on &ldquo;Hide paint
          names&rdquo; below to make it hold: our public catalogue lists paint names with their
          manufacturer codes, so a customer who can read the name can look the real number up.
        </p>
        <ShadeCodePanel shades={shades} org={shopOrg} />
      </section>
      <section id="store-kiosk" style={{ marginBottom: 56, scrollMarginTop: 100 }}>
        <h2 className="display" style={{ fontSize: "clamp(28px, 4vw, 44px)", marginBottom: 8 }}>
          Store kiosk &amp; wallet
        </h2>
        {/* Describes the model the kiosk panel actually implements. This said the
            shop set its own price (min ₹50) and kept everything above a ₹50 base as
            cash in a wallet to redeem by UPI — two rewards for one sale, neither of
            which the panel below offers. There is no price field and no payout form:
            the walk-in pays HueVista one flat price, and the shop earns points. */}
        <p style={{ font: "300 17px/1.6 var(--serif)", color: "var(--fg-soft)", maxWidth: "52ch", marginBottom: 28 }}>
          Publish a public link where walk-in customers order like at a kiosk: they pay the flat
          price, upload one room photo and pick colours. You set no price and handle no money —
          every sale earns your shop points, and points buy extra projects and fresh windows on
          expired ones.
        </p>
        <StoreKioskPanel org={shopOrg} />
      </section>
      <section id="customers" style={{ marginBottom: 56, scrollMarginTop: 100 }}>
        <h2 className="display" style={{ fontSize: "clamp(28px, 4vw, 44px)", marginBottom: 8 }}>
          Customers &amp; projects
        </h2>
        <p style={{ font: "300 17px/1.6 var(--serif)", color: "var(--fg-soft)", maxWidth: "52ch", marginBottom: 28 }}>
          Each customer gets one project with their access code. Grant another when they want a second
          room — or they can pay for one themselves from the visualiser.
        </p>
        <RetailerCustomers org={shopOrg} />
      </section>
      {/* Was "your shopfront, your logo, your subdomain". None of those three exist
          yet — the subdomain chip above says so itself ("rolling out"), there is no
          logo upload, and the customer lands on HueVista's own pages. This describes
          what the shop actually gets today: their codes, and none of them shown to
          the customer. */}
      <section id="what-they-see" style={{ marginTop: 56, borderTop: "1px solid var(--rule)", paddingTop: 48, scrollMarginTop: 100 }}>
        <Mono style={{ marginBottom: 18, display: "block" }}>What they see</Mono>
        <h2 className="display" style={{ fontSize: "clamp(32px, 4.5vw, 52px)", marginBottom: 20 }}>Simple. Yours.</h2>
        <p style={{ font: "300 17px/1.6 var(--serif)", color: "var(--fg-soft)", maxWidth: "44ch" }}>The customer enters your code and gets a single instruction: upload a photo. They never see shade codes; they pick by feel. You get the codes.</p>
      </section>
    </>
  );
}
