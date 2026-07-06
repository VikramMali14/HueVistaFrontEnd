import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { LinkButton } from "@/components/ui/button";
import { AccountVerification } from "@/components/app/account-verification";
import { CustomerAccessBanner } from "@/components/app/customer-access-banner";
import { DashboardProjects } from "@/components/app/dashboard-projects";
import { PlanBanner } from "@/components/app/plan-banner";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your retailer dashboard.",
};

interface DashboardPageProps {
  searchParams: Promise<{ denied?: string; subscribed?: string }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const [{ denied, subscribed }, user] = await Promise.all([searchParams, getCurrentUser()]);
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
      <header style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
          <Eyebrow>Dashboard</Eyebrow>
          <Mono>{user?.role === "ADMIN" ? "Administrator" : user?.role === "RETAILER" ? "Retailer account" : "Your account"}</Mono>
        </div>
        <h1 className="display" style={{ fontSize: "clamp(36px, 4.5vw, 56px)" }}>{greeting},<br />{user?.name?.split(" ")[0] ?? "Friend"}.</h1>
        <Lead style={{ marginTop: 24 }}>Pick up a saved project, or start a new one.</Lead>
        {user?.role !== "RETAILER" && user?.role !== "ADMIN" && (
          <div style={{ marginTop: 16 }}>
            <LinkButton href="/redeem" variant="ghost" size="sm">Have a shop access code? Redeem it <span className="arr">→</span></LinkButton>
          </div>
        )}
      </header>
      <PlanBanner />
      {user?.role === "CUSTOMER" && <CustomerAccessBanner />}
      <AccountVerification user={user} />
      <DashboardProjects />
    </>
  );
}
