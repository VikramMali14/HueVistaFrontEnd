import type { Metadata } from "next";
import Link from "next/link";
import { getMaskReports, requireRole, updateMaskReportAction } from "@/lib/auth";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { MaskReports } from "@/components/admin/mask-reports";

export const metadata: Metadata = {
  title: "Admin · Mask reports",
  description: "AI runs reported as wrong — bad wall detection, a damaged clean-up, or a run that found no walls at all.",
};

/**
 * The queue for AI runs that came out wrong.
 *
 * There is a whole class of failure the platform cannot see on its own: a run
 * that puts the walls in the wrong places still returns SEGMENTED, still writes
 * its regions, and passes every check the backend makes. The only party who can
 * tell a good run from a bad one is the person looking at their own room — so
 * every row here arrived because somebody pressed a button in the studio, and
 * this page is the sole record that any of it happened.
 *
 * `includeResolved` is a query flag rather than a filter in the component so a
 * closed report can be linked to directly.
 */
export default async function AdminMaskReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ resolved?: string }>;
}) {
  await requireRole(["ADMIN"]);
  const { resolved } = await searchParams;
  const includeResolved = resolved === "1";
  const reports = await getMaskReports(includeResolved);

  return (
    <div className="measure" style={{ maxWidth: 1080 }}>
      <Link href="/admin" style={{ font: "500 13px/1 var(--mono)", color: "var(--accent-text)" }}>
        ← Admin
      </Link>
      <Eyebrow style={{ marginTop: 16 }}>Admin · reported runs</Eyebrow>
      <h1 className="display" style={{ fontSize: "clamp(34px, 5vw, 56px)", margin: "12px 0 14px" }}>
        When the AI <i>got it wrong.</i>
      </h1>
      <Lead style={{ maxWidth: "62ch" }}>
        A run that detects the wrong walls still reports success — nothing in the pipeline can
        tell the difference. These are the rooms where somebody looked at the result and said so.
        Each row carries the state of that particular run, because re-running segmentation
        overwrites it on the project itself.
      </Lead>
      <Lead style={{ maxWidth: "62ch", marginTop: 14 }}>
        Some rows nobody wrote in about. When the photo clean-up succeeds and wall detection
        then finds nothing, the room is handed over for the walls to be marked by hand rather
        than failed — so the customer has something that works and no reason to complain. The
        run files that one itself, marked{" "}
        <strong style={{ fontWeight: 500 }}>raised by the pipeline</strong>.
      </Lead>

      <p style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: "8px 24px" }}>
        <Link
          href={includeResolved ? "/admin/mask-reports" : "/admin/mask-reports?resolved=1"}
          style={{ font: "500 13px/1 var(--mono)", color: "var(--accent-text)" }}
        >
          {includeResolved ? "Open reports only →" : "Include resolved →"}
        </Link>
        <Link href="/admin/mask-viewer" style={{ font: "500 13px/1 var(--mono)", color: "var(--accent-text)" }}>
          Mask viewer →
        </Link>
      </p>

      <div style={{ marginTop: 32 }}>
        <MaskReports initial={reports} updateAction={updateMaskReportAction} />
      </div>
    </div>
  );
}
