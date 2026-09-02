import type { Metadata } from "next";
import Link from "next/link";
import {
  applyMaskRegistrationAction,
  loadAdminProjectAction,
  loadMaskRegistrationAction,
  requireRole,
  searchAllProjectsAction,
} from "@/lib/auth";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { MaskAlign } from "@/components/admin/mask-align";

export const metadata: Metadata = {
  title: "Admin · Mask align",
  description: "Put a drifted mask back on its walls by hand, and store where it belongs.",
};

/**
 * Admin-only mask registration. The mask viewer beside it answers "is this mask
 * on the wall?"; this one is where the answer is no and somebody has to move it.
 *
 * Gated to ROLE_ADMIN, and the one write on the admin project surface. It moves
 * the model's drawing without reshaping it, leaves hand-drawn walls alone, and
 * spends no credit — see MaskRegistrationService for what it will and will not do.
 */
export default async function AdminMaskAlignPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  await requireRole(["ADMIN"]);
  const { project } = await searchParams;
  const { rows } = await searchAllProjectsAction("");

  return (
    <div className="measure" style={{ maxWidth: 1180 }}>
      <Link href="/admin" style={{ font: "500 13px/1 var(--mono)", color: "var(--accent-soft)" }}>
        ← Admin
      </Link>
      <Eyebrow style={{ marginTop: 16 }}>Admin · diagnostics</Eyebrow>
      <h1 className="display" style={{ fontSize: "clamp(34px, 5vw, 56px)", margin: "12px 0 14px" }}>
        Mask <i>align.</i>
      </h1>
      <Lead style={{ maxWidth: "62ch" }}>
        Wall detection draws its masks by repainting the photo, and a repaint is not
        pixel-registered to what it was drawn from. The automatic correction is
        deliberately timid — it would rather do nothing than guess — so the rooms it
        gives up on are the ones somebody has to finish by hand. Drag the mask onto the
        building, then pull a grid over the parts still off, and store where it belongs.
      </Lead>

      <p style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: "8px 24px" }}>
        <Link href="/admin/mask-viewer" style={{ font: "500 13px/1 var(--mono)", color: "var(--accent-soft)" }}>
          Mask viewer — is it on the wall? →
        </Link>
        <Link href="/admin/studio-test" style={{ font: "500 13px/1 var(--mono)", color: "var(--accent-soft)" }}>
          Studio bench — paint these masks →
        </Link>
      </p>

      <MaskAlign
        initial={rows ?? null}
        searchAction={searchAllProjectsAction}
        loadAction={loadAdminProjectAction}
        loadRegistrationAction={loadMaskRegistrationAction}
        applyAction={applyMaskRegistrationAction}
        initialProjectId={project}
      />
    </div>
  );
}
