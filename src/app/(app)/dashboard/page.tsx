import type { Metadata } from "next";
import { getCurrentUser, getUiLocale, getUiVariant } from "@/lib/auth";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { LinkButton } from "@/components/ui/button";
import { ClassicDashboard } from "@/components/classic/dashboard";
import { ProjectsGrid } from "@/components/app/projects-grid";

export const metadata: Metadata = {
  title: "The Suite",
  description: "Your retailer dashboard.",
};

interface DashboardPageProps {
  searchParams: Promise<{ denied?: string }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const [{ denied }, user, variant, locale] = await Promise.all([
    searchParams,
    getCurrentUser(),
    getUiVariant(),
    getUiLocale(),
  ]);
  if (variant === "classic") return <ClassicDashboard user={user} locale={locale} />;
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
            font: "300 italic 16px/1.4 var(--serif)",
          }}
        >
          That page is reserved for retailers and administrators. We brought you back to the Suite.
        </div>
      )}
      <header style={{ marginBottom: 48 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
          <Eyebrow>v · the suite</Eyebrow>
          <Mono>{user?.role === "ADMIN" ? "Administrator" : "Sharda Paints · Professional tier"}</Mono>
        </div>
        <h1 className="display" style={{ fontSize: "clamp(48px, 6vw, 84px)" }}>Good morning,<br /><i>{user?.name?.split(" ")[0] ?? "Friend"}.</i></h1>
        <Lead style={{ marginTop: 24 }}>{user?.name ? "Welcome back to the counter." : "Welcome to HueVista."} Pick up a saved project, or start a new one.</Lead>
        <div style={{ marginTop: 16 }}>
          <LinkButton href="/redeem" variant="ghost" size="sm">Have a shop access code? Redeem it <span className="arr">→</span></LinkButton>
        </div>
      </header>
      <section className="r-cols-md-2 r-cols-xs-1" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24, marginBottom: 64 }}>
        {[
          { n: "60", l: "AI renders this month", sub: "Of 60 · Professional" },
          { n: "04", l: "Renders used", sub: "94% remaining" },
          { n: "23", l: "Projects saved", sub: "Across 18 customers" },
          { n: "₹37,400", l: "Closed at the counter", sub: "This month · est." },
        ].map((m, i) => (
          <div key={i} style={{ border: "1px solid var(--rule)", padding: 28 }}>
            <Mono>{m.l}</Mono>
            <div className="display" style={{ fontSize: 56, marginTop: 12 }}>{m.n}</div>
            <Mono style={{ marginTop: 8 }}>{m.sub}</Mono>
          </div>
        ))}
      </section>
      <section style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 32 }}>
        <h2 className="display" style={{ fontSize: 48 }}>Recent <i>projects.</i></h2>
        <LinkButton href="/atelier" variant="ghost" size="sm">New project <span className="arr">→</span></LinkButton>
      </section>
      <ProjectsGrid />
    </>
  );
}
