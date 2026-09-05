"use client";

import { Mono, Note } from "@/components/ui/eyebrow";
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
        className="r-cols-md-2 hv-kpi-row"
        aria-hidden
        style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24, marginBottom: 64 }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="hv-kpi">
            <span className="hv-skel" style={{ width: "58%", height: 12 }} />
            <span className="hv-skel" style={{ width: "40%", height: 46, marginTop: 14 }} />
            <span className="hv-skel" style={{ width: "72%", height: 12, marginTop: 14 }} />
          </div>
        ))}
        <Styles />
      </section>
    );
  }

  // Every sub-line names the unit its number is counted in. "Ready · walls
  // detected" sat under a PROJECT count and read as a number of walls, right
  // beside a card that really was counting walls.
  const cards: ReadonlyArray<{ n: number; l: string; sub: string }> = [
    { n: total, l: "Projects saved", sub: "in your suite" },
    { n: ready, l: "Ready", sub: "projects with walls found" },
    { n: surfaces, l: "Walls & surfaces", sub: "across all your rooms" },
    { n: attention, l: "Needs attention", sub: "no walls found — reopen in Studio" },
  ];

  return (
    <section
      className="r-cols-md-2 hv-kpi-row"
      style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24, marginBottom: 64 }}
    >
      {cards.map((m, i) => (
        <div
          key={m.l}
          className={`hv-kpi hv-kpi-live${m.n > 0 && m.l === "Needs attention" ? " is-warn" : ""}`}
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <Mono>{m.l}</Mono>
          <div className="display hv-kpi-n">
            <CountUp value={m.n} />
          </div>
          {/* The label above the number is two or three words and wears the
              label treatment well. This line is a sentence explaining the
              figure — "no walls found — reopen in Studio" — and letter-spaced
              caps turn a sentence into texture to be decoded. Same reasoning as
              <Note>'s own note. */}
          <Note style={{ marginTop: 8, display: "block", fontSize: 13 }}>{m.sub}</Note>
        </div>
      ))}
      <Styles />
    </section>
  );
}

/**
 * The tiles, in the card language the rest of the customer's and shop's screens use.
 *
 * They were square-cornered hairline boxes on the page ground — correct, and
 * indistinguishable from a table. What a KPI row is FOR is being read at a glance from
 * across a counter, and four identical grey rectangles are the shape that defeats that.
 * A generous radius, one wash of accent from a corner, and the figure itself in the
 * accent give the row somewhere for the eye to land.
 *
 * "Needs attention" turns warm when it is not zero, and only then: it is the one number
 * here that is bad news, and a red tile reading 0 would be crying wolf on every dashboard
 * that has nothing wrong with it.
 */
function Styles() {
  return (
    <style>{`
      /* Two across on a phone, not four down. Stacked full-width these four tiles
         ran to about 520px, and they sit between the greeting — "Pick up a saved
         project, or start a new one" — and the projects it is talking about. A
         summary that has to be scrolled past to reach the thing it summarises is
         costing more than it tells. */
      @media (max-width: 720px) {
        .hv-kpi-row { grid-template-columns: 1fr 1fr !important; gap: 12px !important; }
        .hv-kpi { padding: 16px 16px 18px; }
      }
      @media (max-width: 360px) {
        .hv-kpi-row { grid-template-columns: 1fr !important; }
      }
      /* hv-kpi, not hv-stat: that name already belongs to the marketing site's stats
         band, which centres its text and rules between its siblings. Borrowing it here
         centred every label in this row and hung a divider off each tile. */
      .hv-kpi {
        position: relative; overflow: hidden; padding: 26px 28px;
        border: 1px solid var(--rule); border-radius: calc(var(--radius) * 1.6);
        background:
          radial-gradient(120% 90% at 0% 0%, rgba(192,139,78,.07), transparent 60%),
          var(--surface);
        transition: transform .3s var(--ease), border-color .3s var(--ease);
      }
      .hv-kpi::before {
        content: ""; position: absolute; inset: 0 0 auto; height: 1px;
        background: linear-gradient(90deg, transparent, var(--rule-brass), transparent);
        opacity: .7; transition: opacity .3s var(--ease);
      }
      .hv-kpi-n {
        font-size: 56px; line-height: 1; margin-top: 12px;
        color: var(--accent-text); letter-spacing: -.02em;
        font-variant-numeric: tabular-nums;
      }
      .hv-kpi-live { animation: hv-kpi-in .5s var(--ease) both; }
      .hv-kpi-live:hover { transform: translateY(-2px); border-color: var(--rule-strong); }
      .hv-kpi-live:hover::before { opacity: 1; }

      /* The one tile that is bad news, and only while it is. */
      .hv-kpi.is-warn {
        border-color: rgba(194, 64, 42, .38);
        background:
          radial-gradient(120% 90% at 0% 0%, rgba(194,64,42,.10), transparent 60%),
          var(--surface);
      }
      .hv-kpi.is-warn::before {
        background: linear-gradient(90deg, transparent, rgba(194,64,42,.5), transparent);
      }
      .hv-kpi.is-warn .hv-kpi-n { color: var(--terracotta); }

      @keyframes hv-kpi-in {
        from { opacity: 0; transform: translateY(10px); }
        to   { opacity: 1; transform: none; }
      }
      @media (prefers-reduced-motion: reduce) {
        .hv-kpi-live { animation: none; transition: none; }
        .hv-kpi-live:hover { transform: none; }
      }
      /* A pointer lift sticks after a tap on touch, which reads as a rendering fault. */
      @media (hover: none) {
        .hv-kpi-live:hover { transform: none; }
        .hv-kpi::before { opacity: 1; }
      }
    `}</style>
  );
}
