"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button, LinkButton } from "@/components/ui/button";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { Spinner } from "@/components/ui/spinner";
import { api, HttpError } from "@/lib/api";
import { Canvas2DRecolor } from "@/lib/canvas2d-recolor";
import { downloadBlob } from "@/lib/download-blob";
import { resolveMediaUrl } from "@/lib/media";
import { formatRupees } from "@/lib/money";
import { buyAiCredits } from "@/lib/payments";
import {
  buildAiImagePdf,
  buildColourBoardPdf,
  canvasToJpegDataUrl,
  imageUrlToJpegDataUrl,
  type PdfImageEntry,
} from "@/lib/pdf-export";
import { printableShades as toPrintableShades } from "@/lib/printable-shades";
import {
  BORDER_LABELS,
  describeRender,
  FURNISHING_LABELS,
  LIGHTING_LABELS,
  STYLE_LABELS,
  TIME_OF_DAY_LABELS,
} from "@/lib/render-labels";
import { codesAreUniversal, type ShadeCodeScheme } from "@/lib/shade-codes";
import type {
  AiCreditSummary,
  ProjectCombo,
  ProjectDetail,
  ProjectRender,
  RegionDetail,
  RenderOptions,
} from "@/lib/types";

/**
 * The last page of a project: pick one of the combinations you were handed on a colour
 * board, choose how it should be photographed, and get one real image of it.
 *
 * Two decisions shape this screen.
 *
 * **The combinations are fixed.** They are the pages of the boards the customer already
 * took away — not a fresh palette picker. That is the whole reason the render is
 * trustworthy: it shows a scheme they committed to on paper, in the exact catalogue
 * shades, rather than a forty-first idea invented after the job closed.
 *
 * **One preview at a time, not eight.** The obvious build renders all eight combos as
 * thumbnails, and it is the wrong one: each render needs every region mask, so eight
 * previews is eight canvases and the mask set fetched over and over. Instead the cards
 * carry their colour chips — enough to recognise a scheme you chose an hour ago — and the
 * selected one is painted at full size into a single canvas, with the masks loaded once
 * and reused as the selection moves. One engine, one mask fetch, a bigger picture.
 *
 * **Who pays, and what the button says.** A room the account paid for itself includes one
 * image. A room a SHOP gave a customer includes none — the shop bought the room, not the
 * model call at the end of it — so the first image there is bought with an AI credit, as is
 * every image past the included one on any room. The server decides all of that; this
 * screen only has to name it honestly before the click, which is why the wallet is read
 * alongside the project rather than after a 402 comes back.
 */

const POLL_INTERVAL_MS = 2500;
/**
 * How long this screen waits for an answer before telling the customer to come back.
 *
 * <p>A render normally lands well inside the first minute, and for a long time three
 * minutes was a generous ceiling on that. It stopped being one when the server started
 * retrying a busy model instead of failing the render: Replicate answers a model with no
 * capacity by failing the prediction outright, and the server now asks again with a
 * growing wait, then tries the next model, inside a budget of eight minutes.
 *
 * <p>So this has to outlast that budget rather than the happy path. At three minutes the
 * screen gave up on renders that were still being retried and would have arrived — the
 * customer was told to reload for an image that was already on its way, which reads as a
 * failure and is the exact experience the retries were added to remove. Kept comfortably
 * past the server's ceiling so the outcome, either way, is shown on the screen that asked
 * for it. Change it with `replicate.predictions.total-budget-ms`, not on its own.
 */
const POLL_DEADLINE_MS = 570_000;
/**
 * When the waiting copy stops promising a minute.
 *
 * <p>Ninety seconds rather than sixty: a render that is merely a little slow should not
 * be announced as a problem, and the first retry cannot have finished before this anyway.
 */
const SLOW_AFTER_MS = 90_000;

const DEFAULT_OPTIONS: RenderOptions = {
  timeOfDay: "DAY",
  borderMode: "KEEP_ORIGINAL",
  lighting: "NATURAL",
  furnishing: "KEEP",
  style: "MODERN",
};

type Choice<T extends string> = { value: T; label: string; hint: string };

// The labels come from `render-labels`, which is also what the /ai-images shelf prints
// with. Only the hints live here: they are prose about CHOOSING, which is a thing this
// screen does and the shelf does not. Keeping the names in one place is what stops the
// same picture being captioned "Modern" on one document and something else on another.
const TIME_OF_DAY: Choice<RenderOptions["timeOfDay"]>[] = [
  { value: "DAY", label: TIME_OF_DAY_LABELS.DAY, hint: "Natural daylight, as the photo was taken" },
  { value: "NIGHT", label: TIME_OF_DAY_LABELS.NIGHT, hint: "After dark, lit by the lights that are there" },
];

const BORDERS: Choice<RenderOptions["borderMode"]>[] = [
  {
    value: "KEEP_ORIGINAL",
    label: BORDER_LABELS.KEEP_ORIGINAL,
    hint: "Paint stays exactly inside the walls and trim as they are marked",
  },
  {
    value: "AI_SUGGESTED",
    label: BORDER_LABELS.AI_SUGGESTED,
    hint: "Let the AI propose the trim and banding, in these same colours",
  },
];

const LIGHTING: Choice<RenderOptions["lighting"]>[] = [
  { value: "NATURAL", label: LIGHTING_LABELS.NATURAL, hint: "The light that is already in the room" },
  { value: "WARM", label: LIGHTING_LABELS.WARM, hint: "Golden, softer — an evening feel" },
  { value: "COOL", label: LIGHTING_LABELS.COOL, hint: "Crisp daylight, clean shadows" },
  { value: "DRAMATIC", label: LIGHTING_LABELS.DRAMATIC, hint: "Strong light and deep shadow" },
];

const FURNISHING: Choice<RenderOptions["furnishing"]>[] = [
  { value: "KEEP", label: FURNISHING_LABELS.KEEP, hint: "Nothing moves — only the paint changes" },
  { value: "STAGED", label: FURNISHING_LABELS.STAGED, hint: "Dressed to suit the colours" },
  { value: "EMPTY", label: FURNISHING_LABELS.EMPTY, hint: "Cleared, so the walls are fully visible" },
];

const STYLE: Choice<RenderOptions["style"]>[] = [
  { value: "MODERN", label: STYLE_LABELS.MODERN, hint: "Contemporary and clean" },
  { value: "MINIMAL", label: STYLE_LABELS.MINIMAL, hint: "Quiet and restrained" },
  { value: "TRADITIONAL", label: STYLE_LABELS.TRADITIONAL, hint: "Classic and settled" },
  { value: "HERITAGE", label: STYLE_LABELS.HERITAGE, hint: "An older building, well kept" },
  { value: "LUXE", label: STYLE_LABELS.LUXE, hint: "Richer materials, deeper finishes" },
];

function comboName(combo: ProjectCombo, index: number): string {
  return combo.title?.trim() || `Combination ${index + 1}`;
}

export function RenderStudio({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [combos, setCombos] = useState<ProjectCombo[]>([]);
  const [renders, setRenders] = useState<ProjectRender[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [options, setOptions] = useState<RenderOptions>(DEFAULT_OPTIONS);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [active, setActive] = useState<ProjectRender | null>(null);
  const [buying, setBuying] = useState(false);
  /** The AI wallet. Null while loading, and for an account that cannot hold credits. */
  const [wallet, setWallet] = useState<AiCreditSummary | null>(null);
  /**
   * The shop's customer-facing code pattern, needed only to reprint the colour board.
   *
   * A board carries codes that have to be readable back at a counter, and which counter
   * depends on the scheme — so a sheet built here has to follow exactly the same rules
   * the studio's did. Null means the fetch has not landed (or the account has no shop),
   * and the safe reading of null is "hide the manufacturer's codes", the same way the
   * studio treats it.
   */
  const [codeScheme, setCodeScheme] = useState<ShadeCodeScheme | null>(null);
  /** True while the colour board is being rebuilt for download. */
  const [boardBusy, setBoardBusy] = useState(false);
  /**
   * Whether this wait has already outlasted the minute the copy promises.
   *
   * <p>Worth a state of its own because the promise is the thing that breaks first. Almost
   * every render lands inside a minute, so "this takes about a minute" is honest almost
   * always — but when the model is out of capacity the server now retries it rather than
   * failing, and the wait stretches to several. Leaving the same sentence on screen for
   * six of them turns a working render into an app that looks stuck.
   */
  const [slow, setSlow] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Canvas2DRecolor | null>(null);
  /** Masks keyed by region id, loaded once and reused as the selection moves. */
  const maskCache = useRef(new Map<number, HTMLImageElement>());

  // The same condition the overlay uses, computed up here because hooks cannot live
  // below the early return that the loading state makes.
  const waiting =
    generating || active?.status === "QUEUED" || active?.status === "RUNNING";

  useEffect(() => {
    if (!waiting) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [waiting]);

  // ── Load the project, its combinations and anything already rendered ──────

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [detail, comboList, renderList, credits, scheme] = await Promise.all([
          api.getProject(projectId),
          api.getProjectCombos(projectId),
          api.listRenders(projectId),
          // Fetched here rather than after a refusal, so the button can say what this
          // image will cost BEFORE it is pressed. A 403 (an account that cannot hold
          // credits) is normal and leaves the wallet null.
          api.getAiCredits().catch(() => null),
          // Only used when the board is reprinted. Failing is normal — a customer
          // account has no shop of its own — and null is the cautious answer anyway.
          api.getMyShadeCodeScheme().catch(() => null),
        ]);
        if (cancelled) return;
        setProject(detail);
        setCombos(comboList);
        setRenders(renderList);
        setWallet(credits);
        setCodeScheme(scheme);
        setSelected(comboList[0]?.id ?? null);
        // A render still in flight from a previous visit is picked back up rather
        // than left to finish invisibly — the customer closed the tab, not the job.
        const inFlight = renderList.find((r) => r.status === "QUEUED" || r.status === "RUNNING");
        if (inFlight) {
          setActive(inFlight);
          setGenerating(true);
        } else {
          setActive(renderList.find((r) => r.status === "READY") ?? null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load this project.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // ── The preview: one combination painted onto the cleaned photo ───────────

  const regionsById = useMemo(() => {
    const map = new Map<number, RegionDetail>();
    for (const r of project?.regions ?? []) map.set(r.id, r);
    return map;
  }, [project]);

  const selectedCombo = useMemo(
    () => combos.find((c) => c.id === selected) ?? null,
    [combos, selected],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const photo = resolveMediaUrl(project?.cleanedImageUrl || project?.imageUrl);
    if (!canvas || !photo || !selectedCombo) return;

    let cancelled = false;
    (async () => {
      try {
        let engine = engineRef.current;
        if (!engine) {
          engine = new Canvas2DRecolor(canvas);
          engineRef.current = engine;
          engine.setImage(await loadImage(photo));
        }
        if (cancelled) return;

        const paints = [];
        for (const shade of selectedCombo.shades) {
          const region = shade.regionId != null ? regionsById.get(shade.regionId) : undefined;
          const maskUrl = resolveMediaUrl(region?.maskUrl);
          if (!region || !maskUrl) continue;
          let mask = maskCache.current.get(region.id);
          if (!mask) {
            try {
              mask = await loadImage(maskUrl);
              maskCache.current.set(region.id, mask);
            } catch {
              continue;
            }
          }
          if (cancelled) return;
          paints.push({ mask, target: hexToRgb01(shade.hex), preserve: 0.85, anchor: true });
        }
        if (cancelled) return;
        engine.renderRegions(paints);
      } catch {
        /* The preview is a convenience — a failed one must not block generating. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedCombo, project, regionsById]);

  useEffect(() => () => engineRef.current?.dispose(), []);

  // ── Generating, and waiting for it ───────────────────────────────────────

  const poll = useCallback(
    async (renderId: string) => {
      const deadline = Date.now() + POLL_DEADLINE_MS;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        let latest: ProjectRender;
        try {
          latest = await api.getRender(projectId, renderId);
        } catch {
          continue; // a dropped poll is not a failed render
        }
        setActive(latest);
        if (latest.status === "READY" || latest.status === "FAILED") {
          setRenders((prev) => [latest, ...prev.filter((r) => r.id !== latest.id)]);
          // Something moved either way — spent on success, handed back on failure — and
          // which of the two pockets it was is the server's business, not this screen's.
          // So both are re-read rather than guessed at.
          void api.getProject(projectId).then(setProject).catch(() => {});
          void api.getAiCredits().then(setWallet).catch(() => {});
          return;
        }
      }
      setError("Your image is taking longer than expected. It may still arrive — reload in a minute.");
    },
    [projectId],
  );

  const generate = useCallback(async () => {
    if (!selected || generating) return;
    setGenerating(true);
    setError(null);
    try {
      const started = await api.requestRender(projectId, {
        comboId: selected,
        ...options,
        note: note.trim() || undefined,
      });
      setActive(started);
      await poll(started.id);
    } catch (e) {
      if (e instanceof HttpError && e.status === 402) {
        setError(e.message);
      } else {
        setError(e instanceof Error ? e.message : "Could not start your image.");
      }
    } finally {
      setGenerating(false);
    }
  }, [selected, generating, projectId, options, note, poll]);

  /**
   * How a combination's shades are printed, under this shop's own rules.
   *
   * The rules themselves live in `printable-shades`, shared with the studio's own board
   * and with the /ai-images shelf — a sheet built on any of the three has to be
   * indistinguishable from the others, and a board that suddenly printed "Asian Paints
   * Ivory Mist 7112" because it was reprinted from a different screen would undo the
   * shop's whole numbering in the one artefact the customer keeps.
   */
  const printableShades = useCallback(
    (combo: ProjectCombo | null | undefined) => toPrintableShades(codeScheme, combo?.shades),
    [codeScheme],
  );

  /**
   * Reprint the colour board with the finished AI image on the end of it.
   *
   * The project handed over ONE board, and it was downloaded in the studio before this
   * image existed — so without this the customer's sheet and their picture are two
   * things that never meet, and the picture is the half that ends up lost in a downloads
   * folder. Reprinting is free and charges nothing: the board was already paid for and
   * already recorded, and this rebuilds the very same combinations from the server's own
   * record of them. Nothing here calls `recordColourBoard`, which is the only thing that
   * spends a download.
   *
   * The pictures are re-rendered rather than remembered. The studio's snapshots were
   * canvas pixels that died with that page, but every combination is stored as shades
   * against regions, and this screen already paints one of them for the preview — so the
   * same engine walks all of them through an off-screen canvas. Off-screen because the
   * visible one is showing the customer's image, and flickering the whole board through
   * it would look like a fault.
   */
  const downloadBoardWithImage = useCallback(async () => {
    const image = active?.status === "READY" ? active : null;
    if (!image || boardBusy) return;
    setBoardBusy(true);
    setError(null);
    try {
      const photo = resolveMediaUrl(project?.cleanedImageUrl || project?.imageUrl);
      const entries: PdfImageEntry[] = [];
      if (photo) {
        const surface = document.createElement("canvas");
        const engine = new Canvas2DRecolor(surface);
        try {
          engine.setImage(await loadImage(photo));
          for (const combo of combos) {
            const paints = [];
            for (const shade of combo.shades) {
              const region = shade.regionId != null ? regionsById.get(shade.regionId) : undefined;
              const maskUrl = resolveMediaUrl(region?.maskUrl);
              if (!region || !maskUrl) continue;
              let mask = maskCache.current.get(region.id);
              if (!mask) {
                try {
                  mask = await loadImage(maskUrl);
                  maskCache.current.set(region.id, mask);
                } catch {
                  continue;
                }
              }
              paints.push({ mask, target: hexToRgb01(shade.hex), preserve: 0.85, anchor: true });
            }
            // A combination whose regions have all been deleted cannot be repainted.
            // Skipping it beats printing the bare photograph as if it were an option.
            if (paints.length === 0) continue;
            engine.renderRegions(paints);
            const jpeg = canvasToJpegDataUrl(surface, 1500, 0.85);
            if (jpeg) entries.push({ jpegDataUrl: jpeg, shades: printableShades(combo) });
          }
        } finally {
          engine.dispose();
        }
      }

      const aiJpeg = await imageUrlToJpegDataUrl(resolveMediaUrl(image.imageUrl) ?? "");
      const renderedCombo = combos.find((c) => c.id === image.comboId) ?? null;
      const blob = buildColourBoardPdf(
        entries,
        project?.name || "HueVista colour board",
        codesAreUniversal(codeScheme),
        aiJpeg
          ? {
              jpegDataUrl: aiJpeg,
              shades: printableShades(renderedCombo),
              caption: describeRender(image),
            }
          : null,
      );
      downloadBlob(blob, `huevista-colours-${Date.now()}.pdf`);
    } catch {
      setError(
        "Could not rebuild the colour board on this device. Your image is still yours to "
        + "download on its own.",
      );
    } finally {
      setBoardBusy(false);
    }
  }, [active, boardBusy, project, combos, regionsById, codeScheme, printableShades]);

  /**
   * The image on a sheet of its own — picture, shades, codes, and nothing else.
   *
   * Offered beside the full board rather than instead of it, because the two answer
   * different moments. The board is for finishing a job at the counter: everything on one
   * document. This is for afterwards — sending the picture to a painter or a spouse, where
   * five pages of options that were already chosen between are noise. Handing over the raw
   * JPEG instead is the third option and it is the worst one: it loses the shade table,
   * and nobody can buy paint from a photograph of a room.
   *
   * <p>Cheap next to the board reprint: no combination is repainted, so there is no
   * off-screen canvas and no mask fetch — only the finished image is re-encoded.
   */
  const downloadImagePdf = useCallback(async () => {
    const image = active?.status === "READY" ? active : null;
    if (!image || boardBusy) return;
    setBoardBusy(true);
    setError(null);
    try {
      const jpeg = await imageUrlToJpegDataUrl(resolveMediaUrl(image.imageUrl) ?? "");
      if (!jpeg) {
        setError(
          "Could not read your image on this device, so the PDF would have been empty. "
          + "The image itself still downloads.",
        );
        return;
      }
      const blob = buildAiImagePdf(
        {
          jpegDataUrl: jpeg,
          shades: printableShades(combos.find((c) => c.id === image.comboId) ?? null),
          caption: describeRender(image),
        },
        project?.name || "HueVista AI image",
        codesAreUniversal(codeScheme),
      );
      downloadBlob(blob, `huevista-ai-image-${Date.now()}.pdf`);
    } catch {
      setError("Could not build the PDF on this device. Your image still downloads on its own.");
    } finally {
      setBoardBusy(false);
    }
  }, [active, boardBusy, combos, project, codeScheme, printableShades]);

  /**
   * Top up the wallet, then clear the finished image so the options are back on screen.
   *
   * Buys ONE credit, because that is what somebody standing on this screen wants — the
   * picture in front of them. Larger top-ups live on the plan page, where a shop stocking
   * up belongs; putting a quantity picker in the way of one image would be a form between
   * a customer and the thing they came for.
   */
  const topUp = useCallback(async () => {
    setBuying(true);
    setError(null);
    try {
      const fresh = await buyAiCredits(credits(wallet));
      // null = Checkout was closed. Not an error, and nothing to report.
      if (fresh) {
        setWallet(fresh);
        setActive(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the payment.");
    } finally {
      setBuying(false);
    }
  }, [wallet]);

  // ── Rendering ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="hv-render-loading">
        <Spinner /> <span>Opening your colour boards…</span>
      </div>
    );
  }

  if (combos.length === 0) {
    return (
      <div className="hv-render-empty">
        <Eyebrow>Your AI image</Eyebrow>
        <h1 className="display">No colour boards yet</h1>
        <Lead>
          The AI image is made from a combination on one of your colour boards, so there has
          to be a board first. Go back, choose your colours and download one.
        </Lead>
        <LinkButton href={`/studio?project=${encodeURIComponent(projectId)}`} variant="brass">
          Back to the studio <span className="arr">→</span>
        </LinkButton>
      </div>
    );
  }

  // What this project still includes, and what the wallet can cover once it doesn't.
  // A shop-granted room starts at zero included, so for those the wallet is the whole
  // answer from the first image onwards.
  const rendersLeft = (project?.rendersAllowed ?? 0) - (project?.rendersUsed ?? 0);
  const cost = credits(wallet);
  const creditsLeft = wallet?.balance ?? 0;
  /** Can the button actually make an image right now, on either pocket? */
  const canGenerate = rendersLeft > 0 || creditsLeft >= cost;
  const busy = waiting;
  const ready = active?.status === "READY" ? active : null;

  return (
    <div className="hv-render">
      <header className="hv-render-head">
        {/* No longer "Project closed" — an AI image is paid for with a credit and can be
            made whenever, so announcing a state the customer may not be in was wrong. */}
        <Eyebrow>Your AI image</Eyebrow>
        <h1 className="display">
          Pick the one you want to <i>see for real.</i>
        </h1>
        <Lead>
          {combos.length === 1
            ? "This is the combination from your colour board."
            : `These are the ${combos.length} combinations from your colour board.`}{" "}
          Choose one and we&apos;ll photograph your room in it — the same shades, in real
          light.
        </Lead>
      </header>

      <section className="hv-render-body">
        <div className="hv-render-combos" role="radiogroup" aria-label="Your colour combinations">
          {combos.map((combo, i) => (
            <button
              key={combo.id}
              type="button"
              role="radio"
              aria-checked={combo.id === selected}
              className={`hv-render-combo${combo.id === selected ? " is-selected" : ""}`}
              onClick={() => setSelected(combo.id)}
              disabled={busy}
            >
              <span className="hv-render-combo-chips" aria-hidden>
                {combo.shades.map((s, j) => (
                  <span key={j} style={{ background: s.hex }} />
                ))}
              </span>
              <span className="hv-render-combo-name">{comboName(combo, i)}</span>
              <span className="hv-render-combo-meta">
                Board {combo.boardIndex}
                {combo.rendered ? " · already made" : ""}
              </span>
            </button>
          ))}
        </div>

        <div className="hv-render-stage">
          {ready ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={resolveMediaUrl(ready.imageUrl) ?? ""} alt="Your room, rendered" />
          ) : (
            <canvas ref={canvasRef} />
          )}
          {busy && (
            <div className="hv-render-working" role="status">
              <Spinner />
              <p>{slow ? "Still photographing your room…" : "Photographing your room…"}</p>
              <p className="hv-render-working-sub">
                {slow
                  ? "The AI is busy right now, so this one is taking longer than usual — "
                    + "we're still trying. You can leave this page; it will be here when "
                    + "you come back."
                  : "This takes about a minute. You can leave this page — it will be here "
                    + "when you come back."}
              </p>
            </div>
          )}
          {!ready && !busy && (
            <p className="hv-render-stage-note">
              A preview of the shades. The AI image will be a photograph of this room.
            </p>
          )}
        </div>
      </section>

      {ready ? (
        <section className="hv-render-done">
          <p className="hv-render-done-text">Your image is ready.</p>
          {/* The board and the picture belong on one sheet — see downloadBoardWithImage.
              Offered beside the plain image download rather than instead of it, because
              somebody who only wants the picture should not have to take a PDF. */}
          <p className="hv-render-done-sub">
            Take it on its own, on a one-page PDF with the shades printed underneath, or on
            your whole colour board with this image as the last page. All three cost
            nothing — the board was already paid for.
          </p>
          <div className="hv-render-done-actions">
            <a className="btn btn-brass" href={resolveMediaUrl(ready.imageUrl) ?? "#"} download>
              Download the image
            </a>
            <Button variant="ghost" disabled={boardBusy} onClick={() => void downloadImagePdf()}>
              {boardBusy ? "Building your PDF…" : "This image as a PDF"}
            </Button>
            <Button variant="ghost" disabled={boardBusy} onClick={() => void downloadBoardWithImage()}>
              {boardBusy ? "Building your PDF…" : "Colour board PDF · with this image"}
            </Button>
            {canGenerate ? (
              <Button variant="ghost" onClick={() => setActive(null)}>
                Make another{creditsLeft >= cost && rendersLeft <= 0 ? ` · ${cost} credit` : ""}
              </Button>
            ) : (
              <Button variant="ghost" disabled={buying} onClick={() => void topUp()}>
                {buying ? "Opening checkout…" : buyCreditLabel(wallet)}
              </Button>
            )}
            {/* Where this picture will be tomorrow. Said here rather than left to be
                discovered, because the moment somebody has just made one is the moment
                they wonder whether they have to keep it themselves. */}
            <Link className="btn btn-ghost" href="/ai-images">
              All my AI images
            </Link>
            <Link className="btn btn-ghost" href="/dashboard">
              Back to my rooms
            </Link>
          </div>
        </section>
      ) : (
        <section className="hv-render-options">
          <OptionRow label="Time of day" choices={TIME_OF_DAY} value={options.timeOfDay}
            onChange={(timeOfDay) => setOptions((o) => ({ ...o, timeOfDay }))} disabled={busy} />
          <OptionRow label="Borders and trim" choices={BORDERS} value={options.borderMode}
            onChange={(borderMode) => setOptions((o) => ({ ...o, borderMode }))} disabled={busy} />
          <OptionRow label="Light" choices={LIGHTING} value={options.lighting}
            onChange={(lighting) => setOptions((o) => ({ ...o, lighting }))} disabled={busy} />
          <OptionRow label="Furniture" choices={FURNISHING} value={options.furnishing}
            onChange={(furnishing) => setOptions((o) => ({ ...o, furnishing }))} disabled={busy} />
          <OptionRow label="Look" choices={STYLE} value={options.style}
            onChange={(style) => setOptions((o) => ({ ...o, style }))} disabled={busy} />

          <label className="hv-render-note">
            <span>Anything else? (optional)</span>
            <input
              type="text"
              maxLength={500}
              value={note}
              disabled={busy}
              placeholder="e.g. show it with the curtains open"
              onChange={(e) => setNote(e.target.value)}
            />
          </label>

          <div className="hv-render-go">
            {canGenerate ? (
              <Button variant="brass" disabled={busy || !selected} onClick={() => void generate()}>
                {busy
                  ? "Making your image…"
                  : rendersLeft > 0
                    ? "Make my image"
                    : `Make my image · ${cost} credit${cost === 1 ? "" : "s"}`}
              </Button>
            ) : (
              <Button variant="brass" disabled={buying} onClick={() => void topUp()}>
                {buying ? "Opening checkout…" : buyCreditLabel(wallet)}
              </Button>
            )}
            <span className="hv-render-left">{allowanceNote(rendersLeft, creditsLeft, cost)}</span>
          </div>
        </section>
      )}

      {/* Anything made earlier on this project. Only shown once there is more than one,
          because a strip with a single thumbnail of the picture already on screen is
          noise — but a customer who bought a second image wants both side by side. */}
      {renders.filter((r) => r.status === "READY").length > 1 && (
        <section className="hv-render-history">
          <h2 className="hv-render-history-title">Your images</h2>
          <div className="hv-render-history-strip">
            {renders
              .filter((r) => r.status === "READY")
              .map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`hv-render-history-item${r.id === active?.id ? " is-on" : ""}`}
                  onClick={() => setActive(r)}
                  aria-label={`Show the ${r.style.toLowerCase()} ${r.timeOfDay.toLowerCase()} image`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={resolveMediaUrl(r.imageUrl) ?? ""} alt="" />
                </button>
              ))}
          </div>
          <style>{`
            .hv-render-history { margin-top: 28px; }
            .hv-render-history-title { font: 500 14px/1.2 var(--sans); color: var(--fg); margin: 0 0 10px; }
            .hv-render-history-strip { display: flex; gap: 10px; flex-wrap: wrap; }
            .hv-render-history-item {
              width: 110px; padding: 0; cursor: pointer; background: none;
              border: 1px solid var(--rule); border-radius: 3px; overflow: hidden;
            }
            .hv-render-history-item.is-on { border-color: var(--brass); box-shadow: inset 0 0 0 1px var(--brass); }
            .hv-render-history-item img { display: block; width: 100%; height: auto; }
          `}</style>
        </section>
      )}

      {active?.status === "FAILED" && (
        <p className="hv-render-error" role="alert">
          {active.failureReason ?? "That didn't work. Please try again."}
        </p>
      )}
      {error && (
        <p className="hv-render-error" role="alert">
          {error}
        </p>
      )}

      <style>{`
        .hv-render { max-width: 1100px; margin: 0 auto; padding: 48px var(--gutter) 96px; }
        .hv-render-head { text-align: center; margin-bottom: 32px; }
        .hv-render-head .display { font-size: clamp(30px, 4vw, 48px); margin: 14px 0 12px; }
        .hv-render-body { display: grid; grid-template-columns: minmax(0, 300px) minmax(0, 1fr); gap: 24px; }
        @media (max-width: 860px) { .hv-render-body { grid-template-columns: 1fr; } }
        .hv-render-combos { display: grid; gap: 10px; align-content: start; }
        .hv-render-combo {
          display: grid; gap: 6px; padding: 12px 14px; text-align: left; cursor: pointer;
          border: 1px solid var(--rule); background: var(--surface); border-radius: 4px;
        }
        .hv-render-combo:disabled { opacity: .55; cursor: default; }
        .hv-render-combo.is-selected { border-color: var(--brass); box-shadow: inset 0 0 0 1px var(--brass); }
        .hv-render-combo-chips { display: inline-flex; gap: 4px; }
        .hv-render-combo-chips span { width: 26px; height: 18px; border: 1px solid var(--rule); border-radius: 2px; }
        .hv-render-combo-name { font: 500 15px/1.2 var(--sans); color: var(--fg); }
        .hv-render-combo-meta { font: 400 12px/1.2 var(--sans); color: var(--fg-soft); }
        .hv-render-stage {
          position: relative; min-height: 320px; display: grid; place-items: center;
          border: 1px solid var(--rule); background: var(--surface-soft); border-radius: 4px; padding: 12px;
        }
        .hv-render-stage canvas, .hv-render-stage img { max-width: 100%; height: auto; display: block; }
        .hv-render-stage-note { position: absolute; bottom: 8px; font: 400 12px/1.3 var(--sans); color: var(--fg-soft); }
        .hv-render-working {
          position: absolute; inset: 0; display: grid; place-content: center; gap: 8px; text-align: center;
          background: color-mix(in srgb, var(--surface) 88%, transparent); padding: 24px;
        }
        .hv-render-working-sub { font: 400 13px/1.4 var(--sans); color: var(--fg-soft); max-width: 34ch; }
        .hv-render-options { margin-top: 28px; display: grid; gap: 18px; }
        .hv-render-note { display: grid; gap: 6px; font: 400 13px/1.3 var(--sans); color: var(--fg-soft); }
        .hv-render-note input { padding: 10px 12px; border: 1px solid var(--rule); background: var(--surface); font: inherit; color: var(--fg); }
        .hv-render-go { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin-top: 6px; }
        .hv-render-left { font: 400 13px/1.4 var(--sans); color: var(--fg-soft); }
        .hv-render-done { margin-top: 28px; display: grid; gap: 12px; justify-items: start; }
        .hv-render-done-text { font: 500 16px/1.3 var(--sans); color: var(--fg); }
        .hv-render-done-sub { font: 400 13px/1.5 var(--sans); color: var(--fg-soft); margin: 0; max-width: 52ch; }
        .hv-render-done-actions { display: flex; flex-wrap: wrap; gap: 12px; }
        .hv-render-error { margin-top: 16px; font: 400 14px/1.4 var(--sans); color: var(--danger, #b3261e); }
        .hv-render-loading, .hv-render-empty {
          max-width: 640px; margin: 0 auto; padding: 96px var(--gutter); text-align: center;
          display: grid; gap: 16px; justify-items: center;
        }
      `}</style>
    </div>
  );
}

function OptionRow<T extends string>({
  label,
  choices,
  value,
  onChange,
  disabled,
}: {
  label: string;
  choices: Choice<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="hv-render-row" role="radiogroup" aria-label={label}>
      <span className="hv-render-row-label">{label}</span>
      <span className="hv-render-row-choices">
        {choices.map((c) => (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={c.value === value}
            title={c.hint}
            disabled={disabled}
            className={`hv-render-choice${c.value === value ? " is-on" : ""}`}
            onClick={() => onChange(c.value)}
          >
            {c.label}
          </button>
        ))}
      </span>
      <style>{`
        .hv-render-row { display: grid; grid-template-columns: 140px minmax(0, 1fr); gap: 12px; align-items: center; }
        @media (max-width: 640px) { .hv-render-row { grid-template-columns: 1fr; } }
        .hv-render-row-label { font: 500 13px/1.3 var(--sans); color: var(--fg); }
        .hv-render-row-choices { display: flex; flex-wrap: wrap; gap: 8px; }
        .hv-render-choice {
          padding: 7px 13px; cursor: pointer; font: 400 13px/1.2 var(--sans); color: var(--fg);
          border: 1px solid var(--rule); background: var(--surface); border-radius: 999px;
        }
        .hv-render-choice.is-on { border-color: var(--brass); background: var(--surface-soft); font-weight: 500; }
        .hv-render-choice:disabled { opacity: .5; cursor: default; }
      `}</style>
    </div>
  );
}

/** Credits one image costs. One, unless the server says otherwise. */
function credits(wallet: AiCreditSummary | null): number {
  return wallet?.renderCost ?? 1;
}

/**
 * "Buy 1 credit · ₹99", or just "Buy an AI image credit" until the price has loaded.
 *
 * The server is the authority and refuses any other amount, so this is only ever a label —
 * but a button that names a price the payment then refuses is worse than one that names
 * none, which is why it reads the wallet's own figure rather than a constant.
 */
function buyCreditLabel(wallet: AiCreditSummary | null): string {
  if (!wallet) return "Buy an AI image credit";
  const n = credits(wallet);
  return `Buy ${n} credit${n === 1 ? "" : "s"} · ${formatRupees(wallet.pricePaise * n)}`;
}

/**
 * The line under the button, which has to say three quite different things.
 *
 * A room that still includes an image says so. A room with none left but a wallet that can
 * cover it says what pressing the button will actually cost — the one case where a click
 * spends money-equivalent without a payment sheet, so it must never be a surprise. A room
 * with neither says what to do about it.
 */
function allowanceNote(rendersLeft: number, creditsLeft: number, cost: number): string {
  if (rendersLeft > 0) {
    return rendersLeft === 1
      ? "One image included with this project."
      : `${rendersLeft} images left on this project.`;
  }
  if (creditsLeft >= cost) {
    return `This image uses ${cost} of your ${creditsLeft} AI credit${creditsLeft === 1 ? "" : "s"}.`;
  }
  return "This project doesn't include an AI image. Buy a credit to make one — it never expires and works on any room.";
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${url}`));
    img.src = url;
  });
}

function hexToRgb01(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [
    parseInt(clean.slice(0, 2), 16) / 255,
    parseInt(clean.slice(2, 4), 16) / 255,
    parseInt(clean.slice(4, 6), 16) / 255,
  ];
}
