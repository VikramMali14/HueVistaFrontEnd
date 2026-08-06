import { fetchCatalogueSize } from "@/lib/catalogue";
import { fetchSiteAssets } from "@/lib/site-assets-server";
import { SiteHeader } from "@/components/layout/site-header";
import { Footer } from "@/components/layout/footer";
import { Hero } from "@/components/home/hero";
import { Stats } from "@/components/home/stats";
import { Partners } from "@/components/home/partners";
import { Services } from "@/components/home/services";
import { MethodGrid } from "@/components/home/method-grid";
import { PaintRoom } from "@/components/home/paint-room";
import { Toolkit } from "@/components/home/toolkit";
import { Moods } from "@/components/home/moods";
import { CataloguePreview } from "@/components/home/catalogue-preview";
import { Testimonial } from "@/components/home/testimonial";
import { PricingPreview } from "@/components/home/pricing-preview";
import { Closing } from "@/components/home/closing";
import { RevealMount } from "@/components/ui/reveal-mount";

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
        <MethodGrid />
        <Partners />
        <Services shades={size?.shades ?? null} />
        <PaintRoom />
        <Toolkit />
        <Moods />
        <CataloguePreview />
        <Testimonial />
        <PricingPreview />
        <Closing />
      </main>
      <Footer />
    </>
  );
}
