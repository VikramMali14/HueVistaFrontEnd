const BRANDS = [
  { name: "Asian Paints", mark: "i" },
  { name: "Berger", mark: "ii" },
  { name: "Nerolac", mark: "ii" },
  { name: "Dulux", mark: "iii" },
  { name: "Indigo", mark: "iii" },
] as const;

export function Partners() {
  return (
    <section id="partners" className="hv-partners full-bleed">
      <div className="hv-partners-inner reveal">
        <span className="hv-partners-label">Built for the catalogues of</span>
        <div className="hv-partners-brands">
          {BRANDS.map((b, i) => (
            <span key={b.name} className={`hv-partners-brand${i === 0 ? " is-lead" : ""}`}>
              {b.name}
              <sup>{b.mark}</sup>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
