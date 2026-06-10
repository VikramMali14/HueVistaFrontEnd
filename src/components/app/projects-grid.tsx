"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, HttpError } from "@/lib/api";
import { resolveMediaUrl } from "@/lib/media";
import { Mono } from "@/components/ui/eyebrow";
import { Spinner } from "@/components/ui/spinner";
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

/**
 * Live grid of the signed-in user's projects (GET /api/projects via the BFF).
 * Each card opens the project in the studio, where it loads its SAVED masks /
 * cleaned image from storage — no re-segmentation, no extra AI cost.
 */
export function ProjectsGrid() {
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
    <section
      className="r-cols-md-2 r-cols-xs-1"
      style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24 }}
    >
      <Link
        href="/atelier"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          aspectRatio: "4 / 5",
          border: "1px dashed var(--rule-strong)",
          color: "var(--accent)",
          textDecoration: "none",
          background: "var(--surface-soft)",
        }}
      >
        <span aria-hidden style={{ fontSize: 40, lineHeight: 1 }}>
          +
        </span>
        <Mono brass>New project</Mono>
      </Link>

      {projects === null && (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, color: "var(--fg-mute)", alignSelf: "center" }}>
          <Spinner size={14} color="var(--accent)" /> <Mono>Loading…</Mono>
        </div>
      )}

      {error && (
        <p style={{ alignSelf: "center", color: "var(--fg-mute)" }}>
          <Mono>{error}</Mono>
        </p>
      )}

      {projects !== null && projects.length === 0 && !error && (
        <p style={{ alignSelf: "center", font: "400 16px/1.4 var(--sans)", color: "var(--fg-soft)" }}>
          No projects yet — start one with a photo.
        </p>
      )}

      {projects?.map((p) => {
        const thumb = resolveMediaUrl(p.imageUrl);
        return (
          <Link
            key={p.id}
            href={`/atelier?project=${encodeURIComponent(p.id)}`}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <article>
              <div style={{ aspectRatio: "4 / 5", border: "1px solid var(--rule)", overflow: "hidden", background: "var(--surface)" }}>
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumb} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : null}
              </div>
              <div style={{ marginTop: 14 }}>
                <span style={{ fontFamily: "var(--serif)", fontSize: 22 }}>{p.name}</span>
                <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <Mono>
                    {p.regionCount} region{p.regionCount === 1 ? "" : "s"}
                  </Mono>
                  <Mono>{statusLabel(p.status)}</Mono>
                </div>
              </div>
            </article>
          </Link>
        );
      })}
    </section>
  );
}
