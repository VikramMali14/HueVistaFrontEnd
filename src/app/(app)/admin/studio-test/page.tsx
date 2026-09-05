import type { Metadata } from "next";
import Link from "next/link";
import { loadAdminProjectAction, requireRole, searchAllProjectsAction } from "@/lib/auth";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { StudioTest } from "@/components/admin/studio-test";
import { getCatalogueOrSample } from "@/lib/catalogue";

export const metadata: Metadata = {
  title: "Admin · Studio bench",
  description: "Paint any room's masks with the studio's own engine, against the untouched canvas.",
};

/**
 * Admin-only paint bench. Opens any room on the platform on its CLEANED canvas,
 * paints the stored masks through the same recolour engine the studio runs, and
 * puts the result against the untouched canvas — slider, side by side, or either
 * on its own. Gated to ROLE_ADMIN.
 *
 * Separate from /studio and deliberately not a variant of it. The studio is what a
 * customer buys paint through: it saves, it spends credits, it hides the machinery
 * on purpose. Testing needs the opposite of all three, and the two sets of needs
 * have no business sharing a component — so nothing here writes to a project, and
 * the visualizer is untouched.
 *
 * Sits next to the mask viewer, one question further on. That screen asks whether
 * the mask is the right SHAPE; this one asks how paint lands inside it — which is
 * where shadow preservation, the edge nudge and the cleaned-vs-original canvas
 * actually show themselves.
 *
 * `project` preselects a room, so the mask viewer and the reports queue can hand
 * one straight over.
 */
export default async function AdminStudioTestPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  await requireRole(["ADMIN"]);
  const { project } = await searchParams;
  // Null (not an empty list) when the fetch fails — the bench says something
  // different for each, and an outage shown as "no rooms" would send an admin
  // looking for a room that is actually there.
  const [{ rows }, shades] = await Promise.all([
    searchAllProjectsAction(""),
    getCatalogueOrSample(),
  ]);

  return (
    <div className="measure" style={{ maxWidth: 1080 }}>
      <Link href="/admin" style={{ font: "500 13px/1 var(--mono)", color: "var(--accent-text)" }}>
        ← Admin
      </Link>
      <Eyebrow style={{ marginTop: 16 }}>Admin · diagnostics</Eyebrow>
      <h1 className="display" style={{ fontSize: "clamp(34px, 5vw, 56px)", margin: "12px 0 14px" }}>
        Studio <i>bench.</i>
      </h1>
      <Lead style={{ maxWidth: "60ch" }}>
        Open any room on the platform on its cleaned canvas, paint its walls with the
        studio&rsquo;s own engine, and drag the untouched canvas back over the result. The
        knobs the studio keeps compiled in &mdash; shadow preservation, the edge nudge, soft
        edges &mdash; are on the surface here, and the canvas itself switches between cleaned
        and original, so what the clean-up contributed is visible after the fact.
      </Lead>
      <p style={{ marginTop: 14, font: "300 15px/1.6 var(--serif)", color: "var(--fg-soft)", maxWidth: "60ch" }}>
        Nothing here is saved. The colours you try are never written to the room, never
        spend a credit, and never replace the shade its owner chose.
      </p>

      <p style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: "8px 24px" }}>
        <Link href="/admin/mask-viewer" style={{ font: "500 13px/1 var(--mono)", color: "var(--accent-text)" }}>
          Mask viewer &mdash; is the mask the right shape? &rarr;
        </Link>
        <Link href="/admin/mask-reports" style={{ font: "500 13px/1 var(--mono)", color: "var(--accent-text)" }}>
          Reported runs &rarr;
        </Link>
      </p>

      <StudioTest
        initial={rows ?? null}
        searchAction={searchAllProjectsAction}
        loadAction={loadAdminProjectAction}
        shades={shades}
        initialProjectId={project}
      />
    </div>
  );
}
