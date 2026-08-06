import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import {
  deleteFreeProjectsAction,
  getFreeProjectSources,
  getFreeProjects,
  publishFreeProjectAction,
  setFreeProjectPublishedAction,
  startFreeProjectAction,
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
export default async function AdminFreeProjectsPage() {
  await requireRole(["ADMIN"]);
  const [templates, sources] = await Promise.all([getFreeProjects(), getFreeProjectSources()]);

  return (
    <div style={{ maxWidth: 1080 }}>
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
        publishAction={publishFreeProjectAction}
        startAction={startFreeProjectAction}
        setPublishedAction={setFreeProjectPublishedAction}
        deleteAction={deleteFreeProjectsAction}
      />
    </div>
  );
}
