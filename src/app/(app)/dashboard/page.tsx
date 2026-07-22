import type { Metadata } from "next";
import { getCurrentUserResult } from "@/lib/auth";
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
  searchParams: Promise<{ denied?: string; subscribed?: string }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const [{ denied, subscribed }, { user, unavailable }] = await Promise.all([searchParams, getCurrentUserResult()]);
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
            <LinkButton href="/redeem" variant="ghost" size="sm">Have a shop access code? Redeem it <span className="arr">→</span></LinkButton>
          </div>
        )}
        {/* Distributors and retailers get a direct line to their network console. */}
        {!unavailable && (user?.role === "DISTRIBUTOR" || user?.role === "RETAILER") && (
          <div style={{ marginTop: 16 }}>
            <LinkButton href="/network" variant="ghost" size="sm">
              {user?.role === "DISTRIBUTOR" ? "Manage your shops & reports" : "Manage your painters & reports"} <span className="arr">→</span>
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
