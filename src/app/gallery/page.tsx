import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Marquee } from "@/components/layout/marquee";
import { SiteHeader } from "@/components/layout/site-header";
import { Footer } from "@/components/layout/footer";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { Placeholder } from "@/components/ui/placeholder";
import { RevealMount } from "@/components/ui/reveal-mount";
import { GalleryGrid, type Plate, type PlateCategory } from "@/components/gallery/gallery-grid";
import { fetchPublishedProjects, type PublishedProject } from "@/lib/free-projects-server";
import { fetchSiteAssets } from "@/lib/site-assets-server";
import { WORKS } from "@/lib/work";

export const metadata: Metadata = {
  title: "Gallery",
  description: "A library of finished rooms — twelve plates recoloured with real catalogue shades. Only the wall changes.",
};

// Gallery-local presentation only: editorial title styling, grid category, month.
// Codes, swatches, locations and years come from the WORKS source of truth.
const PLATE_META: Record<string, { category: PlateCategory; month: string; title: ReactNode }> = {
  "spice-market": { category: "Living rooms", month: "Apr", title: <>The Spice <i>Market</i></> },
  "linen-bedroom": { category: "Bedrooms", month: "Mar", title: <>Linen <i>Bedroom</i></> },
  "bluestone-hall": { category: "Kitchens", month: "Feb", title: <>Bluestone <i>Hall</i></> },
  "pondicherry-sage": { category: "Bedrooms", month: "Feb", title: <>Pondicherry <i>Sage</i></> },
  "brass-veranda": { category: "Verandas", month: "Jan", title: <>Brass <i>Veranda</i></> },
  "oxblood-library": { category: "Living rooms", month: "Jan", title: <>Oxblood <i>Library</i></> },
  "midnight-indigo": { category: "Façades", month: "Dec", title: <>Midnight <i>Indigo</i></> },
  "ivory-drawing-room": { category: "Living rooms", month: "Dec", title: <>Ivory <i>Drawing Room</i></> },
  "walnut-study": { category: "Bedrooms", month: "Nov", title: <>Walnut <i>Study</i></> },
  "adobe-table": { category: "Kitchens", month: "Oct", title: <>Adobe <i>Table</i></> },
  "eucalypt-nursery": { category: "Bedrooms", month: "Sep", title: <>Eucalypt <i>Nursery</i></> },
  "minuit-bar": { category: "Commercial", month: "Aug", title: <>Minuit <i>Bar</i></> },
};

const PLATES: ReadonlyArray<Plate> = WORKS.map((w, i) => {
  const meta = PLATE_META[w.slug];
  return {
    slug: w.slug,
    num: String(i + 1).padStart(2, "0"),
    category: meta?.category ?? "Living rooms",
    title: meta?.title ?? w.title,
    code: `${w.code} · ${w.shadeName}`,
    swatch: w.swatch,
    location: w.location,
    date: meta ? `${meta.month} ${w.year}` : w.year,
    tag: w.category,
    tone: w.tone,
    aspect: w.aspect,
    href: `/work/${w.slug}`,
  };
});

/** "Jan 2026" from the publish timestamp; the year alone if it can't be read. */
function monthYear(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric" }).format(d);
}

/**
 * A published room as a gallery plate.
 *
 * Everything on the card is read off the room itself — its photograph, the shades
 * actually on its walls, what kind of room it is. Nothing here is written by hand,
 * which is the point: the shelf is edited in the admin console, not in this file.
 */
function plateOf(p: PublishedProject, i: number): Plate {
  const lead = p.colours[0];
  const code = [lead?.shadeCode, p.colours.length > 1 ? `+${p.colours.length - 1} more` : null]
    .filter(Boolean)
    .join(" · ");
  return {
    slug: p.slug,
    num: String(i + 1).padStart(2, "0"),
    category: p.roomLabel || (p.space === "EXTERIOR" ? "Exteriors" : "Interiors"),
    title: p.title,
    code: code || `${p.wallCount} ${p.wallCount === 1 ? "surface" : "surfaces"}`,
    swatch: lead?.hex ?? "var(--rule-strong)",
    location: p.roomLabel,
    date: monthYear(p.publishedAt),
    tag: p.space === "EXTERIOR" ? "Exterior" : "Interior",
    // Only reached if the photograph fails to load; the plate needs a tone anyway.
    tone: "slate",
    aspect: p.imageWidth && p.imageHeight ? `${p.imageWidth} / ${p.imageHeight}` : "4 / 3",
    imageUrl: p.imageUrl,
    alt: p.description || `${p.title} — ${p.roomLabel} recoloured in HueVista`,
    // A real room with real masks behind it, so it can be opened and painted.
    // Costs the visitor nothing: the copy reuses the library's stored photo and
    // walls, so there is no upload, no wall detection and no credit to spend.
    startable: true,
  };
}

export default async function GalleryPage() {
  // The shelf an admin publishes from /admin/free-projects. These are real
  // photographs of real rooms with real shade codes on them, so when there are any
  // they ARE the gallery and the placeholder plates below never render.
  const [published, assets] = await Promise.all([fetchPublishedProjects(), fetchSiteAssets()]);

  // Nothing published yet: fall back to the built-in demonstration plates.
  const live = published.length > 0;
  const plates = live ? published.map(plateOf) : PLATES;
  const count = plates.length;

  return (
    <>
      <Marquee items={["The Gallery", "Recoloured rooms · real catalogue shades · only the wall changes", live ? "Published from the studio" : "Curated quarterly"]} />
      <SiteHeader />
      <main id="main">
        <RevealMount />
        <header className="page-head">
          <div className="eyebrow-row">
            <Eyebrow>Gallery</Eyebrow>
            <Mono>{count} {count === 1 ? "room" : "rooms"} · {live ? "published from the studio" : "curated quarterly"}</Mono>
          </div>
          <h1 className="display">A library of <i>finished rooms.</i></h1>
          <Lead className="page-lead">
            {live
              ? "Rooms recoloured in the studio from a single photograph, each one with shades from the live catalogue on its walls. Open any of them and repaint it yourself — no photograph needed, and nothing to pay."
              : "Twelve rooms from ten cities across India, each recoloured from a single photograph with shades from the live catalogue. Only the wall changes."}
          </Lead>
          <GalleryGrid plates={plates} />
        </header>

        <section style={{ background: "var(--band)", borderTop: "1px solid var(--band-rule)", borderBottom: "1px solid var(--band-rule)", padding: "120px 0", marginTop: 80 }} className="full-bleed">
          <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 var(--gutter)" }}>
            <div className="reveal r-stack-md" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }}>
              <Placeholder
                tone="oxblood"
                grain
                corners
                tag="AT THE COUNTER"
                label="A paint counter, India"
                src={assets["gallery.counter"]?.url}
                alt="A customer at a paint counter being shown their own room in a new colour"
                style={{ aspectRatio: "5 / 4" }}
              />
              <div>
                <Eyebrow>At the counter</Eyebrow>
                <h3 style={{ marginTop: 24, fontFamily: "var(--serif)", fontWeight: 600, fontSize: "clamp(40px, 5vw, 72px)", lineHeight: 1, letterSpacing: "-.015em", color: "var(--ivory)" }}>
                  From <i>let me think</i> <br />to <i>same afternoon.</i>
                </h3>
                <p style={{ font: "300 17px/1.55 var(--sans)", color: "var(--ivory-soft)", marginTop: 24 }}>
                  When the customer can see their own wall change colour, <i>let me think</i> becomes an order. That is the whole product.
                </p>
                <div className="r-cols-xs-1" style={{ marginTop: 48, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24 }}>
                  {[
                    ["20 s", "photo to first preview"],
                    ["10,000+", "shades, real codes intact"],
                    ["1 tap", "preview to WhatsApp"],
                  ].map(([num, lbl]) => (
                    <div key={lbl} style={{ borderTop: "1px solid var(--band-rule)", paddingTop: 18 }}>
                      <div style={{ fontFamily: "var(--serif)", fontSize: 48, color: "var(--brass-soft)", lineHeight: 1 }}>{num}</div>
                      <div style={{ font: "400 15px/1.4 var(--serif)", color: "var(--ivory-soft)", marginTop: 8 }}>{lbl}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 48 }}>
                  <Link href="/method" className="text-link">See how it works &nbsp;→</Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section style={{ textAlign: "center", padding: "160px 0" }}>
          <div className="reveal" style={{ maxWidth: 880, margin: "0 auto" }}>
            <Mono brass>Painted with HueVista?</Mono>
            <h2 className="display" style={{ fontSize: "clamp(48px, 8vw, 108px)", marginTop: 24, lineHeight: 0.92 }}>
              Submit a room <br /><i>to the gallery.</i>
            </h2>
            <Lead style={{ margin: "32px auto 0" }}>
              Retailers and customers alike. Paint a room with HueVista, keep the before and after, and we&apos;ll ask for it — we curate quarterly.
            </Lead>
            <div style={{ marginTop: 48, display: "inline-flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
              <Link href="/trial" className="btn btn-brass">Paint a room first — try it free <span className="arr">→</span></Link>
              <Link href="/work" className="btn btn-ghost">Browse our work <span className="arr">→</span></Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
