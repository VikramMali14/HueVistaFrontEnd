import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { Footer } from "@/components/layout/footer";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { Placeholder } from "@/components/ui/placeholder";
import { RevealMount } from "@/components/ui/reveal-mount";
import { AiPreviewNote } from "@/components/shared/accuracy-note";
import { fetchCatalogueSize } from "@/lib/catalogue";
import { METHOD_FIGURES } from "@/lib/method-figures";
import { fetchSiteAssets } from "@/lib/site-assets-server";
import { methodFigureSlot } from "@/lib/site-assets";

export const metadata: Metadata = {
  title: "How it works",
  description: "A photo of a room, the walls found automatically, any colour on them — in seconds, at your counter.",
};

// Six plain steps. This page used to be written as prose — "A photograph is a flat
// surface. We make it dimensional", "Nothing is ever repainted by a machine's
// imagination" — which read well and told a shop owner nothing they could act on.
// Each step now says what happens, in the order it happens, in words a counter
// assistant can repeat to a customer. It also stops short of describing HOW any of
// it is done: that is our business, and a description of the machinery ages badly.
const CHAPTERS = [
  {
    num: "I.",
    eyebrow: "Upload",
    title: <>The <i>photo.</i></>,
    body: "Take a photo of the room on any phone, or use one the customer has already sent you on WhatsApp. One clear picture of the wall is enough.",
    tone: "ivory" as const,
    tag: "FIG. I",
    figureAlt: "A room photographed on a phone, as a customer would send it",
  },
  {
    num: "II.",
    eyebrow: "Clean up",
    title: <>The <i>clean-up.</i></>,
    body: "Everyday clutter — a hanging wire, a stray object, marks on the wall — is tidied out of the picture first, so the colour is the thing your customer looks at.",
    tone: "slate" as const,
    tag: "FIG. II",
    figureAlt: "The same room with everyday clutter tidied out of the picture",
  },
  {
    num: "III.",
    eyebrow: "Find the walls",
    title: <>The <i>walls.</i></>,
    body: "Next we work out which parts of the photo are paintable wall and which are not — furniture, windows, doors, the floor. Each wall is kept separate, so you can give them different colours.",
    tone: "sage" as const,
    tag: "FIG. III",
    figureAlt: "The studio with each wall outlined as a separate paintable surface",
  },
  {
    num: "IV.",
    eyebrow: "Fix anything missed",
    title: <>The <i>correction.</i></>,
    body: "It gets it right most of the time, not every time. If a pillar or a picture frame is included by mistake, click to add or remove it yourself. Your correction is saved with the room.",
    tone: "brass" as const,
    tag: "FIG. IV",
    figureAlt: "A wall being corrected by hand, adding back a pillar the detection missed",
  },
  {
    num: "V.",
    eyebrow: "Paint it",
    title: <>The <i>colour.</i></>,
    body: "Now pick a shade and the wall takes it. The original photo stays underneath as the reference, so the light and shadows in the room stay where they were and only the colour changes. Try as many shades as you like — it costs nothing extra.",
    tone: "terracotta" as const,
    tag: "FIG. V",
    figureAlt: "The room repainted, its light and shadows unchanged",
  },
  {
    num: "VI.",
    eyebrow: "Send it back",
    title: <>The <i>handover.</i></>,
    body: "Send the finished picture to your customer on WhatsApp or as a link, with the shade codes attached. They show it at home; you mix the can.",
    tone: "ink" as const,
    tag: "FIG. VI",
    figureAlt: "The finished picture sent to the customer with its shade codes",
  },
];

export default async function MethodPage() {
  // Two sources for the same six pictures, and the order matters. An UPLOADED
  // figure wins: it is the one an admin can change today, from the console, with
  // no deploy. METHOD_FIGURES is the older route — files committed to /public —
  // and stays as the fallback so anything already shipped keeps showing until it
  // is replaced. An empty slot with no committed file draws the coloured plate,
  // exactly as before.
  const [size, assets] = await Promise.all([fetchCatalogueSize(), fetchSiteAssets()]);
  return (
    <>
      <SiteHeader />
      <main id="main">
        <RevealMount />
        <header className="page-head">
          <div className="eyebrow-row">
            <Eyebrow>How it works</Eyebrow>
            <Mono>Made in India</Mono>
          </div>
          <h1 className="display">From a photo,{" "}<br /><i>a painted wall.</i></h1>
          {/* The count is read from the catalogue rather than written out — the prose
              said "two thousand" while the site's other pages said "10,000+", and
              neither matched what the backend actually serves. */}
          <Lead className="page-lead">Send in a photo of a room. Seconds later you get the same room back with its walls in any of {size ? `our ${size.shades.toLocaleString("en-IN")} shades` : "our shades"} — the furniture, the light and the shadows all left as they were.</Lead>
          {/* Right under the promise, not buried at the bottom. The whole page is a
              description of an AI doing something to a customer's photograph, so the
              honest limit belongs beside it. */}
          <AiPreviewNote style={{ marginTop: 24 }} />
        </header>

        {CHAPTERS.map((c, i) => (
          <article key={c.num} className="reveal hv-method-chapter" style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr", gap: 64, padding: "100px 0", borderTop: i === 0 ? "none" : "1px solid var(--rule)", alignItems: "start" }}>
            <span style={{ fontFamily: "var(--serif)", fontWeight: 600, fontSize: 56, lineHeight: 1, color: "var(--brass)" }}>{c.num}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
              <Eyebrow>{c.eyebrow}</Eyebrow>
              <h2 style={{ fontFamily: "var(--serif)", fontWeight: 600, fontSize: "clamp(48px, 6vw, 84px)", lineHeight: 0.95, letterSpacing: "-.02em", color: "var(--fg)", margin: 0 }}>{c.title}</h2>
              <Lead>{c.body}</Lead>
            </div>
            <div>
              {/* A real photograph or screenshot when one exists for this step —
                  uploaded in the admin console, or committed under /public — and
                  the coloured plate until then. */}
              <Placeholder
                tone={c.tone}
                grain
                corners
                tag={c.tag}
                src={assets[methodFigureSlot(i + 1)]?.url ?? METHOD_FIGURES[c.num]?.src}
                alt={assets[methodFigureSlot(i + 1)] ? c.figureAlt : (METHOD_FIGURES[c.num]?.alt ?? c.figureAlt)}
                style={{ aspectRatio: "4 / 5" }}
              />
            </div>
          </article>
        ))}

        <section style={{ textAlign: "center", padding: "140px 0", background: "radial-gradient(ellipse at 50% 40%, rgba(192,139,78,.10), transparent 62%)" }}>
          <div className="reveal">
            <Mono brass>Begin</Mono>
            <h2 className="display" style={{ fontSize: "clamp(60px, 10vw, 160px)", marginTop: 32, lineHeight: 0.92 }}>
              The colour, <i>at the counter.</i>
            </h2>
            <div style={{ marginTop: 56, display: "inline-flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
              {/* This page's only call to action. It used to open the gallery — a set of
                  placeholder plates — so it now goes where a reader who has just read how
                  the product works actually wants to go: asking for an account. */}
              <Link href="/trial" className="btn btn-brass">Bring it to your counter <span className="arr">→</span></Link>
              <Link href="/catalogue" className="btn btn-ghost">Browse the catalogue <span className="arr">→</span></Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
