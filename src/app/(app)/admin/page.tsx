import type { Metadata } from "next";
import Link from "next/link";
import {
  getAuditLog,
  getShopLeads,
  requireRole,
  searchUsersAction,
  updateShopLeadStatusAction,
} from "@/lib/auth";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { CreateRetailerForm } from "@/components/admin/create-retailer-form";
import { ShopLeads } from "@/components/admin/shop-leads";
import { UserSearch } from "@/components/admin/user-search";

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
  const [leads, audit] = await Promise.all([getShopLeads(), getAuditLog()]);
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

      <section style={{ marginTop: 72, borderTop: "1px solid var(--rule)", paddingTop: 48 }}>
        <h2 className="display" style={{ fontSize: "clamp(26px, 3.5vw, 40px)", marginBottom: 8 }}>
          Find a user
        </h2>
        <p style={{ font: "300 17px/1.6 var(--serif)", color: "var(--fg-soft)", maxWidth: "56ch", marginBottom: 24 }}>
          Search every account by name or email — shows role, verification state and join date.
        </p>
        <UserSearch action={searchUsersAction} />
      </section>

      <section style={{ marginTop: 72, borderTop: "1px solid var(--rule)", paddingTop: 48 }}>
        <h2 className="display" style={{ fontSize: "clamp(26px, 3.5vw, 40px)", marginBottom: 8 }}>
          Recent activity
        </h2>
        <p style={{ font: "300 17px/1.6 var(--serif)", color: "var(--fg-soft)", maxWidth: "56ch", marginBottom: 24 }}>
          The audit trail: role changes, deletions, session revocations, subscription events —
          newest first, latest 50.
        </p>
        {audit.length === 0 ? (
          <p style={{ font: "300 16px/1.5 var(--serif)", color: "var(--fg-mute)" }}>
            Nothing recorded yet. Sensitive actions land here as they happen.
          </p>
        ) : (
          <div style={{ border: "1px solid var(--rule)", borderRadius: 8, overflow: "hidden" }}>
            {audit.map((entry, i) => (
              <div
                key={entry.id}
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "baseline",
                  gap: "4px 14px",
                  padding: "12px 16px",
                  borderBottom: i === audit.length - 1 ? "none" : "1px solid var(--rule)",
                  background: i % 2 === 0 ? "var(--surface-soft)" : "transparent",
                }}
              >
                <Mono brass>{entry.action}</Mono>
                <span style={{ font: "400 14px/1.4 var(--sans)", color: "var(--fg-soft)" }}>
                  {entry.actorEmail ?? entry.actorUserId ?? "system"}
                </span>
                {entry.targetType && (
                  <Mono>
                    {entry.targetType}
                    {entry.targetId ? ` · ${entry.targetId.slice(0, 8)}…` : ""}
                  </Mono>
                )}
                {entry.detail && (
                  <span style={{ font: "300 italic 14px/1.4 var(--serif)", color: "var(--fg-mute)" }}>
                    {entry.detail}
                  </span>
                )}
                {entry.createdAt && (
                  <span style={{ marginLeft: "auto", font: "400 11.5px/1 var(--mono)", color: "var(--fg-mute)" }}>
                    {new Date(entry.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
