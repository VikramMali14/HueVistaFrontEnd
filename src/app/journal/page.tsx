import type { Metadata } from "next";
import Link from "next/link";
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
  description: "Letters from the atelier. Essays on colour, retail and the trade.",
};

export default function JournalPage() {
  return (
    <>
      <Marquee items={["The Journal · Letters from the atelier", "Monthly · Belgavi · MMXXVI", "On colour, on craft, on the counter"]} />
      <SiteHeader />
      <main>
        <RevealMount />
        <header className="page-head">
          <div className="eyebrow-row">
            <Eyebrow>Volume V &nbsp;·&nbsp; The Journal</Eyebrow>
            <Mono>Letters · Essays · Field notes</Mono>
          </div>
          <h1 className="display">Letters from<br /><i>the atelier.</i></h1>
          <Lead className="page-lead">On colour, on craft, on the quiet economics of the Indian paint counter. A monthly journal, written by the people who built HueVista — and by the retailers who use it.</Lead>

          <div className="reveal d2 r-stack-md" style={{ marginTop: 80, display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 64, alignItems: "center" }}>
            <Placeholder tone="oxblood" grain corners tag="FEATURED · ESSAY" style={{ aspectRatio: "5 / 4" }} />
            <div>
              <Eyebrow>Featured essay &nbsp;·&nbsp; No. XVII</Eyebrow>
              <h2 style={{ fontFamily: "var(--serif)", fontWeight: 300, fontSize: "clamp(40px, 5vw, 72px)", lineHeight: 0.98, color: "var(--fg)", margin: "24px 0 24px", letterSpacing: "-.015em" }}>
                The colour of an <i>Indian afternoon.</i>
              </h2>
              <p style={{ font: "300 18px/1.55 var(--sans)", color: "var(--fg-soft)" }}>
                Why western light reads warmer in Belgavi than in Bengaluru — and what that means for the shade card you place on the counter. A meditation on geography, glazing, and the eye that has grown up watching either.
              </p>
              <div style={{ marginTop: 32, display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ width: 48, height: 48, borderRadius: "50%", background: "linear-gradient(135deg, var(--brass), var(--brass-deep))", border: "1px solid var(--rule-strong)" }} />
                <div>
                  <div style={{ fontFamily: "var(--serif)", fontSize: 20, color: "var(--fg)" }}>Ananya R.</div>
                  <Mono style={{ marginTop: 4, display: "block" }}>10 min read · May MMXXVI</Mono>
                </div>
              </div>
              <Link href="/journal" className="text-link" style={{ marginTop: 32, display: "inline-block" }}>Read the essay &nbsp;→</Link>
            </div>
          </div>
        </header>

        <section style={{ paddingTop: 80 }}>
          <JournalFilters entries={ENTRIES} />
          <div style={{ marginTop: 64, textAlign: "center" }}>
            <Link href="/journal" className="text-link">Read older entries · archive &nbsp;→</Link>
          </div>
        </section>

        <JournalNewsletter />
      </main>
      <Footer />
    </>
  );
}
