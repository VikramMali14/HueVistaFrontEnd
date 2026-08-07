import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { fetchSiteAssets } from "@/lib/site-assets-server";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { SiteAssetManager } from "@/components/admin/site-asset-manager";

export const metadata: Metadata = {
  title: "Admin · Site images",
  description: "Replace the pictures on the public site without a deploy.",
};

/**
 * The pictures on the marketing site, editable in place.
 *
 * The home page's before/after slider is why this page exists. It carries the
 * product's central claim — same room, same light, only the wall colour changed
 * — and it was making that claim with two CSS gradients, because putting a real
 * photograph there meant editing a component and shipping a release. Anything
 * that needs a deploy to change is a thing that does not get changed.
 *
 * Read live rather than cached: an admin who has just uploaded needs to see what
 * is actually stored, not a copy of the manifest from before their change.
 */
export const dynamic = "force-dynamic";

export default async function SiteAssetsPage() {
  await requireRole(["ADMIN"]);
  const assets = await fetchSiteAssets();

  return (
    <div style={{ maxWidth: 1080 }}>
      <Eyebrow>Admin · site images</Eyebrow>
      <h1 className="display" style={{ fontSize: "clamp(34px, 5vw, 56px)", margin: "12px 0 14px" }}>
        The pictures <i>on the public site.</i>
      </h1>
      <Lead style={{ maxWidth: "60ch" }}>
        Each position below is a fixed spot in the design. Drop a new image into one and the
        public site shows it — no release, no developer. Pick a file and you frame it to that
        spot&rsquo;s shape first, then see it in place; nothing goes live until you save.
      </Lead>

      <p style={{ marginTop: 16 }}>
        <Link href="/admin" style={{ font: "500 13px/1 var(--sans)", color: "var(--accent-text)" }}>
          ← Back to the accounts console
        </Link>
      </p>

      <div style={{ marginTop: 48 }}>
        <SiteAssetManager initial={assets} />
      </div>

      <p
        style={{
          marginTop: 8,
          padding: "16px 18px",
          border: "1px solid var(--rule-strong)",
          borderRadius: 10,
          font: "400 14px/1.6 var(--sans)",
          color: "var(--fg-soft)",
          maxWidth: "72ch",
        }}
      >
        JPEG, PNG or WebP, straight off the camera is fine — every picture is cropped to its
        slot&rsquo;s shape and squeezed under the size limit in your browser before it is sent, so
        there is nothing to resize first and no file that is &ldquo;too large&rdquo;. Removing an image
        puts the built-in artwork back — nothing ever ends up blank.
      </p>
    </div>
  );
}
