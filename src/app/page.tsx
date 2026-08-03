import { fetchCatalogueSize } from "@/lib/catalogue";
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
  return (
    <>
      <SiteHeader />
      <main>
        <RevealMount />
        <Hero />
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
