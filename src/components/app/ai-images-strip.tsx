"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mono } from "@/components/ui/eyebrow";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/dates";
import { resolveMediaUrl } from "@/lib/media";
import type { MyRender } from "@/lib/types";

/** How many pictures the strip shows before handing over to the full shelf. */
const MAX_SHOWN = 4;

/**
 * The pictures this account's AI credits have actually bought.
 *
 * <b>Why it sits under the wallet.</b> "Projects & credits" answered what you HAVE — so
 * many projects, so many credits, and a button to buy more — and said nothing about what
 * any of it produced. The AI image is the one thing on that page bought with real money
 * and the one thing with something to show for it, and the page that took the payment was
 * the page that never mentioned it again. A balance beside the thing it paid for is a
 * different sentence from a balance on its own.
 *
 * <b>Why it is a strip and not the shelf.</b> /ai-images already exists and does this
 * properly: filtering, the detail pane, the one-image PDF with its shade table. Repeating
 * that here would be two pages to keep in step for no gain, so this shows the most recent
 * few and gets out of the way — enough to answer "did my credit produce anything?" and to
 * offer the way through when the answer is yes.
 *
 * <b>Renders nothing when there is nothing.</b> No images, or an unreadable list, and the
 * strip disappears rather than printing an empty state on a page that already has one
 * (the projects panel above). Somebody who has bought no picture yet is not missing
 * anything they can be pointed at — the way to get one is to finish a room, which is what
 * the rest of the page is about.
 */
export function AiImagesStrip() {
  const [renders, setRenders] = useState<MyRender[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listMyRenders()
      .then((list) => !cancelled && setRenders(list))
      // A failure is silent: this is an extra on a page that works without it, and an
      // error panel here would report the whole page broken over a decoration.
      .catch(() => !cancelled && setRenders([]));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!renders || renders.length === 0) return null;

  const shown = renders.slice(0, MAX_SHOWN);
  const more = renders.length - shown.length;

  return (
    <section aria-labelledby="ai-images-strip-heading">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <h2 id="ai-images-strip-heading" style={{ font: "600 22px/1.2 var(--serif)", margin: 0 }}>
          Your AI images
        </h2>
        <Link href="/ai-images" style={{ color: "var(--accent-soft)", font: "400 14px/1 var(--sans)" }}>
          {more > 0 ? `See all ${renders.length}` : "Open the shelf"} <span className="arr" aria-hidden>→</span>
        </Link>
      </div>
      {/* What the strip is, in the fewest words that still say it. The rest — that each
          one downloads on its own or as a sheet with the shade codes printed under it —
          is the two buttons on the shelf itself, and saying it here made a row of
          thumbnails carry two lines of explanation before the first thumbnail. */}
      <p style={{ margin: "10px 0 18px", font: "400 14px/1.6 var(--sans)", color: "var(--fg-mute)" }}>
        What your credits bought.
      </p>

      <ul className="hv-ai-strip">
        {shown.map((r) => {
          const thumb = r.imageUrl ? resolveMediaUrl(r.imageUrl) : null;
          return (
            <li key={r.id}>
              <Link href="/ai-images" aria-label={`Open your AI images — ${r.projectName}`}>
                <span className="hv-ai-strip-thumb">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" aria-hidden />
                  ) : null}
                </span>
                <span className="hv-ai-strip-name">{r.projectName}</span>
                {/* The date, because the question this strip answers is usually
                    "which one was the hall, the one from last week?" */}
                {r.completedAt || r.createdAt ? (
                  <Mono>{formatDate(r.completedAt ?? r.createdAt!)}</Mono>
                ) : null}
              </Link>
            </li>
          );
        })}
        {/* The slot at the end of the row, when there is one.

            Three pictures in a four-column shelf left a quarter of the row empty, which
            reads as a picture that failed to load rather than as a shelf with room on it.
            The thing that belongs in that space is the only thing somebody looking at
            their pictures wants next, and it is one credit away: the way to make another.
            It disappears the moment the row is full, so it never pushes a real picture
            off the strip. */}
        {shown.length < MAX_SHOWN && (
          <li className="hv-ai-strip-more">
            <Link href="/render" aria-label="Make another AI image">
              <span className="hv-ai-strip-thumb">
                <span className="hv-ai-strip-plus" aria-hidden>+</span>
              </span>
              <span className="hv-ai-strip-name">Make another</span>
              <Mono>1 credit</Mono>
            </Link>
          </li>
        )}
      </ul>

      <style>{`
        .hv-ai-strip {
          list-style: none; margin: 0; padding: 0;
          display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;
        }
        /* One entrance for the row, dealt left to right. */
        .hv-ai-strip li { animation: hv-ai-strip-in .5s var(--ease) both; }
        .hv-ai-strip li:nth-child(2) { animation-delay: .06s; }
        .hv-ai-strip li:nth-child(3) { animation-delay: .12s; }
        .hv-ai-strip li:nth-child(4) { animation-delay: .18s; }
        @keyframes hv-ai-strip-in {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) { .hv-ai-strip li { animation: none; } }
        .hv-ai-strip a {
          display: block; text-decoration: none; color: inherit;
        }
        .hv-ai-strip-thumb {
          display: block; aspect-ratio: 4 / 3; overflow: hidden;
          border: 1px solid var(--rule); border-radius: var(--radius);
          background: var(--surface);
          transition: border-color .2s var(--ease);
        }
        .hv-ai-strip-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .3s var(--ease); }
        .hv-ai-strip a:hover .hv-ai-strip-thumb { border-color: var(--accent); }
        .hv-ai-strip a:hover .hv-ai-strip-thumb img { transform: scale(1.04); }
        .hv-ai-strip a:focus-visible .hv-ai-strip-thumb { outline: 2px solid var(--accent); outline-offset: 2px; }
        .hv-ai-strip-name {
          display: block; margin-top: 8px;
          font: 400 15px/1.3 var(--sans); color: var(--fg);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .hv-ai-strip a:hover .hv-ai-strip-name { color: var(--accent); }

        /* The end slot wears the same frame as a picture, dashed and empty: obviously the
           same kind of thing as the tiles beside it, and obviously not one of them. */
        .hv-ai-strip-more .hv-ai-strip-thumb {
          display: grid; place-items: center;
          border-style: dashed; background: transparent;
        }
        .hv-ai-strip-plus {
          font: 300 32px/1 var(--sans); color: var(--fg-mute);
          transition: color .25s var(--ease), transform .25s var(--ease);
        }
        .hv-ai-strip-more a:hover .hv-ai-strip-plus {
          color: var(--accent-text); transform: scale(1.15);
        }
        .hv-ai-strip-more .hv-ai-strip-name { color: var(--fg-soft); }

        @media (max-width: 700px) { .hv-ai-strip { grid-template-columns: repeat(2, 1fr); } }
        @media (prefers-reduced-motion: reduce) { .hv-ai-strip-plus { transition: none; } }
      `}</style>
    </section>
  );
}
