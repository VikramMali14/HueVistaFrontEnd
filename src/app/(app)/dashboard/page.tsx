import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUserResult } from "@/lib/auth";
import { libraryHasRooms } from "@/lib/free-projects-server";
import { FEATURE_LABELS, SHOP_PAINTER_MODULE_ENABLED } from "@/lib/features";
import type { AppFeatureKey } from "@/lib/types";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { LinkButton } from "@/components/ui/button";
import { AccountVerification } from "@/components/app/account-verification";
import { CustomerAccessBanner } from "@/components/app/customer-access-banner";
import { DashboardProjects } from "@/components/app/dashboard-projects";
import { DashboardCodeChecker } from "@/components/app/dashboard-code-checker";
import { PlanBanner } from "@/components/app/plan-banner";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your retailer dashboard.",
};

interface DashboardPageProps {
  searchParams: Promise<{ denied?: string; page?: string; subscribed?: string }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const [{ denied, page, subscribed }, { user, unavailable }, libraryLive] = await Promise.all([
    searchParams,
    getCurrentUserResult(),
    libraryHasRooms(),
  ]);
  // The audience is India-only, so IST is the right clock for the greeting.
  const h = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(new Date()));
  const greeting = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return (
    <>
      {denied === "role" && (
        <div
          role="alert"
          style={{
            marginBottom: 24,
            padding: "12px 16px",
            border: "1px solid var(--rule-strong)",
            background: "var(--surface-soft)",
            color: "var(--fg)",
            font: "300 16px/1.4 var(--serif)",
            borderRadius: "var(--radius)",
          }}
        >
          That page is reserved for retailers and administrators. We brought you back to your dashboard.
        </div>
      )}
      {denied === "feature" && (
        <div
          role="alert"
          style={{
            marginBottom: 24,
            padding: "12px 16px",
            border: "1px solid var(--rule-strong)",
            background: "var(--surface-soft)",
            color: "var(--fg)",
            font: "300 16px/1.4 var(--serif)",
            borderRadius: "var(--radius)",
          }}
        >
          {/* Naming the distributor matters: this is the one denial the shop
              cannot resolve themselves, and without saying so it reads as a bug. */}
          {featureLabel(page)} isn&apos;t switched on for your shop. Ask your distributor to enable it.
        </div>
      )}
      {denied === "plan" && (
        <div
          role="alert"
          style={{
            marginBottom: 24,
            padding: "12px 16px",
            border: "1px solid var(--rule-strong)",
            background: "var(--surface-soft)",
            color: "var(--fg)",
            font: "300 16px/1.4 var(--serif)",
            borderRadius: "var(--radius)",
          }}
        >
          {/* The opposite of the distributor denial above: this one the shop lifts
              itself, so it names the button rather than a person to ring. */}
          {featureLabel(page)} isn&apos;t part of the free plan.{" "}
          <Link href="/plan" style={{ color: "var(--accent)" }}>Choose a plan</Link> to switch it on —
          every paid tier includes it.
        </div>
      )}
      {subscribed === "1" && (
        <div
          role="status"
          style={{
            marginBottom: 24,
            padding: "12px 16px",
            border: "1px solid var(--accent)",
            background: "var(--surface-soft)",
            color: "var(--fg)",
            font: "300 16px/1.4 var(--serif)",
            borderRadius: "var(--radius)",
          }}
        >
          You&rsquo;re all set — your subscription is active. Welcome aboard.
        </div>
      )}
      {unavailable && (
        <div
          role="alert"
          style={{
            marginBottom: 24,
            padding: "12px 16px",
            border: "1px solid var(--rule-strong)",
            background: "var(--surface-soft)",
            color: "var(--fg)",
            font: "300 16px/1.4 var(--serif)",
            borderRadius: "var(--radius)",
          }}
        >
          We couldn&rsquo;t load your account details just now — you&rsquo;re still signed in. Refresh the page to
          try again.
        </div>
      )}
      <header style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
          <Eyebrow>Dashboard</Eyebrow>
          <Mono>{user?.role === "ADMIN" ? "Administrator" : user?.role === "DISTRIBUTOR" ? "Distributor account" : user?.role === "RETAILER" ? "Retailer account" : user?.role === "PAINTER" ? "Painter account" : unavailable ? "" : "Your account"}</Mono>
        </div>
        <h1 className="display" style={{ fontSize: "clamp(36px, 4.5vw, 56px)" }}>{greeting}{user?.name ? <><br />{user.name.split(" ")[0]}</> : unavailable ? null : <><br />Friend</>}.</h1>
        <Lead style={{ marginTop: 24 }}>Pick up a saved project, or start a new one.</Lead>
        {/* Role-specific CTA: the customer redeem flow is only for walk-in
            customers. Retailers/admins run shops; distributors and painters
            manage their own downline/jobs — none of them redeem shop codes. */}
        {!unavailable && user?.role === "CUSTOMER" && (
          <div style={{ marginTop: 16 }}>
            <LinkButton href="/unlock" variant="ghost" size="sm">Have a shop access code? Unlock your projects <span className="arr">→</span></LinkButton>
          </div>
        )}
        {/* Distributors and retailers get a direct line to their network console —
            but a shop's console is the painter module, which is still in testing,
            so the shortcut follows the same constant as the nav tab and the page
            itself rather than pointing at a route that would bounce them. */}
        {!unavailable && (user?.role === "DISTRIBUTOR" || (user?.role === "RETAILER" && SHOP_PAINTER_MODULE_ENABLED)) && (
          <div style={{ marginTop: 16 }}>
            <LinkButton href="/network" variant="ghost" size="sm">
              {user?.role === "DISTRIBUTOR" ? "Manage your shops & reports" : "Manage your painters & reports"} <span className="arr">→</span>
            </LinkButton>
          </div>
        )}
        {/* Every role, because opening a free room costs nothing to serve and asks
            only for a session. Shown only when a room is actually on the shelf —
            the same rule the nav tab follows, so the dashboard never offers a page
            that would open empty. */}
        {libraryLive && (
          <div style={{ marginTop: 16 }}>
            <LinkButton href="/library" variant="ghost" size="sm">
              Start from a ready-made room <span className="arr">→</span>
            </LinkButton>
          </div>
        )}
      </header>
      {/* Retailers who use a custom shade-code scheme get the debugger up top —
          read a customer code or find one without opening the portal. */}
      {!unavailable && (user?.role === "RETAILER" || user?.role === "ADMIN") && <DashboardCodeChecker />}
      <PlanBanner />
      {user?.role === "CUSTOMER" && <CustomerAccessBanner />}
      <AccountVerification user={user} />
      <DashboardProjects />
    </>
  );
}

/**
 * Human name for the page a shop was just bounced off, from the ?page= key.
 * Falls back to a generic phrase so an unknown or tampered key still reads as a
 * sentence rather than printing the raw parameter back at the user.
 */
function featureLabel(key: string | undefined): string {
  const label = key ? FEATURE_LABELS[key as AppFeatureKey] : undefined;
  return label ? `"${label}"` : "That page";
}
