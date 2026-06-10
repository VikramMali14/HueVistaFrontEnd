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
  const ready = projects?.filter((p) => p.status === "SEGMENTED").length ?? 0;
  const attention = projects?.filter((p) => p.status === "FAILED").length ?? 0;
  const surfaces = projects?.reduce((n, p) => n + (p.regionCount ?? 0), 0) ?? 0;

  if (!loading && total === 0) return null;

  const cards: ReadonlyArray<{ n: number; l: string; sub: string }> = [
    { n: total, l: "Projects saved", sub: "in your suite" },
    { n: ready, l: "Ready", sub: "walls detected" },
    { n: surfaces, l: "Walls & surfaces", sub: "across all projects" },
    { n: attention, l: "Needs attention", sub: "detection failed — reopen in Studio" },
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
            {loading ? "—" : <CountUp value={m.n} />}
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
