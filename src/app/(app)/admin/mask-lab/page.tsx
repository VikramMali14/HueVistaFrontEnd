import type { Metadata } from "next";
import Link from "next/link";
import { requireRole, runMaskLabAction } from "@/lib/auth";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { MaskLab } from "@/components/admin/mask-lab";

export const metadata: Metadata = {
  title: "Admin · Mask lab",
  description: "Run one photograph through each way of producing a mask, and compare.",
};

/**
 * Admin-only. The mask viewer asks whether a mask is on the wall and the align
 * bench moves it when it is not; this asks the question behind both — whether
 * the mask should be made a different way in the first place.
 *
 * Writes to no project and spends no credit. ROLE_ADMIN.
 */
export default async function AdminMaskLabPage() {
  await requireRole(["ADMIN"]);

  return (
    <div className="measure" style={{ maxWidth: 1180 }}>
      <Link href="/admin" style={{ font: "500 13px/1 var(--mono)", color: "var(--accent-text)" }}>
        ← Admin
      </Link>
      <Eyebrow style={{ marginTop: 16 }}>Admin · diagnostics</Eyebrow>
      <h1 className="display" style={{ fontSize: "clamp(34px, 5vw, 56px)", margin: "12px 0 14px" }}>
        Mask <i>lab.</i>
      </h1>
      <Lead style={{ maxWidth: "62ch" }}>
        Wall detection asks an image model to repaint the photo into flat category colours.
        That model knows what a wall is, and it redraws rather than traces — which is why
        its blocks land a little off, and why there is an aligner and an align bench behind
        it. This screen asks whether some other approach avoids that instead of correcting
        it. Upload a cleaned photo, run each one against it, and compare.
      </Lead>

      <p style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: "8px 24px" }}>
        <Link href="/admin/mask-viewer" style={{ font: "500 13px/1 var(--mono)", color: "var(--accent-text)" }}>
          Mask viewer — is it on the wall? →
        </Link>
        <Link href="/admin/mask-align" style={{ font: "500 13px/1 var(--mono)", color: "var(--accent-text)" }}>
          Align bench — move a drifted mask →
        </Link>
      </p>

      <MaskLab runAction={runMaskLabAction} />
    </div>
  );
}
