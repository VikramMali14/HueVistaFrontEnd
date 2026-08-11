"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eyebrow, Mono } from "@/components/ui/eyebrow";
import { Placeholder } from "@/components/ui/placeholder";
import { TiltCard } from "@/components/ui/tilt-card";
import { startGalleryRoomAction } from "@/lib/free-projects";

/** The categories the built-in editorial plates use. Real rooms bring their own. */
export type PlateCategory = "Living rooms" | "Bedrooms" | "Kitchens" | "Verandas" | "Façades" | "Commercial";
export type Tone = "terracotta" | "ivory" | "slate" | "sage" | "brass" | "oxblood" | "indigo" | "walnut" | "ink";

export interface Plate {
  slug: string;
  num: string;
  /** Free text, not a fixed union: the chips are built from whatever the rooms on
   *  the shelf actually say they are, so publishing a "Pooja room" adds a chip
   *  rather than needing this file edited. */
  category: string;
  title: React.ReactNode;
  code: string;
  swatch: string;
  location: string;
  date: string;
  tag: string;
  tone: Tone;
  aspect: string;
  /** A real photograph of the room. Without one the plate draws its gradient. */
  imageUrl?: string;
  /** What is in that photograph, for anyone not looking at it. */
  alt?: string;
  /** Where the card leads. Absent = the card is a picture, not a link — which is
   *  the case for published rooms, since there is no per-room page for them. */
  href?: string;
  /** A real published room, so it can be opened and painted. The built-in
   *  editorial plates are invented material with nothing behind them, and are
   *  never startable — there is no room to copy. */
  startable?: boolean;
}

/** Where a signed-out visitor is sent back to, to finish the click they made. */
const RESUME_PARAM = "paint";

const ALL = "All rooms";

// Tones light enough that the fixed white plate chrome disappears.
const LIGHT_TONES: ReadonlyArray<Tone> = ["ivory", "sage", "brass"];

export function GalleryGrid({ plates }: { plates: ReadonlyArray<Plate> }) {
  const [category, setCategory] = useState<string>(ALL);
  const [sort, setSort] = useState<"latest" | "oldest">("latest");
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  /**
   * Open a copy of a published room and hand it to the studio.
   *
   * A signed-out visitor is the ordinary case here — this is a marketing page —
   * so instead of an error they go to /sign-in with a `next` that returns to the
   * gallery carrying the slug they clicked, and the effect below finishes the job.
   * Losing the click and dropping them on a dashboard would be the rude version.
   */
  const paint = useCallback((slug: string) => {
    setBusySlug(slug);
    setError(null);
    startTransition(async () => {
      const res = await startGalleryRoomAction(slug);
      if (res.signInRequired) {
        const back = `/gallery?${RESUME_PARAM}=${encodeURIComponent(slug)}`;
        router.push(`/sign-in?next=${encodeURIComponent(back)}`);
        return;
      }
      if (res.started) {
        // A normal project from here on — indistinguishable from an uploaded one.
        router.push(`/studio?project=${encodeURIComponent(res.started.projectId)}`);
        return;
      }
      setBusySlug(null);
      setError(res.error ?? "Could not open this room. Please try again.");
    });
  }, [router]);

  /**
   * Finish a click that went through the sign-in page.
   *
   * The slug is read from `window.location` rather than `useSearchParams` on
   * purpose: this page is statically rendered with a revalidate window, and
   * reading search params during render would opt the whole thing into dynamic
   * rendering (or demand a Suspense boundary) for a parameter that is only ever
   * present on the way back from /sign-in.
   */
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current) return;
    const slug = new URLSearchParams(window.location.search).get(RESUME_PARAM);
    if (!slug) return;
    resumed.current = true;
    // Drop the parameter so a refresh (or a back-button) does not open a second
    // copy of the same room.
    window.history.replaceState(null, "", window.location.pathname);
    if (plates.some((p) => p.startable && p.slug === slug)) paint(slug);
  }, [plates, paint]);

  // Built from the plates on screen. A chip for a category nothing is filed under
  // is a filter that can only ever empty the grid, which is how the fixed list
  // behaved the moment the gallery stopped being twelve hard-coded rooms.
  const chips = useMemo(
    () => [ALL, ...Array.from(new Set(plates.map((p) => p.category))).sort((a, b) => a.localeCompare(b))],
    [plates],
  );

  const filtered = useMemo(() => {
    const list = category === ALL ? plates : plates.filter((p) => p.category === category);
    return sort === "latest" ? list : [...list].reverse();
  }, [plates, category, sort]);

  return (
    <>
      <div className="reveal d2" style={{ marginTop: 48, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {chips.map((c) => {
          const active = c === category;
          return (
            <button
              key={c}
              type="button"
              className="hv-chip"
              aria-pressed={active}
              onClick={() => setCategory(c)}
              style={{
                padding: "8px 14px",
                font: "400 12px/1 var(--mono)",
                letterSpacing: ".26em",
                textTransform: "uppercase",
                background: active ? "rgba(124,92,255,.08)" : "transparent",
                color: active ? "var(--brass)" : "var(--fg-soft)",
                border: "1px solid " + (active ? "var(--rule-brass)" : "transparent"),
                cursor: "pointer",
              }}
            >
              {c}
            </button>
          );
        })}
        <button type="button" className="hv-chip" onClick={() => setSort(sort === "latest" ? "oldest" : "latest")} style={{ marginLeft: "auto", padding: "8px 14px", font: "400 12px/1 var(--mono)", letterSpacing: ".26em", textTransform: "uppercase", background: "transparent", color: "var(--brass)", border: "1px solid var(--rule-brass)", cursor: "pointer" }}>
          Sort: {sort}
        </button>
      </div>

      {error && (
        <p
          role="alert"
          style={{
            marginTop: 24, padding: "12px 16px",
            border: "1px solid var(--rule-strong)",
            font: "400 14px/1.5 var(--sans)", color: "var(--fg)",
          }}
        >
          {error}
        </p>
      )}

      <section style={{ paddingTop: 60 }}>
        {/* The keyed inner div replays the entrance when filters change; the static
            outer div keeps .reveal (a remount would strip its .in and stay invisible). */}
        <div className="reveal">
          <div key={`${category}·${sort}`} className="hv-grid-swap hv-gallery-grid" style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 24 }}>
            {filtered.map((p, i) => {
              const colSpan = i % 6 === 0 || i % 6 === 4 ? 6 : 3;
              const lightTone = LIGHT_TONES.includes(p.tone);
              // A published room has a photograph and no page of its own to link to;
              // the built-in editorial plates have neither a photograph nor anything
              // real behind them, and keep their /work link. Both render the same
              // card — only the picture and the wrapper differ.
              const body = (
                <>
                  <TiltCard max={7}>
                    {p.imageUrl ? (
                      /* A cross-origin API path (or a presigned S3 link) that
                         next/image cannot optimise without the host in its config,
                         and which changes whenever a room is refreshed. */
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.imageUrl}
                        alt={p.alt ?? ""}
                        loading="lazy"
                        style={{ display: "block", width: "100%", height: "100%", aspectRatio: p.aspect, objectFit: "cover" }}
                      />
                    ) : (
                      <Placeholder tone={p.tone} grain corners tag={p.tag} label={`${p.location} · ${p.date}`} style={{ aspectRatio: p.aspect, height: "100%" }} />
                    )}
                  </TiltCard>
                  <span aria-hidden style={{ position: "absolute", top: 16, right: 18, font: "400 14px/1 var(--serif)", color: lightTone || p.imageUrl ? "rgba(30,26,18,.55)" : "rgba(255,255,255,.6)" }}>{p.num}</span>
                  <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: "var(--serif)", fontSize: 24, color: "var(--fg)", lineHeight: 1.2 }}>
                        {p.title}
                        {p.href && <> <span className="arr" aria-hidden style={{ display: "inline-block", transition: "transform .25s var(--ease)" }}>→</span></>}
                      </div>
                      <div style={{ marginTop: 6, display: "inline-flex", alignItems: "center", gap: 10 }}>
                        <span style={{ width: 14, height: 14, background: p.swatch, border: "1px solid var(--rule-strong)" }} />
                        <Mono className="shade-code">{p.code}</Mono>
                      </div>
                    </div>
                    <Mono style={{ textAlign: "right", whiteSpace: "pre-line", flexShrink: 0 }}>{p.location}{"\n"}{p.date}</Mono>
                  </div>
                  {p.startable && (
                    <div style={{ marginTop: 14 }}>
                      <button
                        type="button"
                        className="hv-paint-btn"
                        onClick={() => paint(p.slug)}
                        disabled={busySlug !== null}
                        aria-label={`Paint ${p.location || "this room"} yourself`}
                      >
                        {busySlug === p.slug ? "Opening…" : "Paint this room"}
                        <span className="arr" aria-hidden> →</span>
                      </button>
                    </div>
                  )}
                </>
              );
              return (
                <article key={p.slug} style={{ gridColumn: `span ${colSpan}`, position: "relative" }}>
                  {p.href ? (
                    <Link
                      href={p.href}
                      className="hv-plate-link"
                      aria-label={`${p.location} — view project`}
                      style={{ display: "block", color: "inherit", textDecoration: "none" }}
                    >
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </article>
              );
            })}
          </div>
          {filtered.length === 0 && (
            <div style={{ padding: "120px 0", textAlign: "center" }}>
              <Eyebrow>No plates in this category</Eyebrow>
            </div>
          )}
        </div>
      </section>

      <style>{`
        .hv-paint-btn {
          display: inline-flex; align-items: center; gap: 2px;
          padding: 9px 16px; cursor: pointer;
          font: 400 12px/1 var(--mono); letter-spacing: .22em; text-transform: uppercase;
          color: var(--brass); background: transparent;
          border: 1px solid var(--rule-brass);
          transition: background .25s var(--ease), color .25s var(--ease);
        }
        .hv-paint-btn:hover:not(:disabled) { background: var(--brass); color: var(--bg); }
        .hv-paint-btn:hover:not(:disabled) .arr { transform: translateX(3px); }
        .hv-paint-btn .arr { display: inline-block; transition: transform .25s var(--ease); }
        /* Only the card being opened keeps full contrast; the rest dim so it is
           obvious which one is loading, and that a second click will not land. */
        .hv-paint-btn:disabled { cursor: default; opacity: .45; }
        .hv-grid-swap { animation: hv-grid-swap .45s var(--ease); }
        @keyframes hv-grid-swap { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
        .hv-plate-link:hover .arr { transform: translateX(4px); }
        /* Dark ink for plate chrome on light tones — fixed white vanishes there. */
        .hv-gallery-grid .ph[data-tone="ivory"] .ph-label,
        .hv-gallery-grid .ph[data-tone="sage"] .ph-label,
        .hv-gallery-grid .ph[data-tone="brass"] .ph-label { color: rgba(30,26,18,.72); }
        .hv-gallery-grid .ph[data-tone="ivory"] .ph-tag,
        .hv-gallery-grid .ph[data-tone="sage"] .ph-tag,
        .hv-gallery-grid .ph[data-tone="brass"] .ph-tag { color: rgba(30,26,18,.55); }
        @media (prefers-reduced-motion: reduce) {
          .hv-grid-swap { animation: none; }
          .hv-plate-link .arr { transition: none; }
          .hv-paint-btn, .hv-paint-btn .arr { transition: none; }
        }
      `}</style>
    </>
  );
}
