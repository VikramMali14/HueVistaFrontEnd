"use client";

import { useState } from "react";
import Link from "next/link";
import { resolveMediaUrl } from "@/lib/media";
import { Mono } from "@/components/ui/eyebrow";
import { ImageCompare } from "@/components/ui/image-compare";
import type { ProjectSummary } from "@/lib/types";

// Progressive reveal: 11 projects to start, then 8 more per "Load more" click.
// The dashboard fetches every project once (shared with the KPI cards), so this
// paginates the render only — the stats above still count the full set.
const INITIAL_VISIBLE = 11;
const LOAD_STEP = 8;

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
 * from DashboardProjects (one fetch shared with the KPI cards). Cards whose
 * photo has been AI-cleaned show a raw-vs-cleaned before/after slider; the
 * title opens the project in the studio.
 */
export function ProjectsGrid({ projects, error }: ProjectsGridProps) {
  const [visible, setVisible] = useState(INITIAL_VISIBLE);

  const sorted = projects
    ? [...projects].sort((a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime())
    : null;

  const shown = sorted ? sorted.slice(0, visible) : null;
  const remaining = sorted ? sorted.length - (shown?.length ?? 0) : 0;

  return (
    <>
      <section
        className="r-cols-md-2 r-cols-xs-1"
        style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24, alignItems: "start" }}
      >
        {/* New-project tile: 4/5 media + an invisible caption spacer so its total
            height matches a project card exactly (every card is one size). */}
        <div style={{ display: "flex", flexDirection: "column" }}>
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
          <div className="hv-proj-caption" aria-hidden style={{ visibility: "hidden" }}>
            <h3 className="hv-proj-title">&nbsp;</h3>
            <div style={{ marginTop: 8 }}>
              <Mono>&nbsp;</Mono>
            </div>
          </div>
        </div>

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

        {shown?.map((p) => {
          const thumb = resolveMediaUrl(p.imageUrl);
          const cleaned = p.cleanedImageUrl ? resolveMediaUrl(p.cleanedImageUrl) : null;
          const href = `/atelier?project=${encodeURIComponent(p.id)}`;
          return (
            <article key={p.id}>
              <div className="hv-proj-thumb" style={{ aspectRatio: "4 / 5", border: "1px solid var(--rule)", borderRadius: "var(--radius)", overflow: "hidden", background: "var(--surface)" }}>
                {thumb && cleaned ? (
                  <ImageCompare beforeSrc={thumb} afterSrc={cleaned} alt={p.name} />
                ) : thumb ? (
                  <Link href={href} aria-label={`Open ${p.name}`} style={{ display: "block", width: "100%", height: "100%" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={thumb} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </Link>
                ) : (
                  <Link href={href} aria-label={`Open ${p.name}`} style={{ display: "block", width: "100%", height: "100%" }} />
                )}
              </div>
              <div className="hv-proj-caption">
                <Link href={href} style={{ textDecoration: "none", color: "inherit" }}>
                  <h3 className="hv-proj-title">{p.name}</h3>
                </Link>
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
          );
        })}
        <style>{`
          .hv-proj-new { border: 1px dashed var(--rule-strong); border-radius: var(--radius); transition: border-color .2s var(--ease), background .2s var(--ease); }
          .hv-proj-new:hover { border-color: var(--accent); }
          .hv-proj-thumb a:hover img { transform: scale(1.04); }
          .hv-proj-caption { margin-top: 14px; }
          /* Fixed font + a reserved two-line clamp so every card's caption is the
             same height — cards stay one uniform size regardless of title length. */
          .hv-proj-title {
            font: 600 22px/1.2 var(--serif);
            margin: 0;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            min-height: 2.4em;
            transition: color .2s var(--ease);
          }
          a:hover .hv-proj-title { color: var(--accent); }
        `}</style>
      </section>

      {remaining > 0 && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 44 }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setVisible((v) => v + LOAD_STEP)}
          >
            Load more <span className="arr">→</span>
          </button>
        </div>
      )}
    </>
  );
}
