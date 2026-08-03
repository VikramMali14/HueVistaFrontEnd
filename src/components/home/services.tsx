import Link from "next/link";
import { TiltCard } from "@/components/ui/tilt-card";
import { SHOWCASE_CONTENT } from "@/lib/showcase";
import { TRIAL_DAYS } from "@/lib/trial";

/**
 * `shades` is the live catalogue count, passed down from the page. The card used to
 * claim "10,000+ shades"; the catalogue holds 4,522. When the count is unavailable
 * the card describes the search without naming a figure.
 */
const services = (shades: number | null) => [
  {
    kicker: "Pricing",
    title: "One plan, priced for shops",
    desc: `${TRIAL_DAYS}-day trial — no card, we set you up. Everything included, built for the counter.`,
    tone: "terracotta",
    href: "/pricing",
  },
  {
    kicker: "Catalogue match",
    title: "Match a colour, exactly",
    desc: shades
      ? `Search ${shades.toLocaleString("en-IN")} shades by code, name or hex — with harmonies and look-alikes across brands.`
      : "Search the catalogue by code, name or hex — with harmonies and look-alikes across brands.",
    tone: "slate",
    href: "/catalogue",
  },
  {
    kicker: "Live visualiser",
    title: "See it on the wall",
    desc: "Paint any shade onto the room in seconds — every shadow and texture left where it was.",
    tone: "sage",
    href: "/trial",
  },
  // Only while the gallery is published — otherwise this card leads to a 404.
  ...(SHOWCASE_CONTENT
    ? [
        {
          kicker: "Gallery",
          title: "Rooms — only the wall changed",
          desc: "Twelve rooms recoloured with catalogue shades — only the wall changes, the code on every one.",
          tone: "walnut",
          href: "/gallery",
        },
      ]
    : []),
];

export function Services({ shades }: { shades?: number | null }) {
  const SERVICES = services(shades ?? null);
  return (
    <section id="services" className="hv-services">
      <header className="hv-services-head reveal">
        <h2 className="display hv-services-title">
          Everything you need,<br /><i>in one place.</i>
        </h2>
        <p className="hv-services-lead">
          From the first photograph to the shade code on the invoice — every step of selling
          colour lives inside HueVista.
        </p>
      </header>
      <div className={`hv-services-grid${SERVICES.length === 3 ? " is-three" : ""}`}>
        {SERVICES.map((s, i) => (
          <div key={s.href} className={`reveal d${i + 1}`} style={{ height: "100%" }}>
            <TiltCard style={{ height: "100%" }}>
              <Link href={s.href} className="hv-svc-card ph ph-grain" data-tone={s.tone}>
                <span className="hv-svc-eyebrow">{s.kicker}</span>
                <span className="hv-svc-title">{s.title}</span>
                <span className="hv-svc-desc">{s.desc}</span>
                <span className="hv-svc-arrow" aria-hidden>→</span>
              </Link>
            </TiltCard>
          </div>
        ))}
      </div>
    </section>
  );
}
