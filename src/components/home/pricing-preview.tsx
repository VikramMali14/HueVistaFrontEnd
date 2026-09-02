import { LinkButton } from "@/components/ui/button";
import { Mono } from "@/components/ui/eyebrow";

interface Tier { name: string; price: string; per: string; feature: string; featured?: boolean; }

// The four tiers a shop can be on — the same four the pricing page and
// /api/billing/plans serve. Free leads, because it is the one every shop starts on and
// the one it returns to; a ladder that starts at ₹999 leaves the first question a shop
// asks unanswered. Enterprise used to sit here as an "On request" card with nothing
// behind it; a price-less card on the home page is a question with no answer, so it is
// gone until there is a real tier to put a shop on.
const TIERS: ReadonlyArray<Tier> = [
  // "For paint shops" rather than "for good": the question a ₹0 card raises is who
  // is allowed on it, not how long it runs. Matches the free card on /pricing.
  { name: "Free", price: "₹0", per: "for paint shops", feature: "2 projects / mo · renews · no colour finder" },
  { name: "Starter", price: "₹999", per: "/ month", feature: "15 projects / mo · AI clean-up + walls" },
  { name: "Professional", price: "₹2,499", per: "/ month", feature: "45 projects / mo · extras at ₹55", featured: true },
  { name: "Business", price: "₹4,999", per: "/ month", feature: "100 projects / mo · extras at ₹45" },
];

export function PricingPreview() {
  return (
    <section aria-labelledby="pricing-title">
      <div className="reveal hv-pp-head">
        {/* Short and flat, against the long catalogue heading above it. */}
        <h2 id="pricing-title" className="display hv-pp-title">For the shop, not the shopper.</h2>
        <LinkButton href="/pricing" variant="ghost" size="lg">See all tiers</LinkButton>
      </div>
      <div className="hv-pp-grid r-cols-md-2 r-cols-xs-1">
        {TIERS.map((t, i) => (
          <div
            key={t.name}
            className={`hv-tier${t.featured ? " hv-tier--featured" : ""} reveal d${i + 1}`}
          >
            <Mono className="hv-tier-name">{t.name}</Mono>
            <div className="hv-tier-price">
              <span className="hv-tier-amount">{t.price}</span>
              <span className="hv-tier-per">{t.per}</span>
            </div>
            <div className="hv-tier-feature">{t.feature}</div>
          </div>
        ))}
      </div>
      <Mono className="hv-pp-note">Every shop has the free plan · no card · open within a day</Mono>
    </section>
  );
}
