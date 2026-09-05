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
import { HvCodeConverter } from "@/components/app/hv-code-converter";
import { PlanBanner } from "@/components/app/plan-banner";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your retailer dashboard.",
};

interface DashboardPageProps {
  searchParams: Promise<{ denied?: string; page?: string; need?: string; subscribed?: string }>;
}

/** Plural, human names for the roles a page can require — "administrators". */
const ROLE_NAMES: Record<string, string> = {
  ADMIN: "administrators",
  RETAILER: "retailers",
  DISTRIBUTOR: "distributors",
  PAINTER: "painters",
  CUSTOMER: "customers",
};

/** "administrators", or "retailers and administrators" — whoever the page is for. */
function audience(need: string | undefined): string {
  const names = (need ?? "")
    .split(",")
    .map((r) => ROLE_NAMES[r.trim().toUpperCase()])
    .filter(Boolean);
  if (names.length === 0) return "another kind of account";
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const [{ denied, page, need, subscribed }, { user, unavailable }, libraryLive] = await Promise.all([
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
          That page is reserved for {audience(need)}. We brought you back to your dashboard.
        </div>
      )}
      {denied === "noshop" && (
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
          {/* The customer half of the denials above. "My products" belongs to a
              customer a shop onboarded, and a code is the only thing that creates
              that link — so this names the code rather than a person to ring or a
              button to press, because redeeming one is the entire fix. */}
          Your products are the ones a paint shop unlocks for you, and no shop is
          behind this account yet.{" "}
          <Link href="/unlock" style={{ color: "var(--accent-text)" }}>
            Unlock with a shop code
          </Link>{" "}
          and they&apos;ll appear here.
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
          <Link href="/plan" style={{ color: "var(--accent-text)" }}>Choose a plan</Link> to switch it on —
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
      <header className="hv-dash-head" style={{ marginBottom: 32 }}>
        {/* See .hv-aura in globals.css — the same wash the other app screens open with,
            so a shop moving between its dashboard and its billing pages is moving around
            one product rather than through three. */}
        <div className="hv-aura" aria-hidden />
        <div className="hv-rise" style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
          <Eyebrow>Dashboard</Eyebrow>
          <Mono>{user?.role === "ADMIN" ? "Administrator" : user?.role === "DISTRIBUTOR" ? "Distributor account" : user?.role === "RETAILER" ? "Retailer account" : user?.role === "PAINTER" ? "Painter account" : unavailable ? "" : "Your account"}</Mono>
        </div>
        <h1 className="display hv-rise hv-rise-1" style={{ fontSize: "clamp(36px, 4.5vw, 56px)" }}>{greeting}{user?.name ? <><br />{user.name.split(" ")[0]}</> : unavailable ? null : <><br />Friend</>}.</h1>
        <Lead className="hv-rise hv-rise-2" style={{ marginTop: 24 }}>Pick up a saved project, or start a new one.</Lead>
        {/* Role-specific CTA: the customer redeem flow is only for walk-in
            customers. Retailers/admins run shops; distributors and painters
            manage their own downline/jobs — none of them redeem shop codes. */}
        {!unavailable && user?.role === "CUSTOMER" && (
          <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <LinkButton href="/my-projects" variant="ghost" size="sm">Your projects &amp; credits <span className="arr">→</span></LinkButton>
            {/* "Add", not "unlock": the code joins this account now rather than
                replacing it, and the old wording described a page that signed them
                out of the very projects it offered to unlock. */}
            <LinkButton href="/unlock" variant="ghost" size="sm">Have a shop access code? Add it here <span className="arr">→</span></LinkButton>
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
      {/* Not for a customer. They hold no subscription and never will — the plan is a
          shop's thing — so the banner could only ever render nothing, and the request
          behind it could only ever 404. Asking anyway filled the console of every
          customer session with failures that look exactly like the real ones, which is
          how a genuine error hides. Their own standing is the banner below. */}
      {user?.role !== "CUSTOMER" && <PlanBanner />}
      {user?.role === "CUSTOMER" && <CustomerAccessBanner />}
      <AccountVerification user={user} />
      {/* A customer with nothing left is told what it costs to carry on, not to
          upload a photo the studio will refuse. */}
      <DashboardProjects isCustomer={user?.role === "CUSTOMER"} />

      {/* The code tools sit under the rooms, not over them.
          Reading a customer's code IS the counter's first tool and it has not moved
          off the dashboard — but it was the first thing under "Pick up a saved
          project, or start a new one", ahead of the projects that sentence promises,
          and with a six-line explanation attached. On a phone that put the first
          room about 1,600px down a page nearly six screens tall, so the common act
          (open yesterday's room) paid for the occasional one (decode a code a
          customer is holding) on every single visit. Same page, one scroll, in the
          order the greeting already describes. */}
      {!unavailable && (user?.role === "RETAILER" || user?.role === "ADMIN") && <HvCodeConverter />}
      {/* And below it, the older pattern debugger — still shown only to shops that
          run their own numbering, because it answers a different question (what does
          MY prefix/suffix pattern make of this) that most shops never ask. */}
      {!unavailable && (user?.role === "RETAILER" || user?.role === "ADMIN") && <DashboardCodeChecker />}

      <style>{`
        .hv-dash-head { position: relative; }
        .hv-dash-head > *:not(.hv-aura) { position: relative; z-index: 1; }
      `}</style>
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
