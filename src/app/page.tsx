import { SiteHeader } from "@/components/layout/site-header";
import { Footer } from "@/components/layout/footer";
import { Hero } from "@/components/home/hero";
import { Stats } from "@/components/home/stats";
import { Partners } from "@/components/home/partners";
import { Services } from "@/components/home/services";
import { MethodGrid } from "@/components/home/method-grid";
import { Engine } from "@/components/home/engine";
import { Capabilities } from "@/components/home/capabilities";
import { CataloguePreview } from "@/components/home/catalogue-preview";
import { PaintedWith } from "@/components/home/painted-with";
import { Testimonial } from "@/components/home/testimonial";
import { PricingPreview } from "@/components/home/pricing-preview";
import { Closing } from "@/components/home/closing";
import { RevealMount } from "@/components/ui/reveal-mount";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <RevealMount />
        <Hero />
        <Stats />
        <MethodGrid />
        <Partners />
        <Services />
        <Engine />
        <Capabilities />
        <CataloguePreview />
        <PaintedWith />
        <Testimonial />
        <PricingPreview />
        <Closing />
      </main>
      <Footer />
    </>
  );
}
