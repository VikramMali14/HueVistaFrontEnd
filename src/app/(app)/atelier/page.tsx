import type { Metadata } from "next";
import { requireAccessToken } from "@/lib/auth";
import { Eyebrow } from "@/components/ui/eyebrow";
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
      <header className="hv-studio-head">
        <div>
          <Eyebrow>Studio</Eyebrow>
          <h1 className="display" style={{ fontSize: "clamp(34px, 4.5vw, 56px)", marginTop: 10 }}>
            Paint the <i>room.</i>
          </h1>
          <p style={{ font: "300 19px/1.5 var(--serif)", color: "var(--fg-soft)", marginTop: 14, maxWidth: "52ch" }}>
            Add a photo, let the AI find the walls, then try any colour from the catalogue —
            recolouring is free and instant.
          </p>
        </div>
        <span className="hv-live-badge">
          <span className="hv-live-dot" aria-hidden /> Live · in your browser
        </span>
      </header>

      <Visualizer projectId={project} shades={shades} initialName={name} />

      <div className="hv-studio-facts" aria-label="Good to know">
        <Fact title="Free & instant">
          Trying colours costs nothing — only cleaning the photo and detecting walls use your monthly AI previews.
        </Fact>
        <Fact title="Made for the counter">
          Works on a phone or tablet — shoot the room, recolour, and send the customer a link in a tap.
        </Fact>
        <Fact title="Real shades, real codes">
          Every colour is a live catalogue shade with its exact code, ready to mix.
        </Fact>
      </div>

      <style>{`
        .hv-studio-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; flex-wrap: wrap; margin-bottom: 28px; }
        .hv-live-badge { display: inline-flex; align-items: center; gap: 9px; flex-shrink: 0; font: 500 11px/1 var(--mono); letter-spacing: .16em; text-transform: uppercase; color: var(--fg-mute); border: 1px solid var(--rule-strong); border-radius: var(--radius-pill); padding: 9px 15px; }
        .hv-live-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--sage); box-shadow: 0 0 0 3px rgba(78,122,82,.18); }
        .hv-studio-facts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: var(--rule); border: 1px solid var(--rule); border-radius: var(--radius); overflow: hidden; margin-top: 28px; }
        .hv-studio-fact { background: var(--bg); padding: 22px 24px; }
        .hv-studio-fact h3 { font: 600 14px/1.2 var(--sans); color: var(--fg); margin: 0 0 8px; }
        .hv-studio-fact p { font: 400 14px/1.55 var(--sans); color: var(--fg-soft); margin: 0; }
        @media (max-width: 768px) { .hv-studio-facts { grid-template-columns: 1fr; } }
      `}</style>
    </>
  );
}

function Fact({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="hv-studio-fact">
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
