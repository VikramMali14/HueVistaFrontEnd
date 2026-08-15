import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/layout/site-header";
import { Footer } from "@/components/layout/footer";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { RevealMount } from "@/components/ui/reveal-mount";
import { CompareSlider } from "@/components/home/compare-slider";
import { fetchWorkProjects } from "@/lib/free-projects-server";
import { detailOfWork, TONE_BG, WORKS, type WorkDetail } from "@/lib/work";
import { workDetailOf } from "@/lib/work-published";

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * The portfolio, whichever of its two sources it is coming from.
 *
 * Rooms an admin filed under "Our work" when there are any, the built-in
 * demonstration projects when there are not — the same rule the listing page
 * applies, and it has to be the same rule, or the spiral would link to pages
 * that answer 404 (or worse, to a different room than the card showed).
 *
 * Fetched as the whole list rather than one room by slug because the page needs
 * its neighbours anyway, and both reads would hit the same cache entry.
 */
async function portfolio(): Promise<WorkDetail[]> {
  const published = await fetchWorkProjects();
  return published.length > 0 ? published.map(workDetailOf) : WORKS.map(detailOfWork);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const w = (await portfolio()).find((d) => d.slug === slug);
  return {
    title: w ? `${w.title} — Our work` : "Our work",
    description: w?.blurb,
  };
}

export default async function WorkDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const works = await portfolio();
  const index = works.findIndex((w) => w.slug === slug);
  if (index < 0) notFound();
  const work = works[index]!;

  // Modulo keeps both in range, so a portfolio of one wraps to itself rather
  // than rendering a link to nothing.
  const prev = works[(index - 1 + works.length) % works.length]!;
  const next = works[(index + 1) % works.length]!;

  return (
    <>
      <SiteHeader />
      <main id="main">
        <RevealMount />
        <header className="page-head">
          <div className="eyebrow-row">
            <Eyebrow>Our work · No. {String(index + 1).padStart(2, "0")}</Eyebrow>
            <Mono>{[work.category, work.location, work.year].filter(Boolean).join(" · ")}</Mono>
          </div>
          <h1 className="display">{work.title}</h1>
          <Lead className="page-lead">{work.blurb}</Lead>
        </header>

        {/* No paddingTop: the picture's own top margin is the sole spacer under the page head. */}
        <section style={{ paddingBottom: 72 }}>
          {work.imageUrl ? (
            <>
              {/* A published room has ONE photograph — the finished wall. The
                  drag-to-compare below is two tonal gradients standing in for a
                  before and after, which is honest on the built-in projects and
                  would be a fabrication here. */}
              {/* eslint-disable-next-line @next/next/no-img-element -- backend-signed URL, not a static asset */}
              <img
                src={work.imageUrl}
                alt={work.alt ?? work.title}
                style={{
                  width: "100%",
                  display: "block",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--rule)",
                  aspectRatio: work.aspect,
                  objectFit: "cover",
                }}
              />
              <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                <Mono>
                  Recoloured from a single photograph — {work.palette.length}{" "}
                  {work.palette.length === 1 ? "surface" : "surfaces"}, the room otherwise untouched
                </Mono>
                <Mono>{work.code}</Mono>
              </div>
            </>
          ) : (
            <>
              <CompareSlider
                afterShade={`${work.shadeName} · ${work.code}`}
                beforeBg={work.beforeTone ? TONE_BG[work.beforeTone] : undefined}
                afterBg={TONE_BG[work.tone]}
              />
              <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                <Mono>Drag to compare — the room before, and after {work.shadeName?.toLowerCase()}</Mono>
                <Mono>{work.code}</Mono>
              </div>
            </>
          )}
        </section>

        <section style={{ paddingTop: 96, paddingBottom: 96 }}>
          <div className="reveal r-stack-md" style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 80, alignItems: "start" }}>
            <div>
              <Eyebrow>The palette</Eyebrow>
              <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 1, background: "var(--rule)", border: "1px solid var(--rule)", borderRadius: "var(--radius)", overflow: "hidden" }}>
                {work.palette.map((p, i) => (
                  <div key={`${p.name}-${i}`} style={{ display: "flex", alignItems: "center", gap: 18, background: "var(--surface)", padding: "16px 18px" }}>
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
              {/* Every section below is omitted rather than left standing empty:
                  a room can go on the portfolio the moment it is published, with
                  the story written later or never. */}
              {work.story.length > 0 && (
                <>
                  <Eyebrow>The story</Eyebrow>
                  {work.story.map((para, i) => (
                    <p key={i} style={{ font: "400 19px/1.65 var(--sans)", color: "var(--fg-soft)", maxWidth: "58ch", margin: i === 0 ? "32px 0 0" : "20px 0 0" }}>
                      {para}
                    </p>
                  ))}
                </>
              )}
              {work.stats.length > 0 && (
                <div className="r-cols-xs-1" style={{ marginTop: work.story.length > 0 ? 48 : 0, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
                  {work.stats.map(([k, v], i) => (
                    <div key={`${k}-${i}`} style={{ borderTop: "1px solid var(--rule)", paddingTop: 16 }}>
                      <Mono style={{ display: "block" }}>{k}</Mono>
                      <div style={{ fontFamily: "var(--serif)", fontWeight: 600, fontSize: 26, color: "var(--fg)", marginTop: 10, letterSpacing: "-.01em" }}>{v}</div>
                    </div>
                  ))}
                </div>
              )}
              {work.credit && (
                <Mono style={{ display: "block", marginTop: 32, color: "var(--fg-mute)" }}>{work.credit}</Mono>
              )}
            </div>
          </div>
        </section>

        {/* A portfolio of one has nowhere to go but back to itself, so the pair
            is dropped rather than rendered as two links to this same page. */}
        {works.length > 1 && (
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
        )}

        <section style={{ textAlign: "center", padding: "140px 0" }}>
          <div className="reveal">
            <Mono brass>Your room next</Mono>
            <h2 className="display" style={{ fontSize: "clamp(44px, 7vw, 108px)", marginTop: 24, lineHeight: 0.95 }}>
              See your walls{" "}<br /><i>before you paint them.</i>
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
