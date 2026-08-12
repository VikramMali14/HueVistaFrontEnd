"use client";

import { Mono } from "@/components/ui/eyebrow";
import { CountUp } from "@/components/ui/count-up";
import type { ProjectSummary } from "@/lib/types";

interface DashboardStatsProps {
  /** null while the dashboard's single projects fetch is in flight. */
  projects: ProjectSummary[] | null;
}

/**
 * Real dashboard KPIs derived from the signed-in user's projects (replaces the
 * old hardcoded "60 renders / ₹37,400 closed" sample numbers). Data arrives via
 * props from DashboardProjects, which fetches once for both stats and grid.
 * Hides itself entirely on a brand-new account — four zeros are pure noise.
 */
export function DashboardStats({ projects }: DashboardStatsProps) {
  const loading = projects === null;
  const total = projects?.length ?? 0;
  // A run that finished and found NOTHING is not ready. It reports SEGMENTED with
  // zero regions, which counted towards "Ready" and opened a studio with no walls,
  // a permanently greyed Apply and nothing the shop could do — the one project that
  // most needs attention was filed under the heading that says it needs none.
  const ready = projects?.filter((p) => p.status === "SEGMENTED" && (p.regionCount ?? 0) > 0).length ?? 0;
  const attention = projects?.filter(
    (p) => p.status === "FAILED" || (p.status === "SEGMENTED" && (p.regionCount ?? 0) === 0),
  ).length ?? 0;
  const surfaces = projects?.reduce((n, p) => n + (p.regionCount ?? 0), 0) ?? 0;

  if (!loading && total === 0) return null;

  // While the fetch is in flight the cards were four "—" placeholders, which then
  // disappeared entirely on a new account and were replaced by the thin plan
  // strip. An em dash where a number belongs reads as a value that failed to
  // load, not as one still loading. Skeletons say "coming" and, on the ordinary
  // case of an account that HAS projects, turn into the numbers in the same slot
  // with no jump.
  if (loading) {
    return (
      <section
        className="r-cols-md-2 r-cols-xs-1"
        aria-hidden
        style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24, marginBottom: 64 }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ border: "1px solid var(--rule)", padding: 28 }}>
            <span className="hv-skel" style={{ width: "58%", height: 12 }} />
            <span className="hv-skel" style={{ width: "40%", height: 46, marginTop: 14 }} />
            <span className="hv-skel" style={{ width: "72%", height: 12, marginTop: 14 }} />
          </div>
        ))}
      </section>
    );
  }

  // Every sub-line names the unit its number is counted in. "Ready · walls
  // detected" sat under a PROJECT count and read as a number of walls, right
  // beside a card that really was counting walls.
  const cards: ReadonlyArray<{ n: number; l: string; sub: string }> = [
    { n: total, l: "Projects saved", sub: "in your suite" },
    { n: ready, l: "Ready", sub: "projects with walls found" },
    { n: surfaces, l: "Walls & surfaces", sub: "regions across all projects" },
    { n: attention, l: "Needs attention", sub: "no walls found — reopen in Studio" },
  ];

  return (
    <section
      className="r-cols-md-2 r-cols-xs-1"
      style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24, marginBottom: 64 }}
    >
      {cards.map((m, i) => (
        <div key={m.l} className="hv-card-in" style={{ border: "1px solid var(--rule)", padding: 28, animationDelay: `${i * 60}ms` }}>
          <Mono>{m.l}</Mono>
          <div className="display" style={{ fontSize: 56, marginTop: 12 }}>
            <CountUp value={m.n} />
          </div>
          <Mono style={{ marginTop: 8 }}>{m.sub}</Mono>
        </div>
      ))}
      <style>{`
        .hv-card-in { animation: hv-stat-in .5s var(--ease) both; }
        @keyframes hv-stat-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .hv-card-in { animation: none; } }
      `}</style>
    </section>
  );
}
