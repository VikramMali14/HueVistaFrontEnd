const STATS = [
  { num: "20s", label: "Photo to realistic preview" },
  { num: "2,481", label: "Shades, real codes intact" },
  { num: "14 days", label: "Free trial, no card" },
];

export function Stats() {
  return (
    <section className="hv-stats full-bleed">
      <p className="hv-stats-intro reveal in">
        Join the paint counters already selling colour before the can opens.
      </p>
      <div className="hv-stats-grid reveal d1">
        {STATS.map((s) => (
          <div key={s.num} className="hv-stat">
            <div className="hv-stat-num">{s.num}</div>
            <div className="hv-stat-label">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
