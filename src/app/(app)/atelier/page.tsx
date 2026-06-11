import type { Metadata } from "next";
import { requireAccessToken } from "@/lib/auth";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { Visualizer } from "@/components/atelier/visualizer";
import { fetchCatalogue } from "@/lib/catalogue";
import { SHADES } from "@/lib/shades";
import type { PaintShade } from "@/lib/types";

export const metadata: Metadata = {
  title: "Studio",
  description: "Upload a photo, mark the walls, recolour — in seconds.",
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
          <Mono>Instant recolour · runs in your browser</Mono>
        </div>
        <h1 className="display" style={{ fontSize: "clamp(40px, 5vw, 72px)" }}>The Studio</h1>
        <Lead style={{ marginTop: 16 }}>Upload the photo, clean the frame, mark the walls, recolour.</Lead>
      </header>
      <Visualizer projectId={project} shades={shades} initialName={name} />
      <section className="r-cols-sm-1" style={{ marginTop: 56, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 24 }}>
        <div>
          <Mono style={{ marginBottom: 18, display: "block" }}>What the AI does</Mono>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[["Reads the room", "what's wall, what's not", "~1 s"], ["Cleans the frame", "wires and clutter removed", "6–10 s"], ["Finds every wall", "each one recolourable alone", "5–8 s"], ["One-click fix-ups", "click a missed surface to add it", "2–3 s"], ["Colour suggestions", "three-shade combos, real codes", "3–4 s"]].map(([k, v, t]) => (
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
          <p style={{ font: "300 17px/1.5 var(--serif)", color: "var(--fg-soft)" }}>Changing colours is free and instant. Only the AI steps — cleaning the photo and detecting walls — count against your monthly AI previews.</p>
        </div>
      </section>
    </>
  );
}
