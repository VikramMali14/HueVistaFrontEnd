import { CountUp } from "@/components/ui/count-up";
import BlurText from "@/components/ui/blur-text";
import { TRIAL_DAYS } from "@/lib/trial";

/**
 * The three numbers under the hero.
 *
 * Two of them used to be wrong. The trial read "14 days" while the backend grants
 * seven (AuthService.TRIAL_DAYS) and every other page on the site says seven; the
 * catalogue read "10,000+" while the backend holds 4,522. Both now come from the
 * source that decides them — the trial constant, and the live catalogue count the
 * page passes in — so neither can drift again.
 *
 * `shades` is null when the catalogue count could not be fetched (the backend is
 * down). The row then drops that figure and renders the two it can still state
 * truthfully, rather than printing a hard-coded number that would drift the moment
 * another company's catalogue is loaded.
 */
export function Stats({ shades }: { shades?: number | null }) {
  const STATS = [
    { value: 20, suffix: "s", label: "Photo to realistic preview" },
    ...(shades ? [{ value: shades, suffix: "", label: "Shades, real codes intact" }] : []),
    { value: TRIAL_DAYS, suffix: " days", label: "Free trial, no card" },
  ];

  return (
    <section className="hv-stats full-bleed">
      <div className={`hv-stats-grid${STATS.length === 2 ? " is-two" : ""}`}>
        {STATS.map((s, i) => (
          <div key={s.label} className="hv-stat">
            <div className="hv-stat-num">
              <CountUp value={s.value} duration={900} />
              {/* Its own span with white-space:pre. .hv-stat-num is a flex
                  container, so a bare " days" text node became an anonymous
                  flex item and had its leading space stripped — the stat read
                  "7days". "20s" wants no space, so the space stays part of the
                  suffix string rather than becoming a flex gap. */}
              <span className="hv-stat-suffix">{s.suffix}</span>
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
