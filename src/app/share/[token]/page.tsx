import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { Footer } from "@/components/layout/footer";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { config } from "@/lib/config";
import type { ProjectDetail } from "@/lib/types";

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
  const applied = project.regions.filter((r) => r.appliedHexCode);

  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 1040, margin: "0 auto", padding: "64px var(--gutter) 120px" }}>
        <header style={{ marginBottom: 32 }}>
          <Eyebrow>Shared colour preview</Eyebrow>
          <h1 className="display" style={{ fontSize: "clamp(36px, 5vw, 64px)", marginTop: 12 }}>{project.name}</h1>
          <Lead style={{ marginTop: 16 }}>A colour preview shared with you. Pick the look you love — your retailer has the exact shades.</Lead>
        </header>

        <div className="r-cols-md-1" style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 32, alignItems: "start" }}>
          <div style={{ border: "1px solid var(--rule-strong)", background: "var(--surface)", aspectRatio: "4 / 3", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img} alt={project.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            ) : (
              <Mono>Preview unavailable</Mono>
            )}
          </div>

          <aside>
            <Mono brass style={{ display: "block", marginBottom: 14 }}>The palette</Mono>
            {applied.length === 0 ? (
              <p style={{ font: "400 16px/1.5 var(--serif)", color: "var(--fg-mute)" }}>No colours applied yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {applied.map((r) => (
                  <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span aria-hidden style={{ width: 40, height: 40, background: r.appliedHexCode ?? "#ccc", border: "1px solid var(--rule-strong)", flexShrink: 0 }} />
                    <span style={{ font: "400 17px/1.2 var(--serif)", color: "var(--fg)" }}>{r.label || "Wall"}</span>
                  </div>
                ))}
              </div>
            )}
            <p style={{ marginTop: 24, font: "400 14px/1.5 var(--serif)", color: "var(--fg-mute)" }}>
              Shade codes are kept with your retailer. Visit them to order the exact colours.
            </p>
          </aside>
        </div>

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
