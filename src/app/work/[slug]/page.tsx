import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/layout/site-header";
import { Footer } from "@/components/layout/footer";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { RevealMount } from "@/components/ui/reveal-mount";
import { CompareSlider } from "@/components/home/compare-slider";
import { getWork, getWorkNeighbours, TONE_BG, WORKS } from "@/lib/work";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const w = getWork(slug);
  return {
    title: w ? `${w.title} — Our work` : "Our work",
    description: w?.blurb,
  };
}

export default async function WorkDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const work = getWork(slug);
  if (!work) notFound();
  const { prev, next } = getWorkNeighbours(slug);
  const index = WORKS.findIndex((w) => w.slug === slug) + 1;

  return (
    <>
      <SiteHeader />
      <main>
        <RevealMount />
        <header className="page-head">
          <div className="eyebrow-row">
            <Eyebrow>Our work · No. {String(index).padStart(2, "0")}</Eyebrow>
            <Mono>{work.category} · {work.location} · {work.year}</Mono>
          </div>
          <h1 className="display">{work.title}</h1>
          <Lead className="page-lead">{work.blurb}</Lead>
        </header>

        {/* No paddingTop: the slider's own top margin is the sole spacer under the page head. */}
        <section style={{ paddingBottom: 72 }}>
          <CompareSlider
            afterShade={`${work.shadeName} · ${work.code}`}
            beforeBg={TONE_BG[work.beforeTone]}
            afterBg={TONE_BG[work.tone]}
          />
          <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <Mono>Drag to compare — the room before, and after {work.shadeName.toLowerCase()}</Mono>
            <Mono>{work.code}</Mono>
          </div>
        </section>

        <section style={{ paddingTop: 96, paddingBottom: 96 }}>
          <div className="reveal r-stack-md" style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 80, alignItems: "start" }}>
            <div>
              <Eyebrow>The palette</Eyebrow>
              <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 1, background: "var(--rule)", border: "1px solid var(--rule)", borderRadius: "var(--radius)", overflow: "hidden" }}>
                {work.palette.map((p) => (
                  <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 18, background: "var(--surface)", padding: "16px 18px" }}>
                    <span aria-hidden style={{ width: 52, height: 52, borderRadius: 8, background: p.hex, border: "1px solid var(--rule-strong)", flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ font: "600 16px/1.3 var(--sans)", color: "var(--fg)" }}>{p.name}</div>
                      <div style={{ font: "400 13px/1.4 var(--sans)", color: "var(--fg-mute)", marginTop: 2 }}>{p.surface}</div>
                    </div>
                    <Mono style={{ marginLeft: "auto" }}>{p.hex}</Mono>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <Eyebrow>The story</Eyebrow>
              {work.story.map((para, i) => (
                <p key={i} style={{ font: "400 19px/1.65 var(--sans)", color: "var(--fg-soft)", maxWidth: "58ch", margin: i === 0 ? "32px 0 0" : "20px 0 0" }}>
                  {para}
                </p>
              ))}
              <div className="r-cols-xs-1" style={{ marginTop: 48, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
                {work.stats.map(([k, v]) => (
                  <div key={k} style={{ borderTop: "1px solid var(--rule)", paddingTop: 16 }}>
                    <Mono style={{ display: "block" }}>{k}</Mono>
                    <div style={{ fontFamily: "var(--serif)", fontWeight: 600, fontSize: 26, color: "var(--fg)", marginTop: 10, letterSpacing: "-.01em" }}>{v}</div>
                  </div>
                ))}
              </div>
              <Mono style={{ display: "block", marginTop: 32, color: "var(--fg-mute)" }}>{work.credit}</Mono>
            </div>
          </div>
        </section>

        <section style={{ paddingTop: 64, paddingBottom: 64 }}>
          <div className="r-stack-sm" style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 24, alignItems: "center" }}>
            <Link href={`/work/${prev.slug}`} className="text-link" style={{ justifySelf: "start" }}>
              ← {prev.title}
            </Link>
            <Link href="/work" className="mono" style={{ justifySelf: "center", color: "var(--fg-mute)" }}>
              All work
            </Link>
            <Link href={`/work/${next.slug}`} className="text-link" style={{ justifySelf: "end" }}>
              {next.title} →
            </Link>
          </div>
        </section>

        <section style={{ textAlign: "center", padding: "140px 0" }}>
          <div className="reveal">
            <Mono brass>Your room next</Mono>
            <h2 className="display" style={{ fontSize: "clamp(44px, 7vw, 108px)", marginTop: 24, lineHeight: 0.95 }}>
              See your walls<br /><i>before you paint them.</i>
            </h2>
            <div style={{ marginTop: 48, display: "inline-flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
              <Link href="/method" className="btn btn-brass">How it works <span className="arr">→</span></Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
