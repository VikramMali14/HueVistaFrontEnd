import type { Metadata } from "next";
import Link from "next/link";
import {
  adjustSubscriptionAction,
  approveShopLeadAction,
  dismissShopLeadAction,
  getAuditLog,
  getDistributorOptions,
  getShopLeads,
  getUserSubscriptionAction,
  grantSubscriptionAction,
  requireRole,
  searchUsersAction,
} from "@/lib/auth";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { CreateRetailerForm } from "@/components/admin/create-retailer-form";
import { CreateDistributorForm } from "@/components/admin/create-distributor-form";
import { ShopLeads } from "@/components/admin/shop-leads";
import { SubscriptionManager } from "@/components/admin/subscription-manager";
import { UserSearch } from "@/components/admin/user-search";
import { AuditLog } from "@/components/admin/audit-log";
import { SectionNav } from "@/components/ui/section-nav";

export const metadata: Metadata = {
  title: "Admin · Accounts",
  description: "Create distributors and shops, and work the shop-account request queue.",
};

const SECTION_HEAD: React.CSSProperties = {
  marginTop: 72,
  borderTop: "1px solid var(--rule)",
  paddingTop: 48,
  scrollMarginTop: 100,
};
const H2: React.CSSProperties = { fontSize: "clamp(26px, 3.5vw, 40px)", marginBottom: 8 };
const BLURB: React.CSSProperties = {
  font: "300 17px/1.6 var(--serif)",
  color: "var(--fg-soft)",
  maxWidth: "58ch",
  marginBottom: 24,
};

/**
 * The admin console for accounts.
 *
 * Ordered the way the work actually arrives: the request queue first (shops that
 * asked and are waiting), then creating a shop yourself, then distributors, then
 * the money and the record. The hierarchy is spelled out at the top because
 * every section below is a move within it, and the page used to assume you
 * already knew that.
 */
export default async function AdminPage() {
  await requireRole(["ADMIN"]);
  const [leads, distributors, audit] = await Promise.all([
    getShopLeads(),
    getDistributorOptions(),
    getAuditLog(),
  ]);
  const waiting = leads?.filter((l) => l.readyToCreate).length ?? 0;

  return (
    // Wide enough that the working sections (request queue, user search, audit
    // trail) actually use a desktop screen; prose stays readable via its own caps.
    <div style={{ maxWidth: 1080 }}>
      <Eyebrow>Admin · accounts</Eyebrow>
      <h1 className="display" style={{ fontSize: "clamp(34px, 5vw, 56px)", margin: "12px 0 14px" }}>
        Distributors, shops <i>and who asked.</i>
      </h1>
      <Lead style={{ maxWidth: "58ch" }}>
        Every account sits somewhere in one chain. You create distributors; a distributor creates
        its shops; a shop creates its painters. Shops that ask for an account themselves land in
        the queue below, ready to open with one click.
      </Lead>

      {/* The chain, stated once, so every section below reads as a move within it. */}
      <div
        style={{
          marginTop: 28,
          padding: "18px 20px",
          border: "1px solid var(--rule-strong)",
          background: "var(--surface-soft)",
          borderRadius: 8,
        }}
      >
        <p style={{ margin: 0, font: "400 12px/1.6 var(--mono)", letterSpacing: ".16em", textTransform: "uppercase", color: "var(--fg-mute)" }}>
          You (admin) → Distributor → Shop → Painter
        </p>
        <ul style={{ margin: "12px 0 0", paddingLeft: 20, font: "300 16px/1.7 var(--serif)", color: "var(--fg-soft)" }}>
          <li>
            A <strong>shop</strong> always belongs under one <strong>distributor</strong>. When no
            partner distributor brought them in, that is <strong>HueVista Direct</strong> — ours —
            so no shop is ever left outside the network.
          </li>
          <li>
            Every shop opens on the <strong>free plan</strong>. A paid plan is only ever bought,
            from inside the app; there is nothing here that hands one out at signup.
          </li>
          <li>
            Shop owners choose their own password when they request an account. It is stored
            scrambled, so it is never shown to you and never appears in a log.
          </li>
        </ul>
      </div>

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
        <Link href="/admin/free-projects" style={{ font: "500 13px/1 var(--mono)", color: "var(--accent-soft)" }}>
          Free projects →
        </Link>
      </p>

      {/* Fixed side menu — the working sections are a long scroll apart. */}
      <SectionNav
        items={[
          {
            id: "shop-requests",
            label: waiting > 0 ? `Shop requests (${waiting})` : "Shop requests",
            hint: "Shops waiting for an account",
          },
          { id: "create-shop", label: "Create a shop", hint: "Open one yourself" },
          { id: "create-distributor", label: "Create a distributor", hint: "A partner above shops" },
          { id: "subscriptions", label: "Subscriptions", hint: "Grant or extend a plan" },
          { id: "find-user", label: "Find a user", hint: "Look up by name or email" },
          { id: "audit-trail", label: "Audit trail", hint: "Every sensitive action" },
        ]}
      />

      <section id="shop-requests" style={{ ...SECTION_HEAD, marginTop: 56 }}>
        <h2 className="display" style={H2}>
          1 · Shop requests {waiting > 0 && <span style={{ color: "var(--accent)" }}>· {waiting} waiting</span>}
        </h2>
        <p style={BLURB}>
          Shops that filled in the public form and confirmed their email. Every detail you need is
          already on the request — including the password they chose, which you never see — so
          creating the account is choosing a distributor and pressing one button. Anything you
          don&rsquo;t get to opens by itself 24 hours after the email was confirmed.
        </p>
        <ShopLeads
          initial={leads}
          distributors={distributors}
          approveAction={approveShopLeadAction}
          dismissAction={dismissShopLeadAction}
        />
      </section>

      <section id="create-shop" style={SECTION_HEAD}>
        <h2 className="display" style={H2}>2 · Create a shop yourself</h2>
        <p style={BLURB}>
          For a shop that didn&rsquo;t use the form — one you signed up in person, or one a
          distributor asked you to add. Pick the distributor it belongs under; leave it on
          HueVista Direct if it&rsquo;s yours. The shop opens on the free plan and gets an email
          with a sign-in link, and you hand over the password you set here.
        </p>
        <CreateRetailerForm distributors={distributors} />
      </section>

      <section id="create-distributor" style={SECTION_HEAD}>
        <h2 className="display" style={H2}>3 · Create a distributor</h2>
        <p style={BLURB}>
          Distributors sit above shops. Once created, a distributor provisions its own shops &mdash;
          each one links to them automatically &mdash; decides which paint companies and pages
          those shops can reach, and every shop&rsquo;s painters and customer activity roll up into
          your network report.
        </p>
        <CreateDistributorForm />
      </section>

      <section id="subscriptions" style={SECTION_HEAD}>
        <h2 className="display" style={H2}>4 · Subscriptions</h2>
        <p style={BLURB}>
          Shops buy their own plans; this is the override for when something went wrong &mdash; a
          payment that never landed, a refund to honour, a top-up you promised. Every grant here is
          recorded in the audit trail below. Find the user first.
        </p>
        <SubscriptionManager
          searchAction={searchUsersAction}
          getSubscriptionAction={getUserSubscriptionAction}
          grantAction={grantSubscriptionAction}
          adjustAction={adjustSubscriptionAction}
        />
      </section>

      <section id="find-user" style={SECTION_HEAD}>
        <h2 className="display" style={H2}>5 · Find a user</h2>
        <p style={BLURB}>
          Look anyone up by name or email — shop owners, customers and admins alike.
        </p>
        <UserSearch searchAction={searchUsersAction} />
      </section>

      <section id="audit-trail" style={SECTION_HEAD}>
        <h2 className="display" style={H2}>6 · Audit trail</h2>
        <p style={BLURB}>
          Every sensitive action the platform records — accounts created from requests, role
          changes, deletions, password changes, subscription events. Newest first; filter by action
          and load more as needed.
        </p>
        <AuditLog initial={audit} refreshAction={getAuditLog} />
      </section>
    </div>
  );
}
