import { PAINT_BRANDS } from "@/lib/types";

// The companies whose shade cards we work from. Named only to say whose colours a
// shop can look up here — never as partners, and the note below says so plainly.
// Which of them a given shop actually sees depends on what its distributor has
// assigned it, so the catalogue page states the live list and this one does not
// promise a count.
//
// Read from PAINT_BRANDS rather than kept as a second list. The copy here had
// drifted to five names, and the fifth — "Indigo" — is not a paint company at
// all: it is one of our own shade names (Indigo Night, Indigo Twilight) that
// found its way into a list of manufacturers. Naming a company we do not carry
// is the one mistake this section cannot afford, so it no longer has its own
// list to drift.

export function Partners() {
  return (
    <section id="partners" className="hv-partners full-bleed" aria-label="Paint companies in the catalogue">
      <div className="hv-partners-inner reveal">
        <span className="hv-partners-label">Shade cards we work from</span>
        <div className="hv-partners-brands">
          {PAINT_BRANDS.map((name, i) => (
            <span key={name} className={`hv-partners-brand${i === 0 ? " is-lead" : ""}`}>
              {name}
            </span>
          ))}
        </div>
        <span className="hv-partners-note">
          HueVista is an independent product. These company and product names are the
          trademarks of their owners, used only to say whose shades you can look up
          here. We are not associated with, endorsed by or acting for any of them.
        </span>
      </div>
    </section>
  );
}
