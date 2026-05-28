import type { Metadata } from "next";
import { getCurrentUser, getUiLocale, getUiVariant } from "@/lib/auth";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { Placeholder } from "@/components/ui/placeholder";
import { LinkButton } from "@/components/ui/button";
import { ClassicDashboard } from "@/components/classic/dashboard";

export const metadata: Metadata = {
  title: "The Suite",
  description: "Your retailer dashboard.",
};

const PROJECTS = [
  { plate: "I", title: "Belgavi 3 BHK", customer: "Suresh K.", shade: "Terracotta · AP-2118", updated: "2 min ago", tone: "terracotta" as const },
  { plate: "II", title: "Park Place Façade", customer: "Anita R.", shade: "Bone China · AP-N101", updated: "Yesterday", tone: "ivory" as const },
  { plate: "III", title: "Patil Bungalow", customer: "Mohan P.", shade: "Sage · AP-7706", updated: "3 days ago", tone: "sage" as const },
  { plate: "IV", title: "Camp Road Studio", customer: "Pooja D.", shade: "Slate · AP-9904", updated: "Last week", tone: "slate" as const },
];

export default async function DashboardPage() {
  const [user, variant, locale] = await Promise.all([getCurrentUser(), getUiVariant(), getUiLocale()]);
  if (variant === "classic") return <ClassicDashboard user={user} locale={locale} />;
  return (
    <>
      <header style={{ marginBottom: 48 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
          <Eyebrow>v · the suite</Eyebrow>
          <Mono>Sharda Paints · Professional tier</Mono>
        </div>
        <h1 className="display" style={{ fontSize: "clamp(48px, 6vw, 84px)" }}>Good morning,<br /><i>{user?.name?.split(" ")[0] ?? "Friend"}.</i></h1>
        <Lead style={{ marginTop: 24 }}>{PROJECTS.length} projects in the room. {user?.name ? "Welcome back to the counter." : "Welcome to HueVista."}</Lead>
      </header>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24, marginBottom: 64 }}>
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
      <section style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 32 }}>
        <h2 className="display" style={{ fontSize: 48 }}>Recent <i>projects.</i></h2>
        <LinkButton href="/atelier" variant="ghost" size="sm">New project <span className="arr">→</span></LinkButton>
      </section>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24 }}>
        {PROJECTS.map((p) => (
          <article key={p.plate}>
            <Placeholder tone={p.tone} grain corners tag={`No. ${p.plate}`} style={{ aspectRatio: "4 / 5" }} />
            <div style={{ marginTop: 14 }}>
              <span style={{ fontFamily: "var(--serif)", fontSize: 22 }}>{p.title}</span>
              <div><Mono>{p.shade}</Mono></div>
              <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ font: "300 italic 15px/1 var(--serif)", color: "var(--fg-mute)" }}>{p.customer}</span>
                <Mono>{p.updated}</Mono>
              </div>
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
