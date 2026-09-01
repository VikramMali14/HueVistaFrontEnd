import { FREE_PLAN_PROJECTS } from "@/lib/free-plan";

/**
 * The three numbers under the hero.
 *
 * Two of them used to be wrong. The trial read "14 days" while the backend granted
 * seven and every other page on the site said seven; the catalogue read "10,000+"
 * while the backend holds 4,522. Both now come from the source that decides them —
 * the free-plan constants, and the live catalogue count the page passes in — so
 * neither can drift again.
 *
 * The free figure is an ALLOWANCE now, not a countdown: the plan renews, so "2 free
 * projects a month" is the standing offer where "7 days" was a deadline.
 *
 * `shades` is null when the catalogue count could not be fetched (the backend is
 * down). The row then drops that figure and renders the two it can still state
 * truthfully, rather than printing a hard-coded number that would drift the moment
 * another company's catalogue is loaded.
 *
 * The numbers are printed, not performed. They used to ride in on a count-up while
 * their labels blurred in word by word from alternating directions — which on the
 * shade count meant animating through four thousand values that are not the figure,
 * to arrive at the one that is. A number a shop owner is being asked to trust
 * should not audition first, and the row sits immediately under the hero where a
 * visitor is still deciding whether to keep reading.
 */
export function Stats({ shades }: { shades?: number | null }) {
  const STATS = [
    { value: "20s", label: "Photo to realistic preview" },
    ...(shades ? [{ value: shades.toLocaleString("en-IN"), label: "Shades, real codes intact" }] : []),
    { value: `${FREE_PLAN_PROJECTS} a month`, label: "Free projects, no card" },
  ];

  return (
    <section className="hv-stats full-bleed band-tight" aria-label="HueVista in numbers">
      <div className={`hv-stats-grid${STATS.length === 2 ? " is-two" : ""}`}>
        {STATS.map((s) => (
          <div key={s.label} className="hv-stat reveal">
            <div className="hv-stat-num">{s.value}</div>
            <div className="hv-stat-label">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
