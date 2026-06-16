import { CountUp } from "@/components/ui/count-up";
import BlurText from "@/components/ui/blur-text";

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
          <div key={s.label} className="hv-stat">
            <div className="hv-stat-num">
              <CountUp value={s.value} duration={900} />
              {s.suffix}
            </div>
            {/* Labels blur in on scroll, alternating bottom/top so the row reads
                as the numbers settling between two lines of text. */}
            <BlurText
              text={s.label}
              animateBy="words"
              direction={i % 2 === 0 ? "bottom" : "top"}
              delay={90}
              stepDuration={0.3}
              className="hv-stat-label"
            />
          </div>
        ))}
      </div>
    </section>
  );
}
