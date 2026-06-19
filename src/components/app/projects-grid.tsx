"use client";

import Link from "next/link";
import { resolveMediaUrl } from "@/lib/media";
import { Mono } from "@/components/ui/eyebrow";
import type { ProjectSummary } from "@/lib/types";

function statusLabel(s: ProjectSummary["status"]): string {
  switch (s) {
    case "SEGMENTED":
      return "Ready";
    case "SEGMENTING":
      return "Detecting walls…";
    case "FAILED":
      return "Needs attention";
    default:
      return "New";
  }
}

interface ProjectsGridProps {
  /** null while the dashboard's single projects fetch is in flight. */
  projects: ProjectSummary[] | null;
  error: string | null;
}

/**
 * Grid of the signed-in user's projects, newest first. Data arrives via props
 * from DashboardProjects (one fetch shared with the KPI cards). Each card opens
 * the project in the studio, where it loads its SAVED masks / cleaned image
 * from storage — no re-segmentation, no extra AI cost.
 */
export function ProjectsGrid({ projects, error }: ProjectsGridProps) {
  const sorted = projects
    ? [...projects].sort((a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime())
    : null;

  return (
    <section
      className="r-cols-md-2 r-cols-xs-1"
      style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24 }}
    >
      <Link
        href="/atelier"
        className="hv-proj-new"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          aspectRatio: "4 / 5",
          color: "var(--accent)",
          textDecoration: "none",
          background: "var(--surface-soft)",
          borderRadius: "var(--radius)",
        }}
      >
        <span aria-hidden style={{ fontSize: 40, lineHeight: 1 }}>
          +
        </span>
        <Mono brass>New project</Mono>
      </Link>

      {sorted === null &&
        [0, 1, 2].map((i) => (
          <div key={i} className="hv-skel" aria-hidden style={{ aspectRatio: "4 / 5", border: "1px solid var(--rule)" }} />
        ))}

      {error && (
        <p style={{ alignSelf: "center", color: "var(--fg-mute)" }}>
          <Mono>{error}</Mono>
        </p>
      )}

      {sorted !== null && sorted.length === 0 && !error && (
        <p style={{ alignSelf: "center", font: "400 16px/1.4 var(--sans)", color: "var(--fg-soft)" }}>
          No projects yet — start one with a photo.
        </p>
      )}

      {sorted?.map((p) => {
        const thumb = resolveMediaUrl(p.imageUrl);
        return (
          <Link
            key={p.id}
            href={`/atelier?project=${encodeURIComponent(p.id)}`}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <article>
              <div className="hv-proj-thumb" style={{ aspectRatio: "4 / 5", border: "1px solid var(--rule)", borderRadius: "var(--radius)", overflow: "hidden", background: "var(--surface)" }}>
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumb} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : null}
              </div>
              <div style={{ marginTop: 14 }}>
                <h3 style={{ fontFamily: "var(--serif)", fontSize: 22, fontWeight: 600, margin: 0, lineHeight: 1.2 }}>{p.name}</h3>
                <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <Mono>
                    {p.regionCount} region{p.regionCount === 1 ? "" : "s"}
                  </Mono>
                  <span style={{ display: "inline-flex", alignItems: "baseline", gap: 10 }}>
                    {p.updatedAt ? (
                      <Mono>{new Date(p.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</Mono>
                    ) : null}
                    <Mono>{statusLabel(p.status)}</Mono>
                  </span>
                </div>
              </div>
            </article>
          </Link>
        );
      })}
      <style>{`
        .hv-proj-new { border: 1px dashed var(--rule-strong); border-radius: var(--radius); transition: border-color .2s var(--ease), background .2s var(--ease); }
        .hv-proj-new:hover { border-color: var(--accent); }
      `}</style>
    </section>
  );
}
