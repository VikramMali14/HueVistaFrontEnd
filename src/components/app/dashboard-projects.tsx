"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, HttpError } from "@/lib/api";
import { LinkButton } from "@/components/ui/button";
import { DashboardStats } from "@/components/app/dashboard-stats";
import { ProjectsGrid } from "@/components/app/projects-grid";
import { Mono } from "@/components/ui/eyebrow";
import type { MyRender, ProjectSummary } from "@/lib/types";

/**
 * Which rooms the dashboard is showing. A shop's dashboard carries two quite
 * different things — the rooms they made themselves, and the rooms their walk-in
 * customers made under codes the shop issued — and mixing them with no way to
 * separate them makes both harder to find on a busy counter day.
 */
type Filter = "ALL" | "OWN" | "CUSTOMER";

const FILTER_LABELS: Record<Filter, string> = {
  ALL: "All rooms",
  OWN: "My rooms",
  CUSTOMER: "Customer rooms",
};

/**
 * Single fetch for the dashboard's project data — feeds both the KPI cards and
 * the projects grid so the two sections never load (or disagree) separately.
 */
export function DashboardProjects({ isCustomer = false }: { isCustomer?: boolean }) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [renders, setRenders] = useState<MyRender[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("ALL");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.listProjects();
        // Library rooms are kept OUT of the dashboard and shown on /library instead.
        //
        // They are not the same kind of thing as the rooms below them. A dashboard
        // project is a job: a photo the account uploaded, walls it paid to have found,
        // a colour board at the end. A library room is a copy of something already
        // finished — free to open, free to open again, and openable a dozen times in an
        // afternoon by somebody just trying colours out. Mixed into one grid they bury
        // the paid work under the free browsing, and the count beside it ("3 of 5
        // projects") stops describing anything the customer recognises.
        //
        // They are not lost: /library lists the copies this account has made, which is
        // also where somebody who painted one would look for it.
        if (!cancelled) setProjects(list.filter((p) => !p.fromLibrary));
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

  // The finished AI images, so a room that made one can say so on its card. Its own
  // fetch, and a failing one is silent on purpose: this decorates the grid rather than
  // filling it, and turning "the image list was unreachable" into the projects error
  // would report a broken dashboard over rooms that had loaded perfectly.
  useEffect(() => {
    let cancelled = false;
    api
      .listMyRenders()
      .then((list) => !cancelled && setRenders(list))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  /** Newest image per room — the list arrives newest first, so the first one wins. */
  const rendersByProject = useMemo(() => {
    const byProject = new Map<string, MyRender>();
    for (const r of renders) {
      if (r.projectId && !byProject.has(r.projectId)) byProject.set(r.projectId, r);
    }
    return byProject;
  }, [renders]);

  // The filter only appears once there is actually something to separate — a shop
  // with no customer rooms yet doesn't need a control that can only empty the page.
  const counts = useMemo(() => {
    const own = projects?.filter((p) => p.source !== "CUSTOMER").length ?? 0;
    const customer = projects?.filter((p) => p.source === "CUSTOMER").length ?? 0;
    return { own, customer, all: own + customer };
  }, [projects]);

  const showFilter = counts.customer > 0;

  const visible = useMemo(() => {
    if (projects === null) return null;
    if (!showFilter || filter === "ALL") return projects;
    return projects.filter((p) =>
      filter === "CUSTOMER" ? p.source === "CUSTOMER" : p.source !== "CUSTOMER",
    );
  }, [projects, filter, showFilter]);

  return (
    <>
      {/* Stats count everything, not just the current filter — they describe the
          business, and a number that moves when you flip a view is a number nobody
          can quote.

          A walk-in customer has no business to describe. Four cards of counter
          analytics — "Projects saved · in your suite", "Walls & surfaces · regions
          across all projects" — sat above the one or two rooms they came to look at,
          in a vocabulary written for a shop, repeating a count the access banner had
          already given them in the sentence that actually matters ("1 of 3 projects
          used · 8 days of access"). */}
      {!isCustomer && <DashboardStats projects={projects} />}
      <section style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 32 }}>
        <h2 className="display" style={{ fontSize: 48 }}>Recent projects</h2>
        <LinkButton href="/studio" variant="ghost" size="sm">New project <span className="arr">→</span></LinkButton>
      </section>

      {showFilter && (
        <div
          role="group"
          aria-label="Filter rooms"
          style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 28 }}
        >
          {(["ALL", "OWN", "CUSTOMER"] as const).map((key) => {
            const active = filter === key;
            const n = key === "ALL" ? counts.all : key === "OWN" ? counts.own : counts.customer;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                aria-pressed={active}
                className="hv-filter-chip"
                data-active={active ? "1" : undefined}
              >
                {FILTER_LABELS[key]}
                <span style={{ opacity: 0.6, marginLeft: 8 }}>{n}</span>
              </button>
            );
          })}
          <style>{`
            .hv-filter-chip {
              font: 400 13px/1 var(--mono, var(--sans));
              letter-spacing: .04em;
              text-transform: uppercase;
              padding: 10px 16px;
              border: 1px solid var(--rule);
              border-radius: var(--radius);
              background: transparent;
              color: var(--fg-soft);
              cursor: pointer;
              transition: border-color .2s var(--ease), color .2s var(--ease), background .2s var(--ease);
            }
            .hv-filter-chip:hover { border-color: var(--rule-strong); color: var(--fg); }
            .hv-filter-chip[data-active] {
              border-color: var(--accent);
              color: var(--fg);
              background: var(--surface-soft);
            }
          `}</style>
        </div>
      )}

      {showFilter && filter === "CUSTOMER" && (
        <p style={{ marginBottom: 24 }}>
          <Mono>
            Rooms your customers made with codes you issued. Open one to read the exact shades
            they chose — these are theirs to edit, not yours.
          </Mono>
        </p>
      )}

      <ProjectsGrid
        projects={visible}
        error={error}
        rendersByProject={rendersByProject}
        emptyHint={
          isCustomer ? (
            <p style={{ margin: 0, font: "400 15px/1.5 var(--sans)", color: "var(--fg-soft)", maxWidth: "34ch" }}>
              A room needs a project to open it.{" "}
              <Link href="/my-projects" style={{ color: "var(--accent-text)" }}>
                Buy one or check what you have
              </Link>
              , unlock with a shop&rsquo;s code, or open a{" "}
              <Link href="/library" style={{ color: "var(--accent-text)" }}>
                ready-made room
              </Link>{" "}
              for free.
            </p>
          ) : undefined
        }
      />
    </>
  );
}
