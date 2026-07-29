import Link from "next/link";
import { contact } from "@/lib/config";
import { BrandMark } from "./brand-mark";

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
      { href: "/legal/contact", label: "Contact" },
    ],
  },
] as const;

export function Footer() {
  return (
    <footer>
      <div className="footer-inner">
        <div className="footer-col">
          <Link
            href="/"
            aria-label="HueVista — home"
            style={{ display: "inline-flex", alignItems: "center", gap: 11, marginBottom: 16 }}
          >
            <BrandMark height={30} />
            <span style={{ display: "inline-block" }}>
              <span style={{ display: "block", font: "700 18px/1 var(--serif)", letterSpacing: "-.02em", color: "var(--fg)" }}>
                HueVista
              </span>
              <span
                style={{
                  display: "block",
                  marginTop: 5,
                  font: "400 9.5px/1 var(--mono)",
                  letterSpacing: ".2em",
                  textTransform: "uppercase",
                  color: "var(--fg-mute)",
                }}
              >
                Shades &amp; colours
              </span>
            </span>
          </Link>
          <p className="body" style={{ fontSize: 14, maxWidth: "34ch", marginTop: 12, color: "var(--fg-mute)" }}>
            Preview any paint colour on real walls before the can opens.
            Built in India for paint shops and their customers.
          </p>
          <address style={{ fontStyle: "normal", fontSize: 12.5, lineHeight: 1.6, marginTop: 18, color: "var(--fg-mute)", maxWidth: "34ch" }}>
            <div style={{ fontWeight: 600, color: "var(--fg-soft)" }}>HueVista</div>
            <div>Proprietor: Vikram Mali</div>
            <div>Mount Road, Manpur, Abu Road,<br />Sirohi, Rajasthan 307026, India</div>
            <div style={{ marginTop: 6 }}>
              <a href={`mailto:${contact.general}`} style={{ color: "inherit" }}>{contact.general}</a>
            </div>
            <div>
              <a href={`tel:${contact.phoneE164}`} style={{ color: "inherit" }}>{contact.phone}</a>
            </div>
          </address>
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
        <span className="mono">Abu Road · Rajasthan · India</span>
        <span className="mono" style={{ display: "inline-flex", gap: 8 }}>
          <Link href="/legal/privacy" style={{ color: "inherit" }}>Privacy</Link>·
          <Link href="/legal/terms" style={{ color: "inherit" }}>Terms</Link>·
          <Link href="/legal/refunds" style={{ color: "inherit" }}>Refunds</Link>·
          <Link href="/legal/delivery" style={{ color: "inherit" }}>Delivery</Link>·
          <Link href="/legal/contact" style={{ color: "inherit" }}>Contact</Link>
        </span>
      </div>
    </footer>
  );
}
