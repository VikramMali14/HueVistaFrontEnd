import Link from "next/link";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/method", label: "How it works" },
      { href: "/catalogue", label: "Colour library" },
      { href: "/gallery", label: "Gallery" },
      { href: "/pricing", label: "Pricing" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/work", label: "Our work" },
      { href: "/journal", label: "Journal" },
      { href: "mailto:hello@huevista.com", label: "Contact" },
    ],
  },
] as const;

export function Footer() {
  return (
    <footer>
      <div className="footer-inner">
        <div className="footer-col">
          <Link href="/" aria-label="HueVista — home" style={{ display: "inline-block", marginBottom: 16 }}>
            <span style={{ font: "700 18px/1 var(--serif)", letterSpacing: "-.02em", color: "var(--fg)" }}>HueVista</span>
          </Link>
          <p className="body" style={{ fontSize: 14, maxWidth: "34ch", marginTop: 12, color: "var(--fg-mute)" }}>
            Preview any paint colour on real walls before the can opens.
            Built in Belgavi, India for paint shops and their customers.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <div className="footer-col" key={col.title}>
            <div className="footer-col-title">{col.title}</div>
            {col.links.map((l, i) =>
              l.href.startsWith("mailto:") ? (
                <a key={`${l.href}-${i}`} href={l.href}>{l.label}</a>
              ) : (
                <Link key={`${l.href}-${i}`} href={l.href}>{l.label}</Link>
              ),
            )}
          </div>
        ))}
      </div>
      <div className="footer-bottom">
        <span className="mono">© 2026 HueVista</span>
        <span className="mono">Belgavi · India</span>
        <span className="mono" style={{ display: "inline-flex", gap: 8 }}>
          <Link href="/legal/privacy" style={{ color: "inherit" }}>Privacy</Link>·
          <Link href="/legal/terms" style={{ color: "inherit" }}>Terms</Link>
        </span>
      </div>
    </footer>
  );
}
