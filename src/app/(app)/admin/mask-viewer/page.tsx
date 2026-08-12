import type { Metadata } from "next";
import Link from "next/link";
import { loadAdminProjectAction, requireRole, searchAllProjectsAction } from "@/lib/auth";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { MaskViewer } from "@/components/admin/mask-viewer";

export const metadata: Metadata = {
  title: "Admin · Mask viewer",
  description: "Inspect any room's raw model mask against the stored region masks.",
};

/**
 * Admin-only segmentation diagnostics. Overlays the model's raw colour-coded
 * mask and the stored region masks (raw splits of that image) on the project
 * photo, with per-layer toggles and a raw-vs-stored diff. Gated to ROLE_ADMIN.
 *
 * Reads EVERY room on the platform. It used to read only the admin's own uploads,
 * which are the one set of rooms nobody ever reports — a bad run passes every check
 * the backend makes, so the rooms worth opening here are always someone else's.
 *
 * `project` preselects a room, so a row in the reports queue can link straight to
 * the masks it is complaining about.
 */
export default async function AdminMaskViewerPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  await requireRole(["ADMIN"]);
  const { project } = await searchParams;
  // Null (not an empty list) when the fetch fails — the viewer says something
  // different for each, and an outage shown as "no rooms" would send an admin
  // looking for a room that is actually there.
  const { rows } = await searchAllProjectsAction("");

  return (
    <div style={{ maxWidth: 1080 }}>
      <Link href="/admin" style={{ font: "500 13px/1 var(--mono)", color: "var(--accent-soft)" }}>
        ← Admin
      </Link>
      <Eyebrow style={{ marginTop: 16 }}>Admin · diagnostics</Eyebrow>
      <h1 className="display" style={{ fontSize: "clamp(34px, 5vw, 56px)", margin: "12px 0 14px" }}>
        Mask <i>viewer.</i>
      </h1>
      <Lead style={{ maxWidth: "60ch" }}>
        Open any room on the platform — anyone&rsquo;s account, any shop&rsquo;s walk-in
        customer — and see every mask as a layer over the photo: the raw red/green/blue
        image the model generated, the stored regions the studio actually paints through,
        and a raw-vs-stored diff. Toggle layers to judge what fits and what needs to go.
      </Lead>

      <p style={{ marginTop: 16 }}>
        <Link href="/admin/mask-reports" style={{ font: "500 13px/1 var(--mono)", color: "var(--accent-soft)" }}>
          Reported runs →
        </Link>
      </p>

      <MaskViewer
        initial={rows ?? null}
        searchAction={searchAllProjectsAction}
        loadAction={loadAdminProjectAction}
        initialProjectId={project}
      />
    </div>
  );
}
