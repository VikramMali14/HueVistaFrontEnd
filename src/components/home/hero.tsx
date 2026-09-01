import { LinkButton } from "@/components/ui/button";
import { Eyebrow, Mono } from "@/components/ui/eyebrow";
import type { SiteAssetMap } from "@/lib/site-assets";
import { CompareSlider } from "./compare-slider";

/**
 * @param assets Filled image slots, from the admin console. Empty is the normal
 *   state of a fresh install and of a backend that could not be reached — the
 *   slider falls back to its colour washes, so the hero is never broken by a
 *   missing picture.
 */
export function Hero({ assets = {} }: { assets?: SiteAssetMap }) {
  const before = assets["home.compare.before"]?.url;
  const after = assets["home.compare.after"]?.url;
  return (
    <section className="hv-hero2 full-bleed" aria-labelledby="hero-title">
      {/* Cinematic background. The gradient + grain reads as a warm-lit room and
          needs no asset. To use a real photo or video instead, drop the file in
          /public and uncomment ONE of the blocks below — it layers under the scrim.
          <video className="hv-hero2-media" autoPlay muted loop playsInline poster="/hero.jpg">
            <source src="/hero.mp4" type="video/mp4" />
          </video>
          <img className="hv-hero2-media" src="/hero.jpg" alt="" aria-hidden /> */}
      <div className="hv-hero2-bg" aria-hidden />

      <div className="hv-hero2-inner">
        {/* The shared .eyebrow, not eight inline style properties hand-rolling it.
            This was a copy of that component's rules — a mono cap line with a rule
            in front of it — kept in sync by hand, and it had already drifted from
            the original on letter-spacing and on the length of the rule. */}
        <Eyebrow className="hv-hero2-eyebrow hv-rise">Paint visualiser · Indian counters</Eyebrow>
        <h1 id="hero-title" className="display hv-hero2-title hv-rise">
          {/* The space is explicit: JSX drops the newline between a text node and the
              next element, so without it the heading's real text content — what a
              screen reader reads, what a search engine indexes, what a copy-paste
              produces — was "See any paint colouron your walls." */}
          See any paint colour{" "}
          {/* Weight, not lightness — a pale second half reads as disabled text
              rather than as emphasis, and it has to invert with the theme. The
              page uses this device exactly twice, here and on the closing line,
              so the two of them read as a frame round the page rather than as
              the one shape every heading on it happens to have. */}
          <i>on your walls.</i>
        </h1>
        <p className="hv-hero2-sub reveal">Upload a photo of a room and see any paint colour on the walls in seconds. Made for paint shops and their customers.</p>
        <div className="hv-hero2-cta reveal d1">
          <LinkButton href="/trial" size="lg">Get started <span className="arr">→</span></LinkButton>
          <LinkButton href="/method" size="lg" variant="ghost">How it works</LinkButton>
        </div>
      </div>

      <figure className="hv-hero2-demo reveal d2">
        {/* Each pane takes an uploaded photograph when one is in its slot and
            keeps its built-in wash otherwise, so the two halves can be replaced
            one at a time without the hero looking half-finished in between. */}
        <CompareSlider
          beforeBg={before ? `url("${before}") center / cover no-repeat` : undefined}
          afterBg={after ? `url("${after}") center / cover no-repeat` : undefined}
        />
        <figcaption>
          <Mono>Drag to compare — same room, same light, only the wall colour changed</Mono>
        </figcaption>
      </figure>
    </section>
  );
}
