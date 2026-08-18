"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { LinkButton } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/dates";
import { resolveMediaUrl } from "@/lib/media";
import type { RenderableProject } from "@/lib/types";

/**
 * Which finished room to make another AI image of.
 *
 * <p><b>Why this screen exists.</b> An image could only ever be asked for from inside the
 * room that made it. Somebody who wanted a second picture of a job they finished last
 * month had to remember which room it was, find it among their finished work, open it, and
 * only then be offered the choice — for a purchase that does not depend on the room's
 * state at all, because a credit is a credit. `/render` with no room named used to be a
 * dead end that said "Which room?" and pointed at the dashboard, which is the question
 * this page should be answering rather than asking.
 *
 * <p><b>What is offered.</b> Closed rooms that handed over a colour board, and only those.
 * The server decides it — see `GET /api/me/renderable-projects` — because both halves are
 * rules about the product rather than about this screen: an open room is worked on in the
 * studio it is open in, and a room that closed without taking a board has no combination
 * to photograph, so offering it would dead-end on the very next step.
 *
 * <p>The thumbnail is the CLEANED photograph where there is one. That is what the image
 * will be painted from unless the customer says otherwise on the next screen, so showing
 * the original here would mean the picture they picked from is not the picture they get.
 */
export function RenderProjectPicker() {
  const [rooms, setRooms] = useState<RenderableProject[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.listRenderableProjects();
        if (!cancelled) setRooms(list);
      } catch (e) {
        if (cancelled) return;
        setRooms([]);
        setError(e instanceof Error ? e.message : "Could not load your finished rooms.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (rooms === null) {
    return (
      <div className="hv-pick-loading">
        <Spinner /> <span>Finding your finished rooms…</span>
      </div>
    );
  }

  return (
    <div className="hv-pick">
      <header className="hv-pick-head">
        <Eyebrow>Your AI image</Eyebrow>
        <h1 className="display">
          Which room shall we <i>photograph?</i>
        </h1>
        <Lead style={{ maxWidth: "56ch" }}>
          {rooms.length === 0
            ? "An AI image is made from a combination on one of your colour boards, so there "
              + "has to be a finished room behind it first."
            : "These are the jobs you have finished. Pick one, choose the combination you "
              + "want to see, and we will photograph the room in it."}
        </Lead>
      </header>

      {rooms.length === 0 ? (
        <div className="hv-pick-empty">
          <p className="hv-pick-empty-title">Nothing finished yet.</p>
          <Lead style={{ maxWidth: "52ch" }}>
            Pick your colours in the studio, download the colour board, and close the room.
            Every room you finish will be here, ready to photograph.
          </Lead>
          <LinkButton href="/dashboard" variant="brass">
            Go to my rooms <span className="arr">→</span>
          </LinkButton>
        </div>
      ) : (
        <ul className="hv-pick-grid">
          {rooms.map((room) => (
            <li key={room.id}>
              {/* A link and not a button: this navigates, and a customer who wants two of
                  these open in two tabs should be able to have them. */}
              <Link
                className="hv-pick-card"
                href={`/render?project=${encodeURIComponent(room.id)}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resolveMediaUrl(room.cleanedImageUrl || room.imageUrl) ?? ""}
                  alt=""
                  loading="lazy"
                />
                <span className="hv-pick-card-name">{room.name}</span>
                <span className="hv-pick-card-meta">
                  {room.comboCount} combination{room.comboCount === 1 ? "" : "s"}
                  {room.closedAt ? ` · finished ${formatDate(room.closedAt)}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="hv-pick-error" role="alert">{error}</p>}

      <style>{`
        .hv-pick { max-width: 1180px; }
        .hv-pick-head { margin-bottom: 28px; }
        .hv-pick-head .display { font-size: clamp(30px, 4.4vw, 52px); margin: 12px 0 14px; }
        .hv-pick-loading {
          display: flex; align-items: center; gap: 10px;
          padding: 80px 0; color: var(--fg-soft); font: 400 15px/1.4 var(--sans);
        }
        .hv-pick-grid {
          list-style: none; margin: 0; padding: 0; display: grid; gap: 14px;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        }
        .hv-pick-card {
          display: grid; gap: 6px; padding: 10px; text-decoration: none;
          background: var(--surface); border: 1px solid var(--rule); border-radius: 4px;
          transition: border-color .2s var(--ease);
        }
        .hv-pick-card:hover { border-color: var(--brass); }
        .hv-pick-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .hv-pick-card img {
          display: block; width: 100%; height: 152px; object-fit: cover;
          border-radius: 3px; background: var(--surface-soft);
        }
        .hv-pick-card-name { font: 500 15px/1.25 var(--sans); color: var(--fg); }
        .hv-pick-card-meta { font: 400 12px/1.3 var(--sans); color: var(--fg-soft); }
        .hv-pick-empty { display: grid; gap: 14px; justify-items: start; padding: 8px 0 64px; }
        .hv-pick-empty-title { font: 500 16px/1.3 var(--sans); color: var(--fg); margin: 0; }
        .hv-pick-error { margin-top: 16px; font: 400 14px/1.4 var(--sans); color: var(--danger, #b3261e); }
      `}</style>
    </div>
  );
}
