const BRANDS = [
  "Asian Paints",
  "Berger",
  "Nerolac",
  "Dulux",
  "Indigo",
] as const;

export function Partners() {
  return (
    <section id="partners" className="hv-partners full-bleed">
      <div className="hv-partners-inner reveal">
        <span className="hv-partners-label">Built for the catalogues of</span>
        <div className="hv-partners-brands">
          {BRANDS.map((name, i) => (
            <span key={name} className={`hv-partners-brand${i === 0 ? " is-lead" : ""}`}>
              {name}
            </span>
          ))}
        </div>
        <span className="hv-partners-note">
          Brand names belong to their owners — HueVista is independent and unaffiliated.
        </span>
      </div>
    </section>
  );
}
