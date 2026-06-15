import { CountUp } from "@/components/ui/count-up";

const STATS = [
  { value: 20, suffix: "s", label: "Photo to realistic preview" },
  { value: 2481, suffix: "", label: "Shades, real codes intact" },
  { value: 14, suffix: " days", label: "Free trial, no card" },
];

export function Stats() {
  return (
    <section className="hv-stats full-bleed">
      <div className="hv-stats-grid">
        {STATS.map((s, i) => (
          <div key={s.label} className={`hv-stat reveal d${i + 1}`}>
            <div className="hv-stat-num">
              <CountUp value={s.value} duration={900} />
              {s.suffix}
            </div>
            <div className="hv-stat-label">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
