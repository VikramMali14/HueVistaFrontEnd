import type { Metadata } from "next";
import { requireAccessToken } from "@/lib/auth";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { Visualizer } from "@/components/atelier/visualizer";
import { fetchCatalogue } from "@/lib/catalogue";
import { SHADES } from "@/lib/shades";
import type { PaintShade } from "@/lib/types";

export const metadata: Metadata = {
  title: "Studio",
  description: "Upload, clean, segment, recolour.",
};

export default async function AtelierPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; name?: string }>;
}) {
  // Gate the route — the BFF proxy will pick up the cookie itself; we don't pass the token.
  await requireAccessToken();
  const { project, name } = await searchParams;
  // Live catalogue from the backend; fall back to the bundled sample if it's unreachable.
  let shades: PaintShade[];
  try {
    const live = await fetchCatalogue();
    shades = live.length > 0 ? live : [...SHADES];
  } catch {
    shades = [...SHADES];
  }
  return (
    <>
      <header style={{ marginBottom: 40 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
          <Eyebrow>Studio</Eyebrow>
          <Mono>WebGL · 60 fps · zero backend round-trip per swatch</Mono>
        </div>
        <h1 className="display" style={{ fontSize: "clamp(40px, 5vw, 72px)" }}>The Studio</h1>
        <Lead style={{ marginTop: 16 }}>The room on the left, the catalogue at hand on the right. Upload, clean, segment, recolour.</Lead>
      </header>
      <Visualizer projectId={project} shades={shades} initialName={name} />
      <section className="r-cols-sm-1" style={{ marginTop: 56, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
        <div>
          <Mono style={{ marginBottom: 18, display: "block" }}>Performance</Mono>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {[["< 10 s", "Upload to first preview"], ["< 100 ms", "Per swatch change"], ["60 fps", "Mid-range mobile"]].map(([n, l]) => (
              <div key={l} style={{ display: "flex", gap: 20, alignItems: "baseline", borderBottom: "1px solid var(--rule)", paddingBottom: 14 }}>
                <span className="display" style={{ fontSize: 40, minWidth: 120 }}>{n}</span>
                <span style={{ font: "300 16px/1.4 var(--serif)", color: "var(--fg-soft)" }}>{l}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <Mono style={{ marginBottom: 18, display: "block" }}>AI pipeline</Mono>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[["Image classification", "Claude Haiku Vision", "0.4 s"], ["Image cleaner", "Nano Banana Pro · Replicate", "6–10 s"], ["Auto mask", "Nano Banana · color-coded", "5–8 s"], ["Click refinement", "SAM 2 · point prompt", "2–3 s"], ["Combo recommendation", "Claude Sonnet · ΔE snap", "3–4 s"]].map(([k, v, t]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "1px solid var(--rule)", paddingBottom: 10, gap: 16 }}>
                <div>
                  <span style={{ font: "300 17px/1 var(--serif)" }}>{k}</span>
                  <div><Mono>{v}</Mono></div>
                </div>
                <Mono>{t}</Mono>
              </div>
            ))}
          </div>
        </div>
        <div>
          <Mono style={{ marginBottom: 18, display: "block" }}>A note on cost</Mono>
          <p style={{ font: "300 17px/1.5 var(--serif)", color: "var(--fg-soft)" }}>Colour application is browser-side WebGL — zero marginal cost. Only generative AI calls (classification, image clean, segmentation, recommendations) count against your monthly quota.</p>
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--rule)", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <Mono>AI used · this month</Mono>
            <span style={{ font: "300 22px/1 var(--serif)", color: "var(--accent)" }}>04 / 60</span>
          </div>
        </div>
      </section>
    </>
  );
}
