import type { Metadata } from "next";
import { Marquee } from "@/components/layout/marquee";
import { SiteHeader } from "@/components/layout/site-header";
import { Footer } from "@/components/layout/footer";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { RevealMount } from "@/components/ui/reveal-mount";
import { getCatalogueOrSample } from "@/lib/catalogue";
import { requireFeature } from "@/lib/auth";
import { CatalogueToolbar } from "@/components/catalogue/catalogue-toolbar";
import { ShadeAccuracyNote } from "@/components/shared/accuracy-note";

export const metadata: Metadata = {
  title: "Catalogue",
  description: "Paint shades with their real codes, from every company we carry. Search by name or code, filter by colour family and finish.",
};

export default async function CataloguePage() {
  // This page is PUBLIC and stays that way: with no session there is no access to
  // load, so requireFeature admits every anonymous visitor. It only bites for a
  // signed-in shop whose distributor switched the catalogue off.
  await requireFeature("CATALOGUE");
  // Live catalogue from the backend; falls back to the bundled sample if it's
  // unreachable. For a signed-in shop this is already narrowed to the paint
  // companies its distributor assigned, so the counts below describe THEIR
  // catalogue, not the whole platform's.
  const shades = await getCatalogueOrSample();
  const brands = Array.from(new Set(shades.map((s) => s.brand))).sort((a, b) => a.localeCompare(b));
  const brandLine = brands.length === 1 ? brands[0]! : `${brands.length} companies`;
  return (
    <>
      <Marquee items={["The Catalogue", "Every code intact · finishes preserved", `${brandLine} · more to follow`]} />
      <SiteHeader />
      <main>
        <RevealMount />
        <header className="page-head">
          <div className="eyebrow-row">
            <Eyebrow>Catalogue</Eyebrow>
            <Mono>{shades.length.toLocaleString("en-IN")} shades · {brandLine} · more to follow</Mono>
          </div>
          <h1 className="display">Every shade.<br /><i>Codes intact.</i></h1>
          <Lead className="page-lead">{brands.join(", ")}, with more companies to follow. Search by shade code or name, or filter by colour family and finish.</Lead>
          {/* Said here, at the top, and not only in the terms. Someone is about to
              choose paint from colours on a screen; they need to know before they
              scroll, not after they buy. */}
          <ShadeAccuracyNote style={{ marginTop: 24 }} />
        </header>

        <section style={{ paddingTop: 80 }}>
          <CatalogueToolbar shades={shades} />
        </section>
      </main>
      <Footer />
    </>
  );
}
