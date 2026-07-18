import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { MaskViewer } from "@/components/admin/mask-viewer";

export const metadata: Metadata = {
  title: "Admin · Mask viewer",
  description: "Inspect a project's raw model mask against the stored region masks.",
};

/**
 * Admin-only segmentation diagnostics. Overlays the model's raw colour-coded
 * mask and the stored region masks (raw splits of that image) on the project
 * photo, with per-layer toggles and a raw-vs-stored diff. Gated to ROLE_ADMIN.
 * Reads the signed-in admin's own projects (upload a test photo to inspect it).
 */
export default async function AdminMaskViewerPage() {
  await requireRole(["ADMIN"]);
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
        Pick one of your projects and see every mask as a layer over the photo: the raw
        red/green/blue image the model generated, the stored regions the studio actually
        paints through, and a raw-vs-stored diff. Toggle layers to judge what fits and
        what needs to go.
      </Lead>
      <MaskViewer />
    </div>
  );
}
