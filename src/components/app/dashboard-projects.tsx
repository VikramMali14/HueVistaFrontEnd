"use client";

import { useEffect, useState } from "react";
import { api, HttpError } from "@/lib/api";
import { LinkButton } from "@/components/ui/button";
import { DashboardStats } from "@/components/app/dashboard-stats";
import { ProjectsGrid } from "@/components/app/projects-grid";
import type { ProjectSummary } from "@/lib/types";

/**
 * Single fetch for the dashboard's project data — feeds both the KPI cards and
 * the projects grid so the two sections never load (or disagree) separately.
 */
export function DashboardProjects() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.listProjects();
        if (!cancelled) setProjects(list);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof HttpError ? err.message : "Could not load your projects.");
        setProjects([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <DashboardStats projects={projects} />
      <section style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 32 }}>
        <h2 className="display" style={{ fontSize: 48 }}>Recent projects</h2>
        <LinkButton href="/atelier" variant="ghost" size="sm">New project <span className="arr">→</span></LinkButton>
      </section>
      <ProjectsGrid projects={projects} error={error} />
    </>
  );
}
