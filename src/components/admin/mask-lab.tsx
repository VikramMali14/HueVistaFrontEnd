"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MaskLabApproach, MaskLabRequest, MaskLabResult } from "@/lib/types";
import { classify, NONE, MAIN, ACCENT, TRIM, WHITE } from "@/lib/mask-registration";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * The mask lab: run one photograph through each way of producing a mask, and
 * look at what came back.
 *
 * <p>The pipeline's mask comes from a GENERATIVE model — one asked to repaint the
 * photo into flat category colours. It understands what a wall IS, which is why
 * it is used, and it redraws rather than traces, which is why every boundary it
 * returns lands a little off and why the aligner and the align bench exist. The
 * question this screen is built to answer is whether some other approach avoids
 * that instead of correcting it.
 *
 * <p>Nothing here touches a project. A run uploads an image, asks one approach,
 * and draws the result over it — no region is written, no credit is spent, and no
 * customer's room can be changed by experimenting.
 *
 * <p>Runs are kept as you go, so two approaches on the same photograph sit side
 * by side. That comparison is the entire product of this screen; a single run in
 * isolation says almost nothing.
 */

/** Longest side the overlay is composited at. The mask is resampled per pixel in
 *  JS, so this is the trade between a sharp preview and a responsive one. */
const PREVIEW_DIM = 900;

const CATS = [
  { id: MAIN, key: "main" as const, label: "Main wall", rgb: [255, 90, 74] },
  { id: ACCENT, key: "accent" as const, label: "Accent wall", rgb: [35, 197, 94] },
  { id: TRIM, key: "trim" as const, label: "Trim", rgb: [74, 125, 255] },
  { id: WHITE, key: "white" as const, label: "Off-palette", rgb: [255, 53, 214] },
];

/** A binary mask has no categories, so it gets one colour of its own — amber,
 *  which none of the category tints use. */
const BINARY_RGB: [number, number, number] = [255, 176, 60];

interface ApproachSpec {
  id: MaskLabApproach;
  name: string;
  /** What it does, in one line. */
  summary: string;
  /** The thing it structurally cannot do — the sentence that stops a promising
   *  first result being mistaken for a finished answer. */
  limit: string;
  cost: string;
}

const APPROACHES: ApproachSpec[] = [
  {
    id: "GENERATIVE",
    name: "Generative colour-coded",
    summary: "What ships today. An image model repaints the photo into flat category colours.",
    limit: "Redraws rather than traces, so its blocks land a few percent off the surfaces they describe. This is the drift everything downstream corrects.",
    cost: "~$0.10 a run · 10–40s",
  },
  {
    id: "PAINTED_SURFACE",
    name: "Painted-surface extraction",
    summary: "Reads the surfaces the clean already repainted, straight out of the pixels. No model.",
    limit: "Cannot tell wall from trim — the clean paints both the same white on purpose. And a concrete road is low-chroma too, so watch what it swallows.",
    cost: "free · instant",
  },
  {
    id: "SAM_POINTS",
    name: "SAM 2, clicked points",
    summary: "Traces the real boundary in the real pixels. Click the surface you want.",
    limit: "One surface a run, and it comes back unnamed. SAM is prompted with positions, never with words.",
    cost: "~$0.002 a run · 1–5s",
  },
  {
    id: "CUSTOM_REPLICATE",
    name: "Any Replicate model",
    summary: "Name a model and type its input body. For a semantic segmenter, a facade parser, a text-grounded model.",
    limit: "You supply the schema, so a wrong body is a 422 rather than a bad mask. Read the model's Replicate page for its input keys.",
    cost: "the model's own · up to 60s",
  },
];

/** Bodies that get somebody to a first result without reading a schema. The
 *  model names are NOT verified — Replicate's catalogue moves, and a name that
 *  was right last month 404s today. They are starting points to edit. */
const TEMPLATE_PRESETS: Array<{ label: string; model: string; body: string }> = [
  {
    label: "Semantic segmentation (ADE20K)",
    model: "",
    body: '{\n  "image": "{{image}}"\n}',
  },
  {
    label: "Text-grounded segmentation",
    model: "",
    body: '{\n  "image": "{{image}}",\n  "prompt": "wall, window, door"\n}',
  },
];

interface Run {
  id: number;
  request: MaskLabRequest;
  result: MaskLabResult;
}

export function MaskLab({
  runAction,
}: {
  runAction: (formData: FormData) => Promise<{ result?: MaskLabResult; error?: string }>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [approach, setApproach] = useState<MaskLabApproach>("PAINTED_SURFACE");

  const [model, setModel] = useState("");
  const [scene, setScene] = useState<"INDOOR" | "OUTDOOR">("OUTDOOR");
  const [inputTemplate, setInputTemplate] = useState(TEMPLATE_PRESETS[0]!.body);
  const [tolerance, setTolerance] = useState(46);
  const [minBlobShare, setMinBlobShare] = useState(0.004);
  const [points, setPoints] = useState<Array<{ x: number; y: number; include: boolean }>>([]);

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const nextId = useRef(1);

  const spec = APPROACHES.find((a) => a.id === approach)!;

  // Revoke the object URL when the picked file changes, or the browser keeps
  // every image this screen has ever previewed alive for the session.
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onPick = (f: File | null) => {
    setFile(f);
    setPoints([]);
    setError(null);
  };

  const run = async () => {
    if (!file) { setError("Choose a cleaned image first."); return; }
    if (approach === "SAM_POINTS" && points.length === 0) {
      setError("Click the surface you want on the image — SAM is prompted with positions, not words.");
      return;
    }
    setRunning(true);
    setError(null);

    const request: MaskLabRequest = { approach };
    if (approach === "GENERATIVE") {
      if (model.trim()) request.model = model.trim();
      request.scene = scene;
    } else if (approach === "CUSTOM_REPLICATE") {
      request.model = model.trim();
      request.inputTemplate = inputTemplate;
    } else if (approach === "SAM_POINTS") {
      request.points = points.map((p) => [p.x, p.y]);
      request.pointLabels = points.map((p) => (p.include ? 1 : 0));
    } else {
      request.tolerance = tolerance;
      request.minBlobShare = minBlobShare;
    }

    const form = new FormData();
    form.append("file", file);
    form.append("request", JSON.stringify(request));
    try {
      const res = await runAction(form);
      if (res.error || !res.result) {
        setError(res.error ?? "That run produced nothing.");
        return;
      }
      setRuns((prev) => [{ id: nextId.current++, request, result: res.result! }, ...prev]);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 24 }}>
      <section style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 320px", gap: 20, alignItems: "start" }}>
        <div>
          <h2 className="field-label" style={{ marginBottom: 8 }}>The photograph</h2>
          <label
            style={{
              display: "block", border: "1px dashed var(--line)", borderRadius: 6,
              padding: preview ? 0 : 40, textAlign: "center", cursor: "pointer",
              background: "var(--surface, transparent)", overflow: "hidden",
            }}
          >
            <input
              type="file"
              accept="image/*"
              onChange={(e) => onPick(e.target.files?.[0] ?? null)}
              style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
            />
            {preview ? (
              <PointPicker
                src={preview}
                active={approach === "SAM_POINTS"}
                points={points}
                onAdd={(p) => setPoints((prev) => [...prev, p])}
              />
            ) : (
              <span style={{ color: "var(--ink-soft)", font: "400 13px/1.6 var(--sans)" }}>
                Choose the <b>cleaned</b> image — the canvas the studio would paint.
                <br />A mask is only worth measuring against the image it will be used on.
              </span>
            )}
          </label>
          {preview && (
            <p style={{ marginTop: 8, font: "400 12px/1.5 var(--mono)", color: "var(--ink-soft)" }}>
              {file?.name} · {approach === "SAM_POINTS"
                ? `${points.length} point${points.length === 1 ? "" : "s"} — click to add, shift-click to exclude`
                : "click the image to replace it"}
              {points.length > 0 && (
                <>
                  {" · "}
                  <button
                    type="button"
                    onClick={() => setPoints([])}
                    style={{ background: "none", border: 0, padding: 0, cursor: "pointer",
                             color: "var(--accent-soft)", font: "inherit" }}
                  >
                    clear points
                  </button>
                </>
              )}
            </p>
          )}
        </div>

        <aside style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <h2 className="field-label" style={{ marginBottom: 8 }}>Approach</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {APPROACHES.map((a) => (
                <label
                  key={a.id}
                  style={{
                    display: "block", padding: "9px 11px", borderRadius: 4, cursor: "pointer",
                    border: `1px solid ${approach === a.id ? "var(--accent-soft)" : "var(--line)"}`,
                    background: approach === a.id ? "var(--surface-2, transparent)" : "transparent",
                  }}
                >
                  <input
                    type="radio"
                    name="approach"
                    checked={approach === a.id}
                    onChange={() => { setApproach(a.id); setError(null); }}
                    style={{ marginRight: 8 }}
                  />
                  <b style={{ font: "600 13px/1.4 var(--sans)" }}>{a.name}</b>
                  <span style={{ display: "block", font: "400 11.5px/1.5 var(--sans)",
                                 color: "var(--ink-soft)", marginTop: 3 }}>
                    {a.summary}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div style={{ borderLeft: "3px solid var(--line)", paddingLeft: 10 }}>
            <p style={{ font: "400 11.5px/1.5 var(--sans)", color: "var(--ink-soft)", margin: 0 }}>
              <b>What it cannot do:</b> {spec.limit}
            </p>
            <p style={{ font: "400 11px/1.5 var(--mono)", color: "var(--ink-soft)", margin: "6px 0 0" }}>
              {spec.cost}
            </p>
          </div>

          {approach === "GENERATIVE" && (
            <>
              <div className="field">
                <label className="field-label" htmlFor="ml-model">Model (blank = configured)</label>
                <input id="ml-model" type="text" value={model} placeholder="google/nano-banana-pro"
                       onChange={(e) => setModel(e.target.value)} style={{ width: "100%" }} />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="ml-scene">Scene</label>
                <select id="ml-scene" value={scene} style={{ width: "100%" }}
                        onChange={(e) => setScene(e.target.value as "INDOOR" | "OUTDOOR")}>
                  <option value="OUTDOOR">Exterior — no accent forced</option>
                  <option value="INDOOR">Interior — forces an accent surface</option>
                </select>
              </div>
            </>
          )}

          {approach === "PAINTED_SURFACE" && (
            <>
              <div className="field">
                <label className="field-label" htmlFor="ml-tol">
                  Tolerance <span style={{ font: "400 11px/1 var(--mono)" }}>{tolerance}</span>
                </label>
                <input id="ml-tol" type="range" min={4} max={160} value={tolerance}
                       onChange={(e) => setTolerance(Number(e.target.value))} style={{ width: "100%" }} />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="ml-blob">
                  Drop blobs under <span style={{ font: "400 11px/1 var(--mono)" }}>
                    {(minBlobShare * 100).toFixed(2)}% of frame
                  </span>
                </label>
                <input id="ml-blob" type="range" min={0} max={200} value={Math.round(minBlobShare * 10000)}
                       onChange={(e) => setMinBlobShare(Number(e.target.value) / 10000)}
                       style={{ width: "100%" }} />
              </div>
              <p style={{ font: "400 11.5px/1.5 var(--sans)", color: "var(--ink-soft)", margin: 0 }}>
                Tolerance is wide by default because the clean keeps each surface&rsquo;s light and
                shade — a white wall runs from highlight to deep shadow, and only its lack of colour
                is constant.
              </p>
            </>
          )}

          {approach === "CUSTOM_REPLICATE" && (
            <>
              <div className="field">
                <label className="field-label" htmlFor="ml-custom-model">Model (owner/name)</label>
                <input id="ml-custom-model" type="text" value={model} placeholder="owner/model-name"
                       onChange={(e) => setModel(e.target.value)} style={{ width: "100%" }} />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="ml-template">
                  Input body — <span className="mono">{"{{image}}"}</span> is replaced with the URL
                </label>
                <textarea id="ml-template" value={inputTemplate} rows={7}
                          onChange={(e) => setInputTemplate(e.target.value)}
                          spellCheck={false}
                          style={{ width: "100%", font: "400 11.5px/1.5 var(--mono)" }} />
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {TEMPLATE_PRESETS.map((t) => (
                  <Button key={t.label} type="button" variant="ghost"
                          onClick={() => { setInputTemplate(t.body); if (t.model) setModel(t.model); }}>
                    {t.label}
                  </Button>
                ))}
              </div>
              <p style={{ font: "400 11.5px/1.5 var(--sans)", color: "var(--ink-soft)", margin: 0 }}>
                The presets are shapes, not working calls — no model name is filled in, because
                Replicate&rsquo;s catalogue moves and a name that was right last month 404s today.
                Find the model, copy its input keys off its own page.
              </p>
            </>
          )}

          <Button type="button" onClick={() => void run()} disabled={running || !file}>
            {running ? "Running…" : "Run this approach"}
          </Button>
          {error && (
            <p role="alert" style={{ color: "var(--danger, #ff6459)", font: "400 12px/1.5 var(--sans)", margin: 0 }}>
              {error}
            </p>
          )}
          {running && (
            <p style={{ display: "flex", alignItems: "center", gap: 8, font: "400 12px/1.5 var(--sans)",
                        color: "var(--ink-soft)", margin: 0 }}>
              <Spinner /> Waiting on the model — up to 60s.
            </p>
          )}
        </aside>
      </section>

      {runs.length > 0 && (
        <section>
          <h2 className="field-label" style={{ marginBottom: 10 }}>
            Runs · newest first — the comparison is the point
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
            {runs.map((r) => (
              <RunCard key={r.id} run={r} onDrop={() => setRuns((prev) => prev.filter((x) => x.id !== r.id))} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

/** The uploaded image, with SAM's points on it when that approach is selected.
 *  Points are stored normalised so they survive the preview being a different
 *  size from the image the backend sends to the model. */
function PointPicker({
  src, active, points, onAdd,
}: {
  src: string;
  active: boolean;
  points: Array<{ x: number; y: number; include: boolean }>;
  onAdd: (p: { x: number; y: number; include: boolean }) => void;
}) {
  return (
    <span
      style={{ position: "relative", display: "block", cursor: active ? "crosshair" : "pointer" }}
      onClick={(e) => {
        if (!active) return;
        e.preventDefault();
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        onAdd({
          x: (e.clientX - rect.left) / rect.width,
          y: (e.clientY - rect.top) / rect.height,
          include: !e.shiftKey,
        });
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" style={{ display: "block", width: "100%" }} />
      {points.map((p, i) => (
        <span
          key={i}
          style={{
            position: "absolute", left: `${p.x * 100}%`, top: `${p.y * 100}%`,
            width: 14, height: 14, marginLeft: -7, marginTop: -7, borderRadius: "50%",
            background: p.include ? "#ffd166" : "#ff6459",
            boxShadow: "0 0 0 2px rgba(255,255,255,0.9)",
          }}
        />
      ))}
    </span>
  );
}

/** One run: what it produced, over the photo it produced it from. */
function RunCard({ run, onDrop }: { run: Run; onDrop: () => void }) {
  const { result } = run;
  const [index, setIndex] = useState(0);
  const [opacity, setOpacity] = useState(0.55);
  const output = result.outputs[index];

  return (
    <article style={{ border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden" }}>
      <header style={{ padding: "9px 11px", borderBottom: "1px solid var(--line)",
                       display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <b style={{ font: "600 13px/1.3 var(--sans)" }}>
          {APPROACHES.find((a) => a.id === result.approach)?.name ?? result.approach}
        </b>
        <span style={{ font: "400 11px/1.3 var(--mono)", color: "var(--ink-soft)" }}>
          {result.ms} ms{result.model ? ` · ${result.model}` : ""}
        </span>
        <button type="button" onClick={onDrop} title="Remove this run"
                style={{ marginLeft: "auto", background: "none", border: 0, cursor: "pointer",
                         color: "var(--ink-soft)", font: "400 11px/1 var(--mono)" }}>
          remove
        </button>
      </header>

      {output && <Composite canvasUrl={result.canvasUrl} output={output} opacity={opacity} />}

      <div style={{ padding: "9px 11px", display: "flex", flexDirection: "column", gap: 8 }}>
        {result.outputs.length > 1 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {result.outputs.map((o, i) => (
              <button
                key={o.url}
                type="button"
                onClick={() => setIndex(i)}
                style={{
                  font: "400 11px/1 var(--mono)", padding: "4px 8px", borderRadius: 3, cursor: "pointer",
                  border: `1px solid ${i === index ? "var(--accent-soft)" : "var(--line)"}`,
                  background: "transparent", color: "var(--ink-soft)",
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
        <input type="range" min={0} max={100} value={Math.round(opacity * 100)}
               onChange={(e) => setOpacity(Number(e.target.value) / 100)}
               aria-label="Overlay opacity" style={{ width: "100%" }} />
        {result.note && (
          <p style={{ font: "400 11.5px/1.5 var(--sans)", color: "var(--ink-soft)", margin: 0 }}>
            {result.note}
          </p>
        )}
        <p style={{ font: "400 11px/1.4 var(--mono)", color: "var(--ink-soft)", margin: 0 }}>
          <a href={output?.url} target="_blank" rel="noreferrer"
             style={{ color: "var(--accent-soft)" }}>open the raw output ↗</a>
        </p>
      </div>
    </article>
  );
}

/**
 * Draws one output over the photograph it came from.
 *
 * <p>A colour-coded image is split by the SAME rule the backend splits it with,
 * so what is tinted here is what would be stored. A binary mask is one surface
 * and gets one colour. A raw output from an unknown model is shown straight —
 * the lab cannot invent a reading for a schema it has never seen, and pretending
 * to would be worse than showing the pixels.
 */
function Composite({
  canvasUrl, output, opacity,
}: {
  canvasUrl: string;
  output: { url: string; kind: "COLOUR_CODED" | "BINARY" | "RAW" };
  opacity: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  const draw = useCallback(async () => {
    const canvas = ref.current;
    if (!canvas) return;
    setFailed(false);
    try {
      const [base, mask] = await Promise.all([load(canvasUrl), load(output.url)]);
      const k = Math.min(1, PREVIEW_DIM / Math.max(base.naturalWidth, base.naturalHeight));
      const W = Math.max(1, Math.round(base.naturalWidth * k));
      const H = Math.max(1, Math.round(base.naturalHeight * k));
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(base, 0, 0, W, H);

      if (output.kind === "RAW") {
        ctx.globalAlpha = opacity;
        ctx.drawImage(mask, 0, 0, W, H);
        ctx.globalAlpha = 1;
        return;
      }

      // Read the mask at its own size, nearest-neighbour — a smooth downsample of
      // a colour-block image invents mixed colours on every border, which is
      // exactly what classify() would then read wrong.
      const off = document.createElement("canvas");
      off.width = mask.naturalWidth; off.height = mask.naturalHeight;
      const octx = off.getContext("2d", { willReadFrequently: true });
      if (!octx) return;
      octx.imageSmoothingEnabled = false;
      octx.drawImage(mask, 0, 0);
      const mp = octx.getImageData(0, 0, off.width, off.height).data;

      const img = ctx.getImageData(0, 0, W, H);
      const d = img.data;
      for (let y = 0; y < H; y++) {
        const sy = Math.min(off.height - 1, Math.floor((y / H) * off.height));
        for (let x = 0; x < W; x++) {
          const sx = Math.min(off.width - 1, Math.floor((x / W) * off.width));
          const so = (sy * off.width + sx) * 4;
          const r = mp[so]!, g = mp[so + 1]!, b = mp[so + 2]!;
          let tint: [number, number, number] | null = null;
          if (output.kind === "BINARY") {
            if ((r + g + b) / 3 > 127) tint = BINARY_RGB;
          } else {
            const cat = classify(r, g, b);
            if (cat !== NONE) {
              const found = CATS.find((c) => c.id === cat);
              if (found) tint = found.rgb as [number, number, number];
            }
          }
          if (!tint) continue;
          const o = (y * W + x) * 4;
          d[o] = d[o]! + (tint[0] - d[o]!) * opacity;
          d[o + 1] = d[o + 1]! + (tint[1] - d[o + 1]!) * opacity;
          d[o + 2] = d[o + 2]! + (tint[2] - d[o + 2]!) * opacity;
        }
      }
      ctx.putImageData(img, 0, 0);
    } catch {
      setFailed(true);
    }
  }, [canvasUrl, output.url, output.kind, opacity]);

  useEffect(() => { void draw(); }, [draw]);

  return (
    <div style={{ background: "#101418" }}>
      <canvas ref={ref} style={{ width: "100%", display: "block" }} />
      {failed && (
        <p style={{ padding: "8px 11px", margin: 0, font: "400 11.5px/1.5 var(--sans)", color: "var(--ink-soft)" }}>
          The output could not be read into a canvas — often a cross-origin delivery URL. Open it
          in a tab instead.
        </p>
      )}
    </div>
  );
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("could not load " + src));
    img.src = src;
  });
}
