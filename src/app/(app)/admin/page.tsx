import type { Metadata } from "next";
import Link from "next/link";
import { getShopLeads, requireRole, updateShopLeadStatusAction } from "@/lib/auth";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { CreateRetailerForm } from "@/components/admin/create-retailer-form";
import { ShopLeads } from "@/components/admin/shop-leads";

export const metadata: Metadata = {
  title: "Admin · Create shop",
  description: "Provision a new shop (retailer) account.",
};

/**
 * Admin-only "shop signup" page. Shops are NOT self-serve — an admin provisions
 * each retailer here (account + organization + free trial). Gated to ROLE_ADMIN.
 */
export default async function AdminPage() {
  await requireRole(["ADMIN"]);
  const leads = await getShopLeads();
  return (
    <div style={{ maxWidth: 760 }}>
      <Eyebrow>Admin · shop accounts</Eyebrow>
      <h1 className="display" style={{ fontSize: "clamp(34px, 5vw, 56px)", margin: "12px 0 14px" }}>
        Create a <i>shop account.</i>
      </h1>
      <Lead style={{ maxWidth: "56ch" }}>
        Provision a retailer with their shop, an organization and a free trial subscription. They sign in with
        the email and initial password you set, then can change it from their account.
      </Lead>
      <p style={{ marginTop: 16 }}>
        <Link href="/admin/shades" style={{ font: "500 13px/1 var(--mono)", color: "var(--accent-soft)" }}>
          Upload company shades →
        </Link>
      </p>
      <CreateRetailerForm />

      <section style={{ marginTop: 72, borderTop: "1px solid var(--rule)", paddingTop: 48 }}>
        <h2 className="display" style={{ fontSize: "clamp(26px, 3.5vw, 40px)", marginBottom: 8 }}>
          Shop requests
        </h2>
        <p style={{ font: "300 17px/1.6 var(--serif)", color: "var(--fg-soft)", maxWidth: "56ch", marginBottom: 24 }}>
          Requests from the public &ldquo;bring it to your counter&rdquo; form. Create the account above,
          then mark the lead converted.
        </p>
        <ShopLeads initial={leads} updateAction={updateShopLeadStatusAction} />
      </section>
    </div>
  );
}
