import { fetchCatalogueSize } from "@/lib/catalogue";
import { fetchSiteAssets } from "@/lib/site-assets-server";
import { SiteHeader } from "@/components/layout/site-header";
import { Footer } from "@/components/layout/footer";
import { Hero } from "@/components/home/hero";
import { Stats } from "@/components/home/stats";
import { Problem } from "@/components/home/problem";
import { PaintRoom } from "@/components/home/paint-room";
import { MethodGrid } from "@/components/home/method-grid";
import { Toolkit } from "@/components/home/toolkit";
import { CataloguePreview } from "@/components/home/catalogue-preview";
import { Partners } from "@/components/home/partners";
import { PricingPreview } from "@/components/home/pricing-preview";
import { Closing } from "@/components/home/closing";
import { RevealMount } from "@/components/ui/reveal-mount";

/**
 * The order is an argument, not an inventory.
 *
 * It used to be twelve bands in the sequence they were built in, each one an
 * eyebrow over a two-line heading over a grid of cards, every one of them
 * separated from the next by the same hairline and the same 100px. A page that
 * shaped has no emphasis anywhere in it: a visitor cannot tell the demo from
 * the footnote, because it is all set at one volume.
 *
 * So it now runs as one line of reasoning — the problem, the proof, the how,
 * the detail, the price, the door:
 *
 *   Hero + Stats     a claim, and the three numbers behind it
 *   Problem          why a shade card loses the sale
 *   PaintRoom        the answer, working, in the visitor's own hands
 *   Method           how it does that, in six steps
 *   Toolkit          what else is in the box
 *   Catalogue        whose shades, with which codes
 *   Pricing          what it costs
 *   Closing          the door
 *
 * Two sections came out. `Services` was four cards pointing at Pricing,
 * Catalogue, Gallery and Trial — three of which are sections of this same page
 * and the fourth is the button in the hero, so it was a table of contents in the
 * middle of the book. `Moods` was a WebGL carousel of swatches sitting directly
 * above the catalogue's wall of swatches: the same content, twice, the second
 * time for 100KB of graphics library.
 */
export default async function HomePage() {
  // The hero stat row states how many shades we hold. Read it from the catalogue
  // rather than hard-coding it — the hard-coded "10,000+" was more than twice the
  // truth. Cached for an hour; null when the backend is unreachable.
  const size = await fetchCatalogueSize();
  // Images an admin has put in the site's slots. Empty map = nothing uploaded
  // (or the backend is unreachable), and every consumer draws its built-in
  // artwork for a slot it has no image for.
  const assets = await fetchSiteAssets();
  return (
    <>
      <SiteHeader />
      <main id="main">
        <RevealMount />
        <Hero assets={assets} />
        <Stats shades={size?.shades ?? null} />
        <Problem />
        <PaintRoom />
        <MethodGrid />
        <Toolkit />
        <CataloguePreview />
        <Partners />
        <PricingPreview />
        <Closing />
      </main>
      <Footer />
    </>
  );
}
