import { Marquee } from "@/components/layout/marquee";
import { SiteHeader } from "@/components/layout/site-header";
import { Footer } from "@/components/layout/footer";
import { Hero } from "@/components/home/hero";
import { Partners } from "@/components/home/partners";
import { MethodGrid } from "@/components/home/method-grid";
import { Engine } from "@/components/home/engine";
import { Capabilities } from "@/components/home/capabilities";
import { CataloguePreview } from "@/components/home/catalogue-preview";
import { PaintedWith } from "@/components/home/painted-with";
import { Testimonial } from "@/components/home/testimonial";
import { PricingPreview } from "@/components/home/pricing-preview";
import { Closing } from "@/components/home/closing";
import { RevealMount } from "@/components/ui/reveal-mount";

const MARQUEE = [
  "Established Belgavi · MMXXVI",
  "For the Indian paint retail trade",
  "Asian Paints at launch · Berger & Nerolac to follow",
  "Pilot dealers · 12 cities",
  "See the wall before the paint",
  "Two thousand catalogued shades · codes intact",
  "Instant preview · no waiting at the counter",
  "True-to-the-can colour",
  "Fourteen days · no card · cancel quietly",
  "Engineered in Belgavi · with care",
];

export default function HomePage() {
  return (
    <>
      <Marquee items={MARQUEE} />
      <SiteHeader />
      <main>
        <RevealMount />
        <Hero />
        <Partners />
        <MethodGrid />
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
