import type { Metadata } from "next";
import Link from "next/link";
import { requireRole, getUploadBrands } from "@/lib/auth";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { ShadeUploadForm } from "@/components/admin/shade-upload-form";
import { DeleteAllShades } from "@/components/admin/delete-all-shades";

export const metadata: Metadata = {
  title: "Admin · Upload shades",
  description: "Bulk-upload a paint company's shades from a JSON array.",
};

/**
 * Admin-only shade importer. Pick a company (or add a new one), upload a JSON array of
 * shades, and they're added to the catalogue. Gated to ROLE_ADMIN.
 */
export default async function AdminShadesPage() {
  await requireRole(["ADMIN"]);
  const brands = await getUploadBrands();
  return (
    <div style={{ maxWidth: 820 }}>
      <Link href="/admin" style={{ font: "500 13px/1 var(--mono)", color: "var(--accent-soft)" }}>
        ← Admin
      </Link>
      <Eyebrow style={{ marginTop: 16 }}>Admin · catalogue</Eyebrow>
      <h1 className="display" style={{ fontSize: "clamp(34px, 5vw, 56px)", margin: "12px 0 14px" }}>
        Upload a company&apos;s <i>shades.</i>
      </h1>
      <Lead style={{ maxWidth: "56ch" }}>
        Pick a paint company (or add a new one), then drop in a JSON array of its shades. New shades are added
        to the catalogue; ones already present are skipped.
      </Lead>
      <ShadeUploadForm initialBrands={brands} />
      <DeleteAllShades />
    </div>
  );
}
