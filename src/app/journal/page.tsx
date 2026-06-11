import type { Metadata } from "next";
import { Marquee } from "@/components/layout/marquee";
import { SiteHeader } from "@/components/layout/site-header";
import { Footer } from "@/components/layout/footer";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { Placeholder } from "@/components/ui/placeholder";
import { RevealMount } from "@/components/ui/reveal-mount";
import { JournalFilters } from "@/components/journal/journal-filters";
import { JournalNewsletter } from "@/components/journal/journal-newsletter";
import { ENTRIES } from "@/components/journal/journal-entries";

export const metadata: Metadata = {
  title: "Journal",
  description: "Letters from the studio. Essays on colour, retail and the trade.",
};

export default function JournalPage() {
  return (
    <>
      <Marquee items={["The Journal · Letters from the studio", "Monthly · Belgavi", "On colour, on craft, on the counter"]} />
      <SiteHeader />
      <main>
        <RevealMount />
        <header className="page-head">
          <div className="eyebrow-row">
            <Eyebrow>The Journal</Eyebrow>
            <Mono>Letters · Essays · Field notes</Mono>
          </div>
          <h1 className="display">Letters from<br /><i>the studio.</i></h1>
          <Lead className="page-lead">On colour, on craft, on the quiet economics of the Indian paint counter. A monthly journal, written by the people who built HueVista — and by the retailers who use it.</Lead>

          <div className="reveal d2 r-stack-md" style={{ marginTop: 80, display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 64, alignItems: "center" }}>
            <Placeholder tone="oxblood" grain corners tag="FEATURED · ESSAY" style={{ aspectRatio: "5 / 4" }} />
            <div>
              <Eyebrow>Featured essay</Eyebrow>
              <h2 style={{ fontFamily: "var(--serif)", fontWeight: 600, fontSize: "clamp(40px, 5vw, 72px)", lineHeight: 0.98, color: "var(--fg)", margin: "24px 0 24px", letterSpacing: "-.015em" }}>
                The colour of an <i>Indian afternoon.</i>
              </h2>
              <p style={{ font: "300 18px/1.55 var(--sans)", color: "var(--fg-soft)" }}>
                Why western light reads warmer in Belgavi than in Bengaluru — and what that means for the shade card you place on the counter. A meditation on geography, glazing, and the eye that has grown up watching either.
              </p>
              <div style={{ marginTop: 32, display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ width: 48, height: 48, borderRadius: "50%", background: "linear-gradient(135deg, var(--brass), var(--brass-deep))", border: "1px solid var(--rule-strong)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span aria-hidden style={{ font: "500 13px/1 var(--mono)", letterSpacing: ".08em", color: "rgba(20,20,19,.85)" }}>AR</span>
                </div>
                <div>
                  <div style={{ fontFamily: "var(--serif)", fontSize: 20, color: "var(--fg)" }}>Ananya R.</div>
                  <Mono style={{ marginTop: 4, display: "block" }}>10 min read · May 2026</Mono>
                </div>
              </div>
              <a href="#newsletter" className="text-link" style={{ marginTop: 32, display: "inline-block" }}>Get the essays by email — subscribe below &nbsp;↓</a>
            </div>
          </div>
        </header>

        <section style={{ paddingTop: 80 }}>
          <JournalFilters entries={ENTRIES} />
        </section>

        <JournalNewsletter />
      </main>
      <Footer />
    </>
  );
}
