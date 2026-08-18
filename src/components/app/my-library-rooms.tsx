"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mono } from "@/components/ui/eyebrow";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import type { ProjectSummary } from "@/lib/types";

/**
 * The library rooms this account has already opened and painted.
 *
 * <b>Why they live here and not on the dashboard.</b> A dashboard project is a job: a
 * photo the account uploaded, walls it paid to have found, a colour board at the end. A
 * library room is a copy of something already finished — free to open, free to open
 * again, and openable a dozen times in an afternoon by somebody trying colours out.
 * Mixed into one grid the free browsing buries the paid work, and the count beside it
 * ("3 of 5 projects") stops describing anything a customer recognises.
 *
 * <b>But they are not thrown away.</b> Somebody who spent twenty minutes painting a
 * library room and closed the tab has to be able to get back to it, and the place they
 * will look is the shelf they took it from. So this sits directly above that shelf: what
 * you have already painted, then what else there is to paint.
 *
 * Silent on failure and silent when empty. The shelf below is the point of the page, and
 * an error about a list of copies nobody has made yet would be noise in front of it.
 */
export function MyLibraryRooms() {
  const [rooms, setRooms] = useState<ProjectSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listProjects()
      .then((list) => !cancelled && setRooms(list.filter((p) => p.fromLibrary)))
      .catch(() => !cancelled && setRooms([]));
    return () => {
      cancelled = true;
    };
  }, []);

  if (rooms === null) {
    return (
      <p style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 28, color: "var(--fg-mute)" }}>
        <Spinner size={12} color="currentColor" /> <Mono>Looking for rooms you&rsquo;ve painted…</Mono>
      </p>
    );
  }
  if (rooms.length === 0) return null;

  return (
    <section style={{ marginTop: 36 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16 }}>
        <h2 style={{ font: "400 26px/1.2 var(--serif)", margin: 0 }}>Rooms you&rsquo;ve painted</h2>
        <Mono style={{ color: "var(--fg-mute)" }}>
          {rooms.length} {rooms.length === 1 ? "room" : "rooms"}
        </Mono>
      </div>
      <p style={{ marginTop: 10, font: "300 15px/1.6 var(--serif)", color: "var(--fg-soft)", maxWidth: "58ch" }}>
        Library rooms keep their colours. Open one again to carry on — the walls stay as
        they were marked when the room was published, and the paint is yours to change.
      </p>

      <div
        className="r-cols-md-2 r-cols-xs-1"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 16,
          marginTop: 20,
          alignItems: "start",
        }}
      >
        {rooms.map((room) => (
          <Link
            key={room.id}
            href={`/studio?project=${encodeURIComponent(room.id)}`}
            style={{
              border: "1px solid var(--rule)",
              borderRadius: 8,
              overflow: "hidden",
              background: "var(--surface-soft)",
              display: "block",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            {room.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- backend-signed URL
              <img
                src={room.imageUrl}
                alt={room.name || "Painted room"}
                loading="lazy"
                style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", display: "block" }}
              />
            ) : (
              <div style={{ aspectRatio: "4 / 3", background: "var(--surface)" }} aria-hidden />
            )}
            <div style={{ padding: "12px 14px 14px" }}>
              <span style={{ font: "400 17px/1.3 var(--serif)", display: "block" }}>
                {room.name || "Untitled room"}
              </span>
              <Mono style={{ color: "var(--fg-mute)", display: "block", marginTop: 6 }}>
                {room.closedAt ? "Finished" : "In progress"}
              </Mono>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
