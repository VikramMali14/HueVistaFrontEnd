"use client";

import { useEffect, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { api } from "@/lib/api";
import type { ProjectSummary } from "@/lib/types";

/**
 * Real dashboard KPIs derived from the signed-in user's projects (replaces the
 * old hardcoded "60 renders / ₹37,400 closed" sample numbers).
 */
export function DashboardStats() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listProjects()
      .then((p) => !cancelled && setProjects(p))
      .catch(() => !cancelled && setProjects([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const loading = projects === null;
  const total = projects?.length ?? 0;
  const ready = projects?.filter((p) => p.status === "SEGMENTED").length ?? 0;
  const attention = projects?.filter((p) => p.status === "FAILED").length ?? 0;
  const regions = projects?.reduce((n, p) => n + (p.regionCount ?? 0), 0) ?? 0;

  const cards: ReadonlyArray<{ n: number; l: string; sub: string }> = [
    { n: total, l: "Projects saved", sub: "in your suite" },
    { n: ready, l: "Ready", sub: "walls detected" },
    { n: regions, l: "Regions", sub: "across all projects" },
    { n: attention, l: "Needs attention", sub: "detection failed" },
  ];

  return (
    <section
      className="r-cols-md-2 r-cols-xs-1"
      style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24, marginBottom: 64 }}
    >
      {cards.map((m) => (
        <div key={m.l} style={{ border: "1px solid var(--rule)", padding: 28 }}>
          <Mono>{m.l}</Mono>
          <div className="display" style={{ fontSize: 56, marginTop: 12 }}>
            {loading ? "—" : m.n}
          </div>
          <Mono style={{ marginTop: 8 }}>{m.sub}</Mono>
        </div>
      ))}
    </section>
  );
}
