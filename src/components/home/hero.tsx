import { LinkButton } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { FREE_PLAN_PROJECTS } from "@/lib/free-plan";
import type { SiteAssetMap } from "@/lib/site-assets";
import { CompareSlider } from "./compare-slider";

/**
 * The hero is the room, not a paragraph about the room.
 *
 * It used to be the stack every generated landing page opens with: a centred
 * eyebrow over a centred headline over a centred sentence over a centred pair
 * of buttons, and then — below the fold, inset, rounded, drop-shadowed — a
 * picture of the product. Four elements in a column down the middle of the
 * screen, which is a layout in the sense that a list is a layout: nothing is
 * beside anything, so nothing is more important than anything.
 *
 * It is a split now. The type sets left on its own column and the slider takes
 * the rest of the width at full height, running off the right edge of the
 * viewport rather than sitting politely inside the margin. That bleed is the
 * whole trick: an image that leaves the frame reads as a photograph the page
 * was built around, where the same image inset with a shadow reads as a
 * screenshot someone pasted in. And the one thing this product has to prove —
 * that a wall changes colour and the light does not — is now the largest thing
 * on the first screen instead of a 1040px rectangle underneath it.
 *
 * The three figures ride at the foot of the type column, on a rule. They were a
 * separate centred band directly below; folding them in means the first screen
 * carries the claim and the evidence for it together, and the page loses
 * another symmetrical 3-up row.
 *
 * @param assets Filled image slots, from the admin console. Empty is the normal
 *   state of a fresh install and of a backend that could not be reached — the
 *   slider falls back to its colour washes, so the hero is never broken by a
 *   missing picture.
 * @param shades Live catalogue count, or null when the backend is unreachable.
 *   The proof row then states the two figures it can still state truthfully
 *   rather than printing a number that would drift the moment another
 *   company's catalogue is loaded.
 */
export function Hero({ assets = {}, shades }: { assets?: SiteAssetMap; shades?: number | null }) {
  const before = assets["home.compare.before"]?.url;
  const after = assets["home.compare.after"]?.url;

  const PROOF = [
    { value: "20s", label: "Photo to preview" },
    ...(shades ? [{ value: shades.toLocaleString("en-IN"), label: "Shades, codes intact" }] : []),
    { value: `${FREE_PLAN_PROJECTS}/mo`, label: "Free, no card" },
  ];

  return (
    <section className="hv-hero full-bleed" aria-labelledby="hero-title">
      {/* Cinematic background. The gradient + grain reads as a warm-lit room and
          needs no asset. To use a real photo or video instead, drop the file in
          /public and uncomment ONE of the blocks below — it layers under the scrim.
          <video className="hv-hero-media" autoPlay muted loop playsInline poster="/hero.jpg">
            <source src="/hero.mp4" type="video/mp4" />
          </video>
          <img className="hv-hero-media" src="/hero.jpg" alt="" aria-hidden /> */}
      <div className="hv-hero-bg" aria-hidden />

      <div className="hv-hero-grid">
        <div className="hv-hero-copy">
          <Eyebrow className="hv-hero-eyebrow hv-rise">Paint visualiser · Indian counters</Eyebrow>
          <h1 id="hero-title" className="display hv-hero-title hv-rise">
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
          <p className="hv-hero-sub reveal">
            Upload a photo of a room and see any paint colour on the walls in seconds.
            Made for paint shops and their customers.
          </p>
          <div className="hv-hero-cta reveal d1">
            <LinkButton href="/trial" size="lg">Get started <span className="arr">→</span></LinkButton>
            <LinkButton href="/method" size="lg" variant="ghost">How it works</LinkButton>
          </div>

          <dl className="hv-hero-proof reveal d2">
            {PROOF.map((p) => (
              <div key={p.label}>
                <dt className="hv-hero-proof-n">{p.value}</dt>
                <dd className="hv-hero-proof-l">{p.label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <figure className="hv-hero-demo">
          {/* Each pane takes an uploaded photograph when one is in its slot and
              keeps its built-in wash otherwise, so the two halves can be replaced
              one at a time without the hero looking half-finished in between. */}
          <CompareSlider
            className="compare hv-hero-compare"
            beforeBg={before ? `url("${before}") center / cover no-repeat` : undefined}
            afterBg={after ? `url("${after}") center / cover no-repeat` : undefined}
          />
          <figcaption>Drag to compare — same room, same light, only the wall colour changed</figcaption>
        </figure>
      </div>
    </section>
  );
}
