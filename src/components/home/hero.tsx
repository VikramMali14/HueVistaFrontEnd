import { LinkButton } from "@/components/ui/button";
import { Mono } from "@/components/ui/eyebrow";
import { CompareSlider } from "./compare-slider";

export function Hero() {
  return (
    <section className="hv-hero2 full-bleed">
      {/* Cinematic background. The gradient + grain reads as a warm-lit room and
          needs no asset. To use a real photo or video instead, drop the file in
          /public and uncomment ONE of the blocks below — it layers under the scrim.
          <video className="hv-hero2-media" autoPlay muted loop playsInline poster="/hero.jpg">
            <source src="/hero.mp4" type="video/mp4" />
          </video>
          <img className="hv-hero2-media" src="/hero.jpg" alt="" aria-hidden /> */}
      <div className="hv-hero2-bg" aria-hidden />

      <div className="hv-hero2-inner">
        <h1 className="display hv-hero2-title reveal in">
          See any colour
          <span>on your walls.</span>
        </h1>
        <div className="hv-hero2-cta reveal d1">
          <LinkButton href="/trial" size="lg">Get started <span className="arr">→</span></LinkButton>
          <LinkButton href="/method" size="lg" variant="ghost">How it works <span className="arr">→</span></LinkButton>
        </div>
        <p className="hv-hero2-sub reveal d2">Start free. No card needed to begin.</p>
      </div>

      <figure className="hv-hero2-demo reveal d2">
        <CompareSlider />
        <figcaption>
          <Mono>Drag to compare — a real photo, only the wall colour has changed</Mono>
        </figcaption>
      </figure>
    </section>
  );
}
