"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startGalleryRoomAction } from "@/lib/free-projects";
import { Button } from "@/components/ui/button";
import { Mono } from "@/components/ui/eyebrow";
// Type only — free-projects-server is server-only, and a type import is erased.
import type { PublishedProject } from "@/lib/free-projects-server";

const ALL = "All";

const CARD: React.CSSProperties = {
  border: "1px solid var(--rule)",
  borderRadius: 8,
  overflow: "hidden",
  background: "var(--surface-soft)",
  display: "flex",
  flexDirection: "column",
};

/**
 * The library, as a signed-in visitor uses it.
 *
 * The same shelf the public gallery shows, without the marketing page around it:
 * the point here is the button, not the prose. Opening a room copies rows — it
 * reuses the photo and masks the library already stores — so nothing is uploaded,
 * wall detection never runs, and no quota, plan credit or points are spent. That
 * is why this is offered to every signed-in account and not only to an admin.
 */
export function LibraryRooms({ rooms }: { rooms: ReadonlyArray<PublishedProject> }) {
  const router = useRouter();
  const [space, setSpace] = useState<string>(ALL);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Only offer the filter when there is something to filter — a chip row over a
  // shelf that is all interiors is a control that can only ever empty the grid.
  const spaces = useMemo(() => {
    const present = Array.from(new Set(rooms.map((r) => r.space)));
    return present.length > 1 ? [ALL, ...present] : [];
  }, [rooms]);

  const shown = space === ALL ? rooms : rooms.filter((r) => r.space === space);

  function open(slug: string) {
    setBusySlug(slug);
    setError(null);
    startTransition(async () => {
      const res = await startGalleryRoomAction(slug);
      if (res.started) {
        // An ordinary project from here on — indistinguishable from an uploaded one.
        router.push(`/studio?project=${encodeURIComponent(res.started.projectId)}`);
        return;
      }
      setBusySlug(null);
      if (res.signInRequired) {
        // Inside the app shell this means the session aged out mid-page rather
        // than "you are a visitor", so come back here once it is renewed.
        router.push(`/sign-in?next=${encodeURIComponent("/library")}`);
        return;
      }
      setError(res.error ?? "Could not open this room. Please try again.");
    });
  }

  return (
    <div>
      {error && (
        <p className="field-error" role="alert" style={{ marginTop: 20 }}>
          {error}
        </p>
      )}

      {spaces.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginTop: 24, flexWrap: "wrap" }}>
          {spaces.map((s) => {
            const active = s === space;
            const label = s === ALL ? "All rooms" : s === "EXTERIOR" ? "Exteriors" : "Interiors";
            const count = s === ALL ? rooms.length : rooms.filter((r) => r.space === s).length;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSpace(s)}
                aria-pressed={active}
                style={{
                  padding: "8px 16px",
                  borderRadius: 999,
                  cursor: "pointer",
                  border: `1px solid ${active ? "var(--accent-soft)" : "var(--rule-strong)"}`,
                  background: active ? "var(--accent-soft)" : "transparent",
                  color: active ? "var(--surface)" : "var(--fg-soft)",
                  font: "500 12px/1 var(--mono)",
                  letterSpacing: ".1em",
                  textTransform: "uppercase",
                }}
              >
                {label} ({count})
              </button>
            );
          })}
        </div>
      )}

      <div
        className="r-cols-md-2 r-cols-xs-1"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 20,
          marginTop: 28,
          alignItems: "start",
        }}
      >
        {shown.map((room) => (
          <article key={room.slug} style={CARD}>
            <div
              style={{
                position: "relative",
                aspectRatio: room.imageWidth && room.imageHeight
                  ? `${room.imageWidth} / ${room.imageHeight}`
                  : "4 / 3",
                background: "var(--surface)",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- backend-signed URL, not a static asset */}
              <img
                src={room.imageUrl}
                alt={room.description || `${room.title} — ${room.roomLabel}`}
                loading="lazy"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            </div>

            <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
              <div>
                <h3 style={{ font: "400 18px/1.3 var(--serif)", margin: 0 }}>{room.title}</h3>
                <Mono style={{ color: "var(--fg-mute)", display: "block", marginTop: 6 }}>
                  {room.roomLabel} · {room.wallCount} {room.wallCount === 1 ? "surface" : "surfaces"}
                </Mono>
              </div>

              {room.description && (
                <p style={{ margin: 0, font: "300 14px/1.6 var(--serif)", color: "var(--fg-soft)" }}>
                  {room.description}
                </p>
              )}

              {room.colours.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  {room.colours.slice(0, 6).map((c, i) => (
                    <span
                      key={`${c.hex}-${i}`}
                      title={[c.label, c.shadeCode].filter(Boolean).join(" · ") || c.hex}
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 4,
                        background: c.hex,
                        border: "1px solid var(--rule-strong)",
                      }}
                    />
                  ))}
                </div>
              )}

              <div style={{ marginTop: "auto", paddingTop: 6 }}>
                <Button
                  size="sm"
                  onClick={() => open(room.slug)}
                  disabled={busySlug !== null}
                  aria-label={`Open ${room.title} in the studio`}
                >
                  {busySlug === room.slug ? "Opening…" : "Open this room"}
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
