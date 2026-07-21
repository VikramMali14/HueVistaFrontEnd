import type { Metadata } from "next";
import Link from "next/link";
import { getNetworkReport, requireRole } from "@/lib/auth";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { NetworkCreateRetailerForm } from "@/components/network/create-retailer-form";
import { CreatePainterForm } from "@/components/network/create-painter-form";
import { NetworkReportView } from "@/components/network/network-report";

export const metadata: Metadata = {
  title: "My network",
  description: "Your downline — create accounts and read the reports in one place.",
};

/**
 * The one-place network console for the account hierarchy
 * (admin → distributor → retailer → painter):
 *
 *  - ADMIN sees the whole platform: every distributor, shop and painter, as a
 *    tree and as flat report tables. (Creation of distributors/shops lives on
 *    the /admin console.)
 *  - DISTRIBUTOR creates their shops here and sees their shops + those shops'
 *    painters.
 *  - RETAILER creates their painters here and sees their painter roster.
 *
 * Customers are deliberately not in this tree — they enter through the shop's
 * access codes on /redeem, which the report counts per shop.
 */
export default async function NetworkPage() {
  const user = await requireRole(["ADMIN", "DISTRIBUTOR", "RETAILER"]);
  const report = await getNetworkReport();

  return (
    <div style={{ maxWidth: 1080 }}>
      <Eyebrow>
        {user.role === "ADMIN" && "Admin · full network"}
        {user.role === "DISTRIBUTOR" && "Distributor · my shops"}
        {user.role === "RETAILER" && "Shop · my painters"}
      </Eyebrow>
      <h1 className="display" style={{ fontSize: "clamp(34px, 5vw, 56px)", margin: "12px 0 14px" }}>
        {user.role === "RETAILER" ? <>My <i>painters.</i></> : <>My <i>network.</i></>}
      </h1>
      <Lead style={{ maxWidth: "60ch" }}>
        {user.role === "ADMIN" && (
          <>Every distributor, shop and painter on the platform in one place — as a tree, and as
          per-role report tables. Create distributors and shops from the admin console.</>
        )}
        {user.role === "DISTRIBUTOR" && (
          <>Create shop accounts for your retailers — each one is linked to you automatically —
          and follow their painters and customer-code activity below.</>
        )}
        {user.role === "RETAILER" && (
          <>Create painter accounts for your crew — each one is linked to your shop and can sign
          in right away. Prefer painters to join themselves? Invitation codes still work from the
          customer portal.</>
        )}
      </Lead>

      {user.role === "ADMIN" && (
        <p style={{ marginTop: 16 }}>
          <Link href="/admin" style={{ font: "500 13px/1 var(--mono)", color: "var(--accent-soft)" }}>
            Create distributors &amp; shops on the admin console →
          </Link>
        </p>
      )}

      {user.role === "DISTRIBUTOR" && (
        <section style={{ marginTop: 40 }}>
          <h2 className="display" style={{ fontSize: "clamp(24px, 3vw, 34px)", marginBottom: 8 }}>
            Create a shop account
          </h2>
          <p style={{ font: "300 17px/1.6 var(--serif)", color: "var(--fg-soft)", maxWidth: "56ch" }}>
            The shop gets an organization and a free trial, and lands in your network immediately.
            They sign in with the email and initial password you set.
          </p>
          <NetworkCreateRetailerForm />
        </section>
      )}

      {user.role === "RETAILER" && (
        <section style={{ marginTop: 40 }}>
          <h2 className="display" style={{ fontSize: "clamp(24px, 3vw, 34px)", marginBottom: 8 }}>
            Create a painter account
          </h2>
          <p style={{ font: "300 17px/1.6 var(--serif)", color: "var(--fg-soft)", maxWidth: "56ch" }}>
            The painter is linked to your shop and can sign in right away with the email and
            initial password you set.
          </p>
          <CreatePainterForm />
        </section>
      )}

      <section style={{ marginTop: 64, borderTop: "1px solid var(--rule)", paddingTop: 44 }}>
        <h2 className="display" style={{ fontSize: "clamp(24px, 3vw, 34px)", marginBottom: 20 }}>
          {user.role === "RETAILER" ? "Painter roster" : "Network report"}
        </h2>
        <NetworkReportView report={report} />
      </section>
    </div>
  );
}
