import Link from "next/link";

const SERVICES = [
  {
    kicker: "Colour finder",
    title: "Find the code in any photo",
    desc: "Click a colour in a photograph and get the nearest catalogue shade — its code intact.",
    tone: "terracotta",
    href: "/color-finder",
  },
  {
    kicker: "Catalogue match",
    title: "Match a colour, exactly",
    desc: "Search 2,481 shades by code, name or hex — with harmonies and look-alikes across brands.",
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
  {
    kicker: "Photo to invoice",
    title: "The whole counter flow",
    desc: "Upload, clean, segment, recolour and share on WhatsApp — start to finish, in one place.",
    tone: "walnut",
    href: "/method",
  },
] as const;

export function Services() {
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
      <div className="hv-services-grid reveal d1">
        {SERVICES.map((s) => (
          <Link key={s.href} href={s.href} className="hv-svc-card ph ph-grain" data-tone={s.tone}>
            <span className="hv-svc-eyebrow">{s.kicker}</span>
            <span className="hv-svc-title">{s.title}</span>
            <span className="hv-svc-desc">{s.desc}</span>
            <span className="hv-svc-arrow" aria-hidden>→</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
