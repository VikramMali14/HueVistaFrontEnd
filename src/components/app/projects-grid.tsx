"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/dates";
import { resolveMediaUrl } from "@/lib/media";
import { Mono } from "@/components/ui/eyebrow";
import { ImageCompare } from "@/components/ui/image-compare";
import type { MyRender, ProjectSummary } from "@/lib/types";

// Progressive reveal: 11 projects to start, then 8 more per "Load more" click.
// The dashboard fetches every project once (shared with the KPI cards), so this
// paginates the render only — the stats above still count the full set.
const INITIAL_VISIBLE = 11;
const LOAD_STEP = 8;

/** " · ended 3 Aug 2026" — only when there is a date worth naming. Carries the year
 *  like every other date in the app: a project list spans years, and "3 Aug" cannot
 *  be compared with the "3 Aug 2026" on the code that opened it. */
function expiryNote(accessExpiresAt: string | null | undefined): string {
  if (!accessExpiresAt) return "";
  const when = new Date(accessExpiresAt);
  if (Number.isNaN(when.getTime())) return "";
  return ` · ended ${formatDate(accessExpiresAt)}`;
}

/**
 * What a card says about a project.
 *
 * Takes the region count as well as the status, because a run can finish and find
 * nothing: SEGMENTED with zero regions was labelled "Ready" beside its own "0
 * regions", and opening it gave a studio with no walls to paint and an Apply
 * button that could never enable. The pipeline succeeded; the project did not.
 */
function statusLabel(s: ProjectSummary["status"], regionCount: number | null | undefined): string {
  switch (s) {
    case "SEGMENTED":
      return (regionCount ?? 0) > 0 ? "Ready" : "Needs attention";
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
  /**
   * Replaces the "start one with a photo" line when the grid is empty.
   *
   * That default is a shop's next step, not everyone's: a customer with no projects
   * left cannot start one at all, and pointing them at the studio walks them into a
   * gate. Callers who know the account supply the sentence that is true for it.
   */
  emptyHint?: React.ReactNode;
  /**
   * The account's finished AI images, keyed by the room that made them.
   *
   * The picture is the last thing a room produces and the thing its owner actually
   * leaves with, and the card said nothing about it — a closed room looked exactly like
   * an open one, so the only way back to an image was the "AI images" tab, if you knew
   * it was there. Absent (or without an entry for a room) simply means no picture to
   * show, which is the ordinary case for a room still being painted.
   */
  rendersByProject?: Map<string, MyRender>;
}

/**
 * Where a card's title goes.
 *
 * A customer's room is not the shop's to paint in — it belongs to the session the
 * customer is holding — so it opens in the shop's portal view of that code, where the
 * real shade codes are readable, rather than in the studio where the palette would look
 * live and every save would come back 404.
 */
function projectHref(p: ProjectSummary): string {
  if (p.source === "CUSTOMER" && p.accessCodeId) {
    return `/portal?code=${encodeURIComponent(p.accessCodeId)}`;
  }
  return `/studio?project=${encodeURIComponent(p.id)}`;
}

/**
 * Grid of the signed-in user's projects, newest first. Data arrives via props
 * from DashboardProjects (one fetch shared with the KPI cards). Cards whose
 * photo has been AI-cleaned show a raw-vs-cleaned before/after slider; the
 * title opens the project in the studio.
 */
export function ProjectsGrid({ projects, error, emptyHint, rendersByProject }: ProjectsGridProps) {
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
        /* stretch, not start: a card carrying an AI-image row is 48px taller than one
           without, so with `start` the row went ragged and the New-project tile — which
           reserves a caption but no AI row — ended short of its neighbours. Stretching
           the row and dropping the meta line to the bottom of each card (margin-top:
           auto, below) makes every card in a row one height and puts every date on one
           line across the shelf, whatever each card happens to carry. */
        style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24, alignItems: "stretch" }}
      >
        {/* New-project tile: 4/5 media + an invisible caption spacer so its total
            height matches a project card exactly (every card is one size). */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <Link
            href="/studio"
            className="hv-proj-new"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              aspectRatio: "4 / 5",
              color: "var(--accent-text)",
              textDecoration: "none",
              background: "var(--surface-soft)",
              borderRadius: "calc(var(--radius) * 1.4)",
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
            <div key={i} className="hv-skel" aria-hidden style={{ aspectRatio: "4 / 5", border: "1px solid var(--rule)", borderRadius: "calc(var(--radius) * 1.4)" }} />
          ))}

        {error && (
          <p style={{ alignSelf: "center", color: "var(--fg-mute)" }}>
            <Mono>{error}</Mono>
          </p>
        )}

        {/* The empty state is a tile in the row beside "New project", not a line
            of text floating in a row sized by a tall card — which is where the
            screen-and-a-half of blank between the heading and this message came
            from. It fills the space it is given and says what to do next. */}
        {sorted !== null && sorted.length === 0 && !error && (
          <div className="hv-proj-empty">
            <p style={{ margin: 0, font: "400 17px/1.45 var(--sans)", color: "var(--fg)" }}>
              No projects yet.
            </p>
            {/* A customer's next step is not the same as a shop's. A shop just starts
                one; a customer needs a project to spend first, and telling them to
                upload a photo sends them to a wall that asks for a code. */}
            {emptyHint ?? (
              <p style={{ margin: 0, font: "400 15px/1.5 var(--sans)", color: "var(--fg-soft)", maxWidth: "34ch" }}>
                Start one with a photo of a room — the walls are found for you, then any
                colour goes straight on them.
              </p>
            )}
          </div>
        )}

        {shown?.map((p, i) => {
          const thumb = resolveMediaUrl(p.imageUrl);
          const cleaned = p.cleanedImageUrl ? resolveMediaUrl(p.cleanedImageUrl) : null;
          const href = projectHref(p);
          const isCustomerRoom = p.source === "CUSTOMER";
          // A customer's room never carries one here: the image was bought with THEIR
          // credit and belongs to their account, so the shop's own shelf has no entry
          // for it. The shop reads those in the portal, per code.
          const render = rendersByProject?.get(p.id);
          const renderThumb = render?.imageUrl ? resolveMediaUrl(render.imageUrl) : null;
          return (
            <article
              key={p.id}
              className="hv-proj-card"
              /* Dealt in, capped: past a dozen a stagger stops reading as cards being
                 laid out and starts reading as a page that is slow. */
              style={{ animationDelay: `${Math.min(i, 11) * 45}ms` }}
            >
              <div className="hv-proj-thumb" style={{ aspectRatio: "4 / 5", overflow: "hidden" }}>
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
                {/* Whose room this is, said plainly. On a shop dashboard the same grid
                    now carries their work and their customers', and a card that doesn't
                    say which is a card that gets opened by mistake. */}
                {isCustomerRoom && (
                  <div style={{ marginTop: 6 }}>
                    <Mono brass>
                      {p.customerName ? p.customerName : "Customer"}
                      {p.accessCode ? ` · ${p.accessCode}` : ""}
                    </Mono>
                  </div>
                )}
                {!isCustomerRoom && p.readOnly && (
                  <div style={{ marginTop: 6 }}>
                    <Mono>View only{expiryNote(p.accessExpiresAt)}</Mono>
                  </div>
                )}
                {/* The picture the room was closed to make. Shown as the picture itself
                    rather than as the words "AI image": it is the one thing on this card
                    somebody is looking FOR, and a thumbnail is recognised where a label
                    has to be read. Links to the render page, which is where it can be
                    downloaded or turned into a sheet. */}
                {render && (
                  <Link
                    href={`/render?project=${encodeURIComponent(p.id)}`}
                    className="hv-proj-ai"
                    aria-label={`Open the AI image for ${p.name}`}
                  >
                    {renderThumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={renderThumb} alt="" aria-hidden />
                    ) : null}
                    <Mono brass>AI image</Mono>
                    <span className="arr" aria-hidden>→</span>
                  </Link>
                )}
                <div className="hv-proj-meta" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <Mono>
                    {p.regionCount} region{p.regionCount === 1 ? "" : "s"}
                  </Mono>
                  <span style={{ display: "inline-flex", alignItems: "baseline", gap: 10 }}>
                    {p.updatedAt ? (
                      <Mono>{formatDate(p.updatedAt)}</Mono>
                    ) : null}
                    <Mono>{statusLabel(p.status, p.regionCount)}</Mono>
                  </span>
                </div>
              </div>
            </article>
          );
        })}
        <style>{`
          .hv-proj-new {
            border: 1px dashed var(--rule-strong);
            border-radius: calc(var(--radius) * 1.4);
            transition: border-color .2s var(--ease), background .2s var(--ease);
          }
          .hv-proj-new:hover { border-color: var(--accent-text); }

          /* The room, in the card language the rest of the app uses. The photograph is
             the whole card rather than a bordered rectangle sitting on the page ground,
             which is what a shelf of rooms should look like — and it lifts a hair under
             the pointer so a grid of a dozen answers the one being aimed at. */
          /* A column, so the caption can take the slack a shorter card leaves and the
             meta line can sit on the card's floor rather than wherever the content
             above it happened to end. */
          .hv-proj-card { animation: hv-proj-in .5s var(--ease) both; display: flex; flex-direction: column; }
          @keyframes hv-proj-in {
            from { opacity: 0; transform: translateY(12px); }
            to   { opacity: 1; transform: none; }
          }
          .hv-proj-thumb {
            border: 1px solid var(--rule);
            border-radius: calc(var(--radius) * 1.4);
            background: var(--surface);
            transition: border-color .25s var(--ease), transform .25s var(--ease);
          }
          .hv-proj-card:hover .hv-proj-thumb {
            border-color: var(--rule-strong); transform: translateY(-3px);
          }
          .hv-proj-thumb a:hover img { transform: scale(1.04); }
          .hv-proj-caption { margin-top: 14px; display: flex; flex-direction: column; flex: 1; }
          /* The floor. margin-top:auto eats the difference between a card carrying an
             AI-image row and one without, which is what lines the dates up across the
             shelf however much each caption above them holds. */
          .hv-proj-meta { margin-top: auto; padding-top: 8px; }
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
          a:hover .hv-proj-title { color: var(--accent-text); }
          /* The AI-image row. Sits under the caption as its own tappable strip rather
             than inside the title link, so "open the room" and "open the picture" stay
             two separate targets on a phone. */
          .hv-proj-ai {
            display: inline-flex; align-items: center; gap: 8px;
            margin-top: 10px; padding: 5px 10px 5px 5px;
            border: 1px solid var(--rule); border-radius: var(--radius-pill);
            text-decoration: none; color: var(--fg-soft);
            transition: border-color .2s var(--ease), background .2s var(--ease), color .2s var(--ease);
          }
          .hv-proj-ai:hover { border-color: var(--accent-text); background: var(--surface-soft); color: var(--fg); }
          .hv-proj-ai:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
          .hv-proj-ai img {
            width: 26px; height: 26px; border-radius: 50%;
            object-fit: cover; display: block; flex: none;
          }
          @media (prefers-reduced-motion: reduce) {
            .hv-proj-card { animation: none; }
            .hv-proj-thumb { transition: none; }
            .hv-proj-card:hover .hv-proj-thumb { transform: none; }
          }
          /* A lift sticks after a tap on touch, and reads as a rendering fault. */
          @media (hover: none) {
            .hv-proj-card:hover .hv-proj-thumb { transform: none; }
          }
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
