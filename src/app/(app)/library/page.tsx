import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { fetchPublishedProjects } from "@/lib/free-projects-server";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { LibraryRooms } from "@/components/app/library-rooms";
import { MyLibraryRooms } from "@/components/app/my-library-rooms";

export const metadata: Metadata = {
  title: "Library",
  description: "Ready-made rooms you can open and paint straight away — no photo to upload, nothing to spend.",
};

/**
 * The free-room library, inside the app.
 *
 * The same published shelf the public /gallery shows, but reached from the app
 * nav and stripped of the marketing page around it. It exists because the shelf
 * had nowhere to be seen from once you were signed in: the admin console is where
 * rooms are PUT on it, /gallery is a page for visitors who are not signed in, and
 * an account that wanted to open one had to leave the app to find it.
 *
 * Open to every signed-in role, which mirrors the backend: publishing is
 * ROLE_ADMIN, but `POST /api/free-projects/{slug}/start` only asks for a session,
 * because opening a copy costs nothing to serve — it reuses the stored photo and
 * masks and never calls the AI.
 */
export default async function LibraryPage() {
  const [rooms, user] = await Promise.all([fetchPublishedProjects(), getCurrentUser()]);
  const isAdmin = user?.role === "ADMIN";

  return (
    <div style={{ maxWidth: 1080 }}>
      <Eyebrow>Library</Eyebrow>
      <h1 className="display" style={{ fontSize: "clamp(34px, 5vw, 56px)", margin: "12px 0 14px" }}>
        Rooms that are <i>already made.</i>
      </h1>
      <Lead style={{ maxWidth: "60ch" }}>
        Finished rooms with their walls already marked. Open one and it is yours to paint,
        save and share — there is no photo to upload, no wall detection to wait for, and
        nothing to pay, because the room reuses pictures we have already stored. The walls
        stay as they were marked when the room was published; the paint is yours.
      </Lead>

      {/* What this account has already painted, above the shelf it came from.
          Library rooms are kept off the dashboard — free browsing would bury the paid
          work there — so this is where somebody who spent twenty minutes on one and
          closed the tab comes looking, and it is the same place they took it from.
          Renders nothing until there is a room to show. */}
      <MyLibraryRooms />

      {isAdmin && (
        <p style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: "8px 24px" }}>
          <Link href="/admin/free-projects" style={{ font: "500 13px/1 var(--mono)", color: "var(--accent-soft)" }}>
            Manage the shelf →
          </Link>
          {rooms.length > 0 && (
            <Link href="/gallery" style={{ font: "500 13px/1 var(--mono)", color: "var(--accent-soft)" }}>
              See it as a visitor does →
            </Link>
          )}
        </p>
      )}

      {rooms.length === 0 ? (
        // Reachable by URL even though the nav tab is hidden while the shelf is
        // empty — so it has to say which of the two it is, and to an admin, where
        // the fix lives.
        <p style={{ marginTop: 32, font: "300 17px/1.7 var(--serif)", color: "var(--fg-soft)", maxWidth: "60ch" }}>
          Nothing is on the shelf yet.{" "}
          {isAdmin ? (
            <>
              Publish a project that has its walls marked from{" "}
              <Link href="/admin/free-projects" style={{ color: "var(--accent)" }}>
                the admin console
              </Link>{" "}
              and it will appear here, and on the public gallery, straight away.
            </>
          ) : (
            <>Ready-made rooms will show up here as they are published.</>
          )}
        </p>
      ) : (
        <LibraryRooms rooms={rooms} />
      )}
    </div>
  );
}
