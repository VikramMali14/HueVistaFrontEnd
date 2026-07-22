import type { Metadata } from "next";
import Link from "next/link";
import { adjustSubscriptionAction, decideWalletRedemptionAction, getAuditLog, getShopLeads, getUserSubscriptionAction, getWalletRedemptions, grantSubscriptionAction, requireRole, searchUsersAction, updateShopLeadStatusAction } from "@/lib/auth";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { CreateRetailerForm } from "@/components/admin/create-retailer-form";
import { CreateDistributorForm } from "@/components/admin/create-distributor-form";
import { ShopLeads } from "@/components/admin/shop-leads";
import { SubscriptionManager } from "@/components/admin/subscription-manager";
import { UserSearch } from "@/components/admin/user-search";
import { AuditLog } from "@/components/admin/audit-log";
import { WalletRedemptions } from "@/components/admin/wallet-redemptions";
import { SectionNav } from "@/components/ui/section-nav";

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
  const [leads, audit, redemptions] = await Promise.all([
    getShopLeads(),
    getAuditLog(),
    getWalletRedemptions(),
  ]);
  return (
    // Wide enough that the working sections (payout queue, user search, audit
    // trail) actually use a desktop screen; prose stays readable via its own
    // 56ch caps. 760px left half the viewport empty and cramped every table.
    <div style={{ maxWidth: 1080 }}>
      <Eyebrow>Admin · shop accounts</Eyebrow>
      <h1 className="display" style={{ fontSize: "clamp(34px, 5vw, 56px)", margin: "12px 0 14px" }}>
        Create a <i>shop account.</i>
      </h1>
      <Lead style={{ maxWidth: "56ch" }}>
        Provision a retailer with their shop, an organization and a free trial subscription. They sign in with
        the email and initial password you set, then can change it from their account.
      </Lead>
      <p style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: "8px 24px" }}>
        <Link href="/network" style={{ font: "500 13px/1 var(--mono)", color: "var(--accent-soft)" }}>
          Network &amp; reports →
        </Link>
        <Link href="/admin/shades" style={{ font: "500 13px/1 var(--mono)", color: "var(--accent-soft)" }}>
          Upload company shades →
        </Link>
        <Link href="/admin/migration" style={{ font: "500 13px/1 var(--mono)", color: "var(--accent-soft)" }}>
          Maintenance &amp; migration →
        </Link>
        <Link href="/admin/mask-viewer" style={{ font: "500 13px/1 var(--mono)", color: "var(--accent-soft)" }}>
          Mask viewer →
        </Link>
      </p>

      {/* Quick-jump cards — the working sections are a long scroll apart. */}
      <SectionNav
        style={{ margin: "28px 0 40px" }}
        items={[
          { id: "create-distributor", label: "Create distributor", hint: "Provision a distributor account" },
          { id: "shop-requests", label: "Shop requests", hint: "Leads from the public form" },
          { id: "wallet-payouts", label: "Wallet payouts", hint: "Approve kiosk redemptions" },
          { id: "subscriptions", label: "Subscriptions", hint: "Grant or extend a plan" },
          { id: "find-user", label: "Find a user", hint: "Look up by name or email" },
          { id: "audit-trail", label: "Audit trail", hint: "Every sensitive action" },
        ]}
      />
      <CreateRetailerForm />

      <section id="create-distributor" style={{ marginTop: 72, borderTop: "1px solid var(--rule)", paddingTop: 48, scrollMarginTop: 100 }}>
        <h2 className="display" style={{ fontSize: "clamp(26px, 3.5vw, 40px)", marginBottom: 8 }}>
          Create a distributor
        </h2>
        <p style={{ font: "300 17px/1.6 var(--serif)", color: "var(--fg-soft)", maxWidth: "56ch", marginBottom: 24 }}>
          Distributors sit above shops in the network. Once created, a distributor provisions their
          own shop accounts &mdash; each one links to them automatically &mdash; and every shop&rsquo;s
          painters and customer activity roll up into your network report.
        </p>
        <CreateDistributorForm />
      </section>

      <section id="shop-requests" style={{ marginTop: 72, borderTop: "1px solid var(--rule)", paddingTop: 48, scrollMarginTop: 100 }}>
        <h2 className="display" style={{ fontSize: "clamp(26px, 3.5vw, 40px)", marginBottom: 8 }}>
          Shop requests
        </h2>
        <p style={{ font: "300 17px/1.6 var(--serif)", color: "var(--fg-soft)", maxWidth: "56ch", marginBottom: 24 }}>
          Requests from the public &ldquo;bring it to your counter&rdquo; form. Create the account above,
          then mark the lead converted.
        </p>
        <ShopLeads initial={leads} updateAction={updateShopLeadStatusAction} />
      </section>

      <section id="wallet-payouts" style={{ marginTop: 72, borderTop: "1px solid var(--rule)", paddingTop: 48, scrollMarginTop: 100 }}>
        <h2 className="display" style={{ fontSize: "clamp(26px, 3.5vw, 40px)", marginBottom: 8 }}>
          Wallet payouts
        </h2>
        <p style={{ font: "300 17px/1.6 var(--serif)", color: "var(--fg-soft)", maxWidth: "56ch", marginBottom: 24 }}>
          Retailers&rsquo; kiosk-earnings redemption requests. Send the money to the UPI id first,
          then mark it approved; rejecting returns the amount to the shop&rsquo;s wallet.
        </p>
        <WalletRedemptions initial={redemptions} decideAction={decideWalletRedemptionAction} />
      </section>

      <section id="subscriptions" style={{ marginTop: 72, borderTop: "1px solid var(--rule)", paddingTop: 48, scrollMarginTop: 100 }}>
        <h2 className="display" style={{ fontSize: "clamp(26px, 3.5vw, 40px)", marginBottom: 8 }}>
          Subscriptions
        </h2>
        <p style={{ font: "300 17px/1.6 var(--serif)", color: "var(--fg-soft)", maxWidth: "56ch", marginBottom: 24 }}>
          Give a user a plan without a payment, top up their AI image generations, or extend an
          ended subscription to bring it back to life. Find them first.
        </p>
        <SubscriptionManager
          searchAction={searchUsersAction}
          getSubscriptionAction={getUserSubscriptionAction}
          grantAction={grantSubscriptionAction}
          adjustAction={adjustSubscriptionAction}
        />
      </section>

      <section id="find-user" style={{ marginTop: 72, borderTop: "1px solid var(--rule)", paddingTop: 48, scrollMarginTop: 100 }}>
        <h2 className="display" style={{ fontSize: "clamp(26px, 3.5vw, 40px)", marginBottom: 8 }}>
          Find a user
        </h2>
        <p style={{ font: "300 17px/1.6 var(--serif)", color: "var(--fg-soft)", maxWidth: "56ch", marginBottom: 24 }}>
          Look anyone up by name or email — shop owners, customers and admins alike.
        </p>
        <UserSearch searchAction={searchUsersAction} />
      </section>

      <section id="audit-trail" style={{ marginTop: 72, borderTop: "1px solid var(--rule)", paddingTop: 48, scrollMarginTop: 100 }}>
        <h2 className="display" style={{ fontSize: "clamp(26px, 3.5vw, 40px)", marginBottom: 8 }}>
          Audit trail
        </h2>
        <p style={{ font: "300 17px/1.6 var(--serif)", color: "var(--fg-soft)", maxWidth: "56ch", marginBottom: 24 }}>
          Every sensitive action the platform records — role changes, deletions, password
          changes, subscription events. Newest first; filter by action and load more as needed.
        </p>
        <AuditLog initial={audit} refreshAction={getAuditLog} />
      </section>
    </div>
  );
}
