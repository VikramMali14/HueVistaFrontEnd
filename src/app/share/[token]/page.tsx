import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { Footer } from "@/components/layout/footer";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { config } from "@/lib/config";
import type { ProjectDetail, ShadeBrandSummary } from "@/lib/types";
import { ShareRepaint, type RepaintBrand, type RepaintRegion } from "./share-repaint";

// Public, read-only view of a shared project — colours are shown, shade codes hidden
// (the backend's /api/share endpoint serves the code-hidden projection).
// cache() dedupes the call between generateMetadata and the page render.
const fetchShared = cache(async (token: string): Promise<ProjectDetail | null> => {
  try {
    const res = await fetch(`${config.internalApiOrigin}/api/share/${encodeURIComponent(token)}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as ProjectDetail;
  } catch {
    return null;
  }
});

function absUrl(u?: string | null): string | null {
  if (!u) return null;
  if (u.startsWith("http")) return u;
  return `${config.apiOrigin}${u.startsWith("/") ? "" : "/"}${u}`;
}

/**
 * The paint companies this share's viewer may repaint with: the live catalogue
 * brands, cut down to the retailer's chosen list when they restricted the share
 * (empty/absent = every brand). Empty on any failure — the page then renders the
 * static preview without the picker.
 */
async function fetchShareBrands(project: ProjectDetail): Promise<RepaintBrand[]> {
  try {
    const res = await fetch(`${config.internalApiOrigin}/api/shades/brands`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const all = (await res.json()) as ShadeBrandSummary[];
    const allowed = (project.sharedBrands ?? []).map((b) => b.trim().toLowerCase()).filter(Boolean);
    const list = allowed.length === 0
      ? all
      : all.filter((b) => allowed.includes(b.name.trim().toLowerCase()));
    return list.map((b) => ({ name: b.name, slug: b.slug }));
  } catch {
    return [];
  }
}

// The share link travels by WhatsApp — give the recipient the painted room in the
// link preview, not a bare text card.
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const project = await fetchShared(token);
  if (!project) {
    return { title: "Shared colour preview", description: "A colour preview shared from HueVista." };
  }
  const img = absUrl(project.cleanedImageUrl) ?? absUrl(project.imageUrl);
  return {
    title: `${project.name} · HueVista colour preview`,
    description: "A colour preview shared from HueVista. Your retailer has the exact shades.",
    openGraph: { images: img ? [{ url: img }] : [] },
    twitter: { card: "summary_large_image" },
  };
}

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const project = await fetchShared(token);

  if (!project) {
    return (
      <>
        <SiteHeader />
        <main style={{ maxWidth: 640, margin: "0 auto", padding: "120px 24px 160px", textAlign: "center" }}>
          <Eyebrow>Shared preview</Eyebrow>
          <h1 className="display" style={{ fontSize: "clamp(36px, 5vw, 56px)", marginTop: 16 }}>
            This link has <i>expired.</i>
          </h1>
          <Lead style={{ marginTop: 20 }}>The share link is invalid or no longer active. Ask whoever shared it for a fresh one.</Lead>
          <Link className="btn btn-brass" href="/" style={{ marginTop: 28 }}>Explore HueVista <span className="arr">→</span></Link>
        </main>
        <Footer />
      </>
    );
  }

  const img = absUrl(project.cleanedImageUrl) ?? absUrl(project.imageUrl);
  // Every masked region is repaintable — the viewer can recolour walls the
  // retailer left bare, too. Colours applied by the retailer are the start state.
  const repaintRegions: RepaintRegion[] = project.regions.map((r) => ({
    id: r.id,
    label: r.label,
    maskUrl: absUrl(r.maskUrl),
    initialHex: r.appliedHexCode ?? null,
  }));
  const brands = await fetchShareBrands(project);

  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 1040, margin: "0 auto", padding: "64px var(--gutter) 120px" }}>
        <header style={{ marginBottom: 32 }}>
          <Eyebrow>Shared colour preview</Eyebrow>
          <h1 className="display" style={{ fontSize: "clamp(36px, 5vw, 64px)", marginTop: 12 }}>{project.name}</h1>
          <Lead style={{ marginTop: 16 }}>
            A colour preview shared with you. Repaint it with your own picks — your retailer has the exact shades.
          </Lead>
        </header>

        {img ? (
          <ShareRepaint
            imageUrl={img}
            alt={project.name}
            regions={repaintRegions}
            anchored={Boolean(project.cleanedImageUrl)}
            brands={brands}
            apiOrigin={config.apiOrigin}
          />
        ) : (
          <Mono>Preview unavailable</Mono>
        )}

        <div
          className="r-cols-md-1"
          style={{ marginTop: 64, paddingTop: 40, borderTop: "1px solid var(--rule)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}
        >
          <div>
            <Mono brass style={{ display: "block", marginBottom: 12 }}>For your room</Mono>
            <p style={{ font: "400 19px/1.45 var(--serif)", color: "var(--fg)", margin: "0 0 18px", maxWidth: "36ch" }}>
              Want to see colours on your own walls? Ask your paint shop for a HueVista code.
            </p>
            <Link className="btn btn-ghost" href="/redeem">I have a code <span className="arr">→</span></Link>
          </div>
          <div>
            <Mono brass style={{ display: "block", marginBottom: 12 }}>For your counter</Mono>
            <p style={{ font: "400 19px/1.45 var(--serif)", color: "var(--fg)", margin: "0 0 18px", maxWidth: "36ch" }}>
              Run a paint shop? Put previews like this on your counter — 14-day trial, no card, we set you up.
            </p>
            <Link className="btn btn-brass" href="/trial">Request a shop account <span className="arr">→</span></Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
