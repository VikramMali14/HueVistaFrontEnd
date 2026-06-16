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
import ScrollStack, { ScrollStackItem } from "@/components/ui/scroll-stack";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <RevealMount />
        {/* Cinematic intro stays at the top, over the purple liquid backdrop. */}
        <Hero />
        {/* Every content section below becomes a frosted-glass card that pins and
            stacks as you scroll — the React Bits ScrollStack effect. */}
        <ScrollStack
          className="home-glass-stack"
          useWindowScroll
          itemDistance={120}
          itemStackDistance={40}
          baseScale={0.9}
          itemScale={0.02}
          blurAmount={0.6}
        >
          <ScrollStackItem><Stats /></ScrollStackItem>
          <ScrollStackItem><MethodGrid /></ScrollStackItem>
          <ScrollStackItem><Partners /></ScrollStackItem>
          <ScrollStackItem><Services /></ScrollStackItem>
          <ScrollStackItem><PaintRoom /></ScrollStackItem>
          <ScrollStackItem><Toolkit /></ScrollStackItem>
          <ScrollStackItem><Moods /></ScrollStackItem>
          <ScrollStackItem><CataloguePreview /></ScrollStackItem>
          <ScrollStackItem><Testimonial /></ScrollStackItem>
          <ScrollStackItem><PricingPreview /></ScrollStackItem>
          <ScrollStackItem><Closing /></ScrollStackItem>
        </ScrollStack>
      </main>
      <Footer />
    </>
  );
}
