import type { Metadata } from "next";
import Link from "next/link";
import { previewDataResetAction, requireRole, resetPlatformDataAction } from "@/lib/auth";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { ResetPlatformData } from "@/components/admin/reset-platform-data";

export const metadata: Metadata = {
  title: "Admin · Maintenance & migration",
  description: "Run one-off data maintenance and migration passes over the platform.",
};

/**
 * Admin-only maintenance & migration hub. A home for the platform's one-off
 * data passes (the kind previously run by hand with curl against the admin API)
 * so they can be triggered safely from the console. Gated to ROLE_ADMIN.
 */
export default async function AdminMigrationPage() {
  await requireRole(["ADMIN"]);
  return (
    <div className="measure" style={{ maxWidth: 820 }}>
      <Link href="/admin" style={{ font: "500 13px/1 var(--mono)", color: "var(--accent-text)" }}>
        ← Admin
      </Link>
      <Eyebrow style={{ marginTop: 16 }}>Admin · maintenance</Eyebrow>
      <h1 className="display" style={{ fontSize: "clamp(34px, 5vw, 56px)", margin: "12px 0 14px" }}>
        Maintenance &amp; <i>migration.</i>
      </h1>
      <Lead style={{ maxWidth: "56ch" }}>
        One-off data passes over the whole platform. These run against the admin API with your
        signed-in session — no tokens to copy, no shell required. The maintenance passes are safe
        to re-run; anything in a red danger zone is not.
      </Lead>

      <section style={{ marginTop: 64, borderTop: "1px solid var(--rule)", paddingTop: 40 }}>
        <h2 className="display" style={{ fontSize: "clamp(24px, 3.2vw, 34px)", marginBottom: 8 }}>
          Catalogue data
        </h2>
        <p style={{ font: "300 17px/1.6 var(--serif)", color: "var(--fg-soft)", maxWidth: "56ch", marginBottom: 16 }}>
          Seeding, bulk-importing and wiping paint-company shades take a JSON payload, so they live
          on the shade importer rather than as one-click passes here.
        </p>
        <Link href="/admin/shades" style={{ font: "500 13px/1 var(--mono)", color: "var(--accent-text)" }}>
          Go to shade importer →
        </Link>
      </section>

      <section style={{ marginTop: 64, borderTop: "1px solid var(--rule)", paddingTop: 40 }}>
        <h2 className="display" style={{ fontSize: "clamp(24px, 3.2vw, 34px)", marginBottom: 8 }}>
          Start fresh
        </h2>
        <p style={{ font: "300 17px/1.6 var(--serif)", color: "var(--fg-soft)", maxWidth: "56ch", marginBottom: 16 }}>
          Clear the platform of every account, shop and project while keeping the paint catalogue —
          for going live after a pilot, or clearing out test data. Unlike the passes above, this one
          is <strong>not</strong> safe to re-run casually: it is irreversible.
        </p>
        <ResetPlatformData
          previewAction={previewDataResetAction}
          resetAction={resetPlatformDataAction}
        />
      </section>
    </div>
  );
}
