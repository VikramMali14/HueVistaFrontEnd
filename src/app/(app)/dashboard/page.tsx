import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { LinkButton } from "@/components/ui/button";
import { ProjectsGrid } from "@/components/app/projects-grid";
import { AccountVerification } from "@/components/app/account-verification";
import { DashboardStats } from "@/components/app/dashboard-stats";
import { PlanBanner } from "@/components/app/plan-banner";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your retailer dashboard.",
};

interface DashboardPageProps {
  searchParams: Promise<{ denied?: string }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const [{ denied }, user] = await Promise.all([searchParams, getCurrentUser()]);
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
      <header style={{ marginBottom: 48 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
          <Eyebrow>Dashboard</Eyebrow>
          <Mono>{user?.role === "ADMIN" ? "Administrator" : "Sharda Paints · Professional tier"}</Mono>
        </div>
        <h1 className="display" style={{ fontSize: "clamp(48px, 6vw, 84px)" }}>Good morning,<br />{user?.name?.split(" ")[0] ?? "Friend"}.</h1>
        <Lead style={{ marginTop: 24 }}>{user?.name ? "Welcome back." : "Welcome to HueVista."} Pick up a saved project, or start a new one.</Lead>
        <div style={{ marginTop: 16 }}>
          <LinkButton href="/redeem" variant="ghost" size="sm">Have a shop access code? Redeem it <span className="arr">→</span></LinkButton>
        </div>
      </header>
      <PlanBanner />
      <AccountVerification user={user} />
      <DashboardStats />
      <section style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 32 }}>
        <h2 className="display" style={{ fontSize: 48 }}>Recent projects</h2>
        <LinkButton href="/atelier" variant="ghost" size="sm">New project <span className="arr">→</span></LinkButton>
      </section>
      <ProjectsGrid />
    </>
  );
}
