import Link from "next/link";
import { Logo } from "@/components/ui/logo";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/method", label: "How it works" },
      { href: "/catalogue", label: "Colour library" },
      { href: "/work", label: "Our work" },
      { href: "/pricing", label: "Pricing" },
    ],
  },
  {
    title: "Who it's for",
    links: [
      { href: "/trial", label: "Retailers" },
      { href: "/trial", label: "Painters" },
      { href: "/pricing", label: "Manufacturers" },
      { href: "/pricing", label: "Architects" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/method", label: "About" },
      { href: "/journal", label: "Journal" },
      { href: "/trial", label: "Contact" },
    ],
  },
] as const;

export function Footer() {
  return (
    <footer>
      <div className="footer-inner">
        <div className="footer-col">
          <Link href="/" aria-label="HueVista — home" style={{ display: "inline-block", marginBottom: 24 }}>
            <Logo size="sm" inverted ariaLabel={null} />
          </Link>
          <p className="body" style={{ fontSize: 15, maxWidth: "34ch", marginTop: 16 }}>
            Preview any paint colour on real walls before you buy the paint.
            Built in Belgavi, India for paint shops, painters and homeowners.
          </p>
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
        <span className="mono">© HueVista</span>
        <span className="mono">Belgavi · India</span>
        <span className="mono" style={{ display: "inline-flex", gap: 8 }}>
          <Link href="/legal/privacy" style={{ color: "inherit" }}>Privacy</Link>·
          <Link href="/legal/terms" style={{ color: "inherit" }}>Terms</Link>
        </span>
      </div>
    </footer>
  );
}
