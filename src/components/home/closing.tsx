import { LinkButton } from "@/components/ui/button";
import { Mono } from "@/components/ui/eyebrow";

/**
 * The one place the two-tone heading survives.
 *
 * Setting a statement against a lighter second clause is a good device. It was
 * on eight consecutive headings, which is what turned it from a voice into a
 * tic — every section of the page arriving in the same shape, so none of them
 * arrived as anything. Used once, at the largest size on the page, on the line
 * that is actually asking for the sale, it does the job it was always meant to.
 */
export function Closing() {
  return (
    <section className="hv-closing band-air" aria-label="Get started">
      <div className="reveal hv-closing-inner">
        <Mono brass>Begin</Mono>
        <h2 className="display hv-closing-title">
          Sell the colour <i>before the can opens.</i>
        </h2>
        <div className="hv-closing-cta">
          <LinkButton href="/trial" variant="brass" size="lg">Bring it to your counter <span className="arr">→</span></LinkButton>
          <LinkButton href="/method" variant="ghost" size="lg">See how it works</LinkButton>
        </div>
        <Mono>Free plan · 2 projects a month · no card · open within a day</Mono>
      </div>
    </section>
  );
}
