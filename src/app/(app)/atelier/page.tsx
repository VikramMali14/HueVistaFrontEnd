import type { Metadata } from "next";
import { requireAccessToken } from "@/lib/auth";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
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
        <div className="hv-studio-head-row">
          <Eyebrow>Studio</Eyebrow>
          <span className="hv-live-badge">
            <span className="hv-live-dot" aria-hidden /> Live · in your browser
          </span>
        </div>
        <h1 className="display hv-studio-title">
          Paint the <i>room.</i>
        </h1>
        <Lead className="hv-studio-lead">
          Add a photo, mark the walls, then try any shade from the catalogue — recolouring is free and instant.
        </Lead>
      </header>

      <Visualizer projectId={project} shades={shades} initialName={name} />

      <style>{`
        .hv-studio-head { margin-bottom: 32px; }
        .hv-studio-head-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 18px; }
        .hv-studio-title { font-size: clamp(34px, 4.5vw, 56px); }
        .hv-studio-lead { margin-top: 16px; max-width: 54ch; }
        .hv-live-badge { display: inline-flex; align-items: center; gap: 9px; flex-shrink: 0; font: 500 11px/1 var(--mono); letter-spacing: .16em; text-transform: uppercase; color: var(--fg-mute); border: 1px solid var(--rule-strong); border-radius: var(--radius-pill); padding: 9px 15px; }
        .hv-live-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--sage); box-shadow: 0 0 0 3px rgba(78,122,82,.18); }
      `}</style>
    </>
  );
}
