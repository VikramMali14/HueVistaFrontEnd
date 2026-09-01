import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import {
  deleteFreeProjectsAction,
  getFreeProjectSources,
  getFreeProjects,
  publishFreeProjectAction,
  refreshFreeProjectAction,
  setFreeProjectPublishedAction,
  startFreeProjectAction,
  updateFreeProjectAction,
} from "@/lib/free-projects";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { FreeProjectLibrary } from "@/components/admin/free-project-library";

export const metadata: Metadata = {
  title: "Admin · Free projects",
  description: "Ready-made rooms anyone can open without uploading a photo or running wall detection.",
};

/**
 * The free-project library, admin-only while it is being tried out.
 *
 * A free project is a room that was finished once — real photo, real masks — and
 * then frozen. Opening one copies rows, not pixels: the copy points at the
 * template's stored photo and masks, so the AI never runs, nothing is uploaded,
 * and no quota or credit is touched. That is what makes it safe for the same
 * five living rooms to be opened by everybody.
 */
export default async function AdminFreeProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; title?: string }>;
}) {
  await requireRole(["ADMIN"]);
  // Arriving from the studio's "Add to gallery": the room to publish is already
  // decided, so the form opens on it instead of asking the admin to find it again
  // in a list of sixty. Ignored when it names a project that isn't publishable —
  // the picker is the authority on that, not the link.
  const { project: preselectProjectId, title: preselectTitle } = await searchParams;
  const [templates, sources] = await Promise.all([getFreeProjects(), getFreeProjectSources()]);
  // The in-app Library has nothing to show until a room is published, so its link
  // would be a dead end; /work and /gallery both fall back to built-in rooms and
  // are never empty. The three travel together because they are the same
  // question — "where does this end up?" — and answering it with one link while
  // the shelf is empty is worse than answering it with none.
  const anyPublished = (templates ?? []).some((t) => t.published);

  return (
    <div className="measure" style={{ maxWidth: 1080 }}>
      <Link href="/admin" style={{ font: "500 13px/1 var(--mono)", color: "var(--accent-soft)" }}>
        ← Admin
      </Link>
      <Eyebrow style={{ marginTop: 16 }}>Admin · free projects</Eyebrow>
      <h1 className="display" style={{ fontSize: "clamp(34px, 5vw, 56px)", margin: "12px 0 14px" }}>
        Rooms that are <i>already made.</i>
      </h1>
      <Lead style={{ maxWidth: "60ch" }}>
        A small library of finished rooms — five or so of each kind, interiors by room and
        exteriors by style — that anyone can open and start painting straight away. No photo
        to upload, no walls to wait for.
      </Lead>

      {anyPublished && (
        <p style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: "8px 24px" }}>
          <Link href="/library" style={{ font: "500 13px/1 var(--mono)", color: "var(--accent-soft)" }}>
            The library, as an account sees it →
          </Link>
          <Link href="/work" style={{ font: "500 13px/1 var(--mono)", color: "var(--accent-soft)" }}>
            Our work →
          </Link>
          <Link href="/gallery" style={{ font: "500 13px/1 var(--mono)", color: "var(--accent-soft)" }}>
            The public gallery →
          </Link>
        </p>
      )}

      <div
        style={{
          marginTop: 28,
          padding: "18px 20px",
          border: "1px solid var(--rule-strong)",
          background: "var(--surface-soft)",
          borderRadius: 8,
        }}
      >
        <p
          style={{
            margin: 0,
            font: "400 12px/1.6 var(--mono)",
            letterSpacing: ".16em",
            textTransform: "uppercase",
            color: "var(--fg-mute)",
          }}
        >
          Made once · opened many times
        </p>
        <ul style={{ margin: "12px 0 0", paddingLeft: 20, font: "300 16px/1.7 var(--serif)", color: "var(--fg-soft)" }}>
          <li>
            The photo and the wall masks are stored <strong>once</strong>, when you publish. Every
            copy anyone opens points back at those same files — a thousand people opening the
            same kitchen is a thousand small database rows over one copy of the picture.
          </li>
          <li>
            Because the masks already exist, opening a free project <strong>never calls the AI</strong>
            {" "}and costs nothing: no plan credit, no points, no project allowance.
          </li>
          <li>
            Publishing asks <strong>which page</strong> the room goes on: <strong>Our work</strong>,
            the portfolio where a room carries a story; the <strong>Gallery</strong> grid; or both.
            Rooms published before this existed are on the Gallery, where they have always been —
            press <strong>Edit</strong> on any of them to move it. Hiding a room takes it off
            whichever page it is on; showing it puts it back. While no room is published to a
            page, that page falls back to its built-in demonstration rooms.
          </li>
          <li>
            A room on <strong>Our work</strong> can carry a location, a year, a credit line, a
            story and a few numbers. All optional, and all editable afterwards — publish the room
            when it is ready and write about it when there is something to say. What is never
            typed is the palette: those are the shades actually on the walls in the picture.
          </li>
          <li>
            Publishing takes a <strong>copy</strong> of the walls, so repainting the original
            never moves the shelf underneath anyone. That also means a mask cannot be fixed by
            editing the original alone — mark the walls in the studio, then press{" "}
            <strong>Update walls</strong> on the room. People already holding a copy keep the
            version they opened.
          </li>
          <li>
            Copies are ordinary projects once opened — people repaint, save and share them
            normally, and deleting a copy leaves the library untouched.
          </li>
          <li>
            Removing a room asks which you mean: <strong>take it off the shelf</strong> and the
            stored files stay, so every copy already open keeps working; <strong>delete the
            files too</strong> and the storage is freed, but the copies pointing at them lose
            their picture. The count of live copies is shown before you choose.
          </li>
        </ul>
      </div>

      <FreeProjectLibrary
        initial={templates}
        sources={sources}
        preselectProjectId={preselectProjectId}
        preselectTitle={preselectTitle}
        publishAction={publishFreeProjectAction}
        startAction={startFreeProjectAction}
        setPublishedAction={setFreeProjectPublishedAction}
        refreshAction={refreshFreeProjectAction}
        updateAction={updateFreeProjectAction}
        deleteAction={deleteFreeProjectsAction}
      />
    </div>
  );
}
