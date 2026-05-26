import Link from "next/link";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/method", label: "The Method" },
      { href: "/catalogue", label: "Catalogue" },
      { href: "/pricing", label: "White-label" },
      { href: "/pricing", label: "Pricing" },
    ],
  },
  {
    title: "Audience",
    links: [
      { href: "/trial", label: "Retailers" },
      { href: "/trial", label: "Painters" },
      { href: "/pricing", label: "Manufacturers" },
      { href: "/pricing", label: "Architects" },
    ],
  },
  {
    title: "House",
    links: [
      { href: "/journal", label: "About" },
      { href: "/journal", label: "Journal" },
      { href: "/journal", label: "Press" },
      { href: "/journal", label: "Careers" },
      { href: "/trial", label: "Contact" },
    ],
  },
] as const;

export function Footer() {
  return (
    <footer>
      <div className="footer-inner">
        <div className="footer-col">
          <Link href="/" className="brand" style={{ fontSize: 34, marginBottom: 24 }}>
            <span className="brand-mark" />
            HueVista
          </Link>
          <p className="body" style={{ fontStyle: "italic", fontFamily: "var(--serif)", fontSize: 19, maxWidth: "34ch", marginTop: 16 }}>
            An AI-powered paint shade visualiser for the Indian paint retail trade. Engineered in Belgavi, with care.
          </p>
          <p className="mono" style={{ marginTop: 32 }}>v. 2.0 &nbsp;·&nbsp; MMXXVI</p>
        </div>
        {COLUMNS.map((col) => (
          <div className="footer-col" key={col.title}>
            <div className="footer-col-title">{col.title}</div>
            {col.links.map((l, i) => (
              <Link key={`${l.href}-${i}`} href={l.href}>{l.label}</Link>
            ))}
          </div>
        ))}
      </div>
      <div className="footer-bottom">
        <span className="mono">© HueVista Atelier · MMXXVI</span>
        <span className="mono">Belgavi &nbsp;·&nbsp; Bengaluru &nbsp;·&nbsp; Mumbai</span>
        <span className="mono">Privacy &nbsp;·&nbsp; Terms &nbsp;·&nbsp; Imprint</span>
      </div>
    </footer>
  );
}
