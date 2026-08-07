import Link from "next/link";
import { TiltCard } from "@/components/ui/tilt-card";
import { SHOWCASE_CONTENT } from "@/lib/showcase";
import { FREE_PLAN_PROJECTS } from "@/lib/free-plan";

/**
 * `shades` is the live catalogue count, passed down from the page. The card used to
 * claim "10,000+ shades"; the catalogue holds 4,522. When the count is unavailable
 * the card describes the search without naming a figure.
 */
const services = (shades: number | null) => [
  {
    kicker: "Pricing",
    title: "Priced for paint shops",
    desc: `Start free: ${FREE_PLAN_PROJECTS} projects every month, no card needed, and the account opens within a day.`,
    tone: "terracotta",
    href: "/pricing",
  },
  {
    kicker: "Catalogue",
    // "Match a colour, exactly" promised an exactness no screen can deliver — the
    // one claim this product must never make. It finds the closest shades; the
    // shade card at the counter decides.
    title: "Find the closest shade",
    desc: shades
      ? `Search ${shades.toLocaleString("en-IN")} shades by code or name, and see what comes closest across the companies you carry.`
      : "Search the catalogue by code or name, and see what comes closest across the companies you carry.",
    tone: "slate",
    href: "/catalogue",
  },
  {
    kicker: "Visualiser",
    title: "See it on the wall",
    desc: "Put any shade on the room in seconds. The light and shadows stay as they were — only the colour changes.",
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
    <section id="services" className="hv-services" aria-labelledby="services-title">
      <header className="hv-services-head reveal">
        <h2 id="services-title" className="display hv-services-title">
          Everything you need,{" "}<br /><i>in one place.</i>
        </h2>
        <p className="hv-services-lead">
          From the first photo to the shade code on the bill — every step of selling colour,
          in one place.
        </p>
      </header>
      <div className={`hv-services-grid${SERVICES.length === 3 ? " is-three" : ""}`}>
        {SERVICES.map((s, i) => (
          <div key={s.href} className={`reveal d${i + 1}`} style={{ height: "100%" }}>
            <TiltCard style={{ height: "100%" }}>
              <Link href={s.href} className="hv-svc-card ph ph-grain" data-tone={s.tone}>
                <span className="hv-svc-eyebrow">{s.kicker}</span>
                <h3 className="hv-svc-title">{s.title}</h3>
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
