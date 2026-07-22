import type { Metadata } from "next";
import { Marquee } from "@/components/layout/marquee";
import { SiteHeader } from "@/components/layout/site-header";
import { Footer } from "@/components/layout/footer";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { RevealMount } from "@/components/ui/reveal-mount";
import { getCatalogueOrSample } from "@/lib/catalogue";
import { CatalogueToolbar } from "@/components/catalogue/catalogue-toolbar";

export const metadata: Metadata = {
  title: "Catalogue",
  description: "Thousands of paint shades with real codes across every company we carry. Search by name or code; filter by colour family and finish.",
};

export default async function CataloguePage() {
  // Live catalogue from the backend; falls back to the bundled sample if it's unreachable.
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
            <Eyebrow>Colour library</Eyebrow>
            <Mono>{shades.length.toLocaleString("en-IN")} shades · {brandLine} · more to follow</Mono>
          </div>
          <h1 className="display">Every shade.<br /><i>Codes intact.</i></h1>
          <Lead className="page-lead">{brands.join(", ")} — with more companies to follow. Filter by colour family, finish, or depth. Search by shade code or name.</Lead>
        </header>

        <section style={{ paddingTop: 80 }}>
          <CatalogueToolbar shades={shades} />
        </section>
      </main>
      <Footer />
    </>
  );
}
