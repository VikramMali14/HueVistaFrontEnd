"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button, LinkButton } from "@/components/ui/button";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { Spinner } from "@/components/ui/spinner";
import { api, HttpError } from "@/lib/api";
import { Canvas2DRecolor } from "@/lib/canvas2d-recolor";
import { downloadBlob } from "@/lib/download-blob";
import { downloadRemoteImage } from "@/lib/download-image";
import { resolveMediaUrl } from "@/lib/media";
import { loadCrossOriginImage as loadImage } from "@/lib/load-image";
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
  RenderQuality,
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
 * **Who pays, and what the button says.** An AI credit, every time, on every room. There
 * used to be an image included with rooms the account had paid for itself, which meant
 * this screen had to say one of three different things depending on how the room had been
 * bought — and meant the price of a picture was unpredictable from the outside. One
 * pocket now: the account's wallet, read alongside the project so the cost is named
 * honestly before the click rather than after a 402 comes back.
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
  // The cheapest tier, deliberately. This is the one option on the screen that costs
  // money to change, so it opens at the price somebody expects and every step up is
  // something they chose rather than something they were defaulted into.
  quality: "PREMIUM",
  // The cleaned photograph, which is what this made before the choice existed and the
  // better starting point in the ordinary case.
  sourceImage: "CLEANED",
};

/**
 * The two qualities, in credits-ascending order.
 *
 * The prices are NOT here — they come off the wallet, which reads them from the server, so
 * this screen cannot quote a number the charge then contradicts. What lives here is the
 * prose about choosing, which is the thing the server has no opinion about.
 *
 * Two rather than three: the old top tier cost four credits, twice the one below it for a
 * difference most people could not see on a phone, and a row of three where the third is
 * never picked makes the two that are harder to read.
 */
const QUALITY: Choice<RenderQuality>[] = [
  { value: "PREMIUM", label: "Premium", hint: "A clear, true photograph of your room" },
  {
    value: "LUXURY",
    label: "Luxury",
    hint: "Our finest — sharper, larger, and truer to your building's own lines",
  },
];

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

/**
 * Which photograph the model paints.
 *
 * Only offered on a room that HAS both, which is why it is not simply another row in the
 * list below. On a room whose clean-up never ran there is one picture, the server uses it
 * whatever is asked for, and a choice with a single real option in it is worse than no
 * choice — it invites somebody to pick the wrong one and then quietly ignores them.
 */
const SOURCE_IMAGE: Choice<NonNullable<RenderOptions["sourceImage"]>>[] = [
  {
    value: "CLEANED",
    label: "Cleaned photo",
    hint: "Clutter removed and surfaces flattened, so the colour lands true — the usual choice",
  },
  {
    value: "ORIGINAL",
    label: "Original photo",
    hint: "The room exactly as you photographed it, if the clean-up lost something you wanted",
  },
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
  /** True while the picture itself is being fetched for saving. */
  const [saving, setSaving] = useState(false);
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
   * Save the picture itself.
   *
   * This used to be an anchor carrying `download` and pointing at the presigned S3 URL.
   * The attribute is same-origin-only by specification, so on that href the browser
   * ignored it and NAVIGATED: the render page was replaced by a bare JPEG, and a
   * customer who then saved it by hand got a file named after the storage key. Fetching
   * the bytes makes it a real download and lets the name say which room it is.
   */
  const downloadImage = useCallback(async () => {
    const image = active?.status === "READY" ? active : null;
    const url = image ? (resolveMediaUrl(image.imageUrl) ?? "") : "";
    if (!url || saving) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await downloadRemoteImage(
        url,
        `huevista-ai-image-${Date.now()}`,
      );
      // Opening it is what the old anchor did by accident, and as a last resort it is
      // still a picture the browser's own save can reach.
      if (!saved) {
        window.open(url, "_blank", "noopener,noreferrer");
        setError(
          "Could not save the file directly, so it opened in a new tab — press and hold, "
          + "or right-click, to save it from there.",
        );
      }
    } finally {
      setSaving(false);
    }
  }, [active, saving]);

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
      // Enough for the image in front of them at the tier they chose, less whatever they
      // already hold. Buying a flat one credit was right when an image cost exactly one;
      // with tiers it would leave somebody who picked Luxury a credit short and none the
      // wiser.
      const shortfall = Math.max(1, shortBy(wallet, options.quality));
      const fresh = await buyAiCredits(shortfall);
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
  }, [wallet, options.quality]);

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

  // What the picture costs, and whether the wallet covers it. One number now: no room
  // includes an image, so the sticker price IS what pressing the button spends.
  const cost = credits(wallet, options.quality);
  const creditsLeft = wallet?.balance ?? 0;
  /** Can the button actually make an image right now? */
  const canGenerate = creditsLeft >= cost;
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
        {/* Pressed buttons in a group, not a radiogroup. The ARIA radio pattern promises
            arrow-key movement across a single tab stop and none is implemented here, so
            a screen-reader user was invited to press keys that do nothing — on the one
            choice in this flow that spends money. */}
        <div className="hv-render-combos" role="group" aria-label="Your colour combinations">
          {combos.map((combo, i) => (
            <button
              key={combo.id}
              type="button"
              aria-pressed={combo.id === selected}
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
            <Button variant="brass" disabled={saving} onClick={() => void downloadImage()}>
              {saving ? "Saving…" : "Download the image"}
            </Button>
            <Button variant="ghost" disabled={boardBusy} onClick={() => void downloadImagePdf()}>
              {boardBusy ? "Building your PDF…" : "This image as a PDF"}
            </Button>
            <Button variant="ghost" disabled={boardBusy} onClick={() => void downloadBoardWithImage()}>
              {boardBusy ? "Building your PDF…" : "Colour board PDF · with this image"}
            </Button>
            {canGenerate ? (
              <Button variant="ghost" onClick={() => setActive(null)}>
                Make another · {cost} credit{cost === 1 ? "" : "s"}
              </Button>
            ) : (
              <Button variant="ghost" disabled={buying} onClick={() => void topUp()}>
                {buying ? "Opening checkout…" : buyCreditLabel(wallet, cost - creditsLeft)}
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
          {/* First, because it is the only row that changes the price. Every other choice
              here is free to move; this one is the purchase. */}
          <OptionRow
            label="Quality"
            choices={qualityChoices(wallet)}
            value={options.quality ?? "PREMIUM"}
            onChange={(quality) => setOptions((o) => ({ ...o, quality }))}
            disabled={busy}
            showHint
          />
          {/* Second, and only when there are two pictures to choose between. This used to
              be a decision the code made silently — always the cleaned one — and it is
              the one option here that changes what the model is actually looking at
              rather than what it is asked to do with it. */}
          {project?.cleanedImageUrl && (
            <OptionRow
              label="Paint from"
              choices={SOURCE_IMAGE}
              value={options.sourceImage ?? "CLEANED"}
              onChange={(sourceImage) => setOptions((o) => ({ ...o, sourceImage }))}
              disabled={busy}
            />
          )}
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
                  : `Make my image · ${cost} credit${cost === 1 ? "" : "s"}`}
              </Button>
            ) : (
              <Button variant="brass" disabled={buying} onClick={() => void topUp()}>
                {buying ? "Opening checkout…" : buyCreditLabel(wallet, cost - creditsLeft)}
              </Button>
            )}
            <span className="hv-render-left">{costNote(creditsLeft, cost)}</span>
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
        .hv-render-options { margin-top: 32px; display: grid; gap: 22px; }
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
  showHint,
}: {
  label: string;
  choices: Choice<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  /**
   * Show the chosen option's hint under the row.
   *
   * The hints have always been `title` attributes, which is to say invisible on a phone —
   * where most of this is used. Printing every hint would be six lines of prose on a
   * screen whose job is one decision, so only the one that has actually been chosen is
   * shown, and only on the rows that ask for it. The quality row asks: it is the one
   * choice here that costs money, and "what am I getting for the second credit" is
   * exactly the question a tooltip nobody can open fails to answer.
   */
  showHint?: boolean;
}) {
  const hint = showHint ? choices.find((c) => c.value === value)?.hint : undefined;
  return (
    // role="group" + aria-pressed rather than the radio pattern — see the combo picker
    // above: nothing here implements the arrow-key navigation a radiogroup announces.
    <div className="hv-render-row" role="group" aria-label={label}>
      <span className="hv-render-row-label">{label}</span>
      <span className="hv-render-row-body">
        <span className="hv-render-row-choices">
          {choices.map((c) => (
            <button
              key={c.value}
              type="button"
              aria-pressed={c.value === value}
              title={c.hint}
              disabled={disabled}
              className={`hv-render-choice${c.value === value ? " is-on" : ""}`}
              onClick={() => onChange(c.value)}
            >
              {c.label}
            </button>
          ))}
        </span>
        {/* aria-live so the hint is heard when the choice changes rather than only found
            by somebody who happens to read past the buttons. */}
        {hint && (
          <span className="hv-render-row-hint" aria-live="polite">
            {hint}
          </span>
        )}
      </span>
      <style>{`
        .hv-render-row { display: grid; grid-template-columns: 140px minmax(0, 1fr); gap: 14px; align-items: start; }
        @media (max-width: 640px) { .hv-render-row { grid-template-columns: 1fr; gap: 8px; } }
        .hv-render-row-label { font: 500 13px/1.3 var(--sans); color: var(--fg); padding-top: 10px; }
        @media (max-width: 640px) { .hv-render-row-label { padding-top: 0; } }
        .hv-render-row-body { display: grid; gap: 8px; min-width: 0; }
        .hv-render-row-choices { display: flex; flex-wrap: wrap; gap: 9px; }
        .hv-render-row-hint { font: 400 12.5px/1.5 var(--sans); color: var(--fg-mute); max-width: 46ch; }
        .hv-render-choice {
          padding: 9px 16px; cursor: pointer; font: 400 13.5px/1.25 var(--sans); color: var(--fg-soft);
          border: 1px solid var(--rule); background: var(--surface); border-radius: var(--radius-pill);
          transition: border-color .25s var(--ease), color .25s var(--ease), background .25s var(--ease);
        }
        .hv-render-choice:hover:not(:disabled):not(.is-on) { border-color: var(--rule-strong); color: var(--fg); }
        .hv-render-choice.is-on {
          border-color: var(--brass); background: var(--surface-soft); color: var(--fg);
          font-weight: 500; box-shadow: 0 0 0 3px rgba(124,92,255,.12);
        }
        .hv-render-choice:disabled { opacity: .45; cursor: default; }
        @media (prefers-reduced-motion: reduce) { .hv-render-choice { transition: none; } }
      `}</style>
    </div>
  );
}

/**
 * Credits one image costs at {@param quality}, read off the server's own tier list.
 *
 * Falls back to the flat render cost for a backend that knows nothing about tiers, and to
 * 1 for a wallet that has not loaded — the label is only ever a label, and the server
 * refuses any amount but its own, but a button naming a price the payment then contradicts
 * is worse than one that names none.
 */
function credits(wallet: AiCreditSummary | null, quality: RenderQuality = "PREMIUM"): number {
  const tier = wallet?.renderTiers?.find((t) => t.quality === quality);
  return tier?.credits ?? wallet?.renderCost ?? 1;
}

/** The tier buttons, each labelled with what it costs. */
function qualityChoices(wallet: AiCreditSummary | null): Choice<RenderQuality>[] {
  return QUALITY.map((choice) => {
    const n = credits(wallet, choice.value);
    return { ...choice, label: `${choice.label} · ${n} credit${n === 1 ? "" : "s"}` };
  });
}

/** How many credits short this account is of the image it just asked for. */
function shortBy(wallet: AiCreditSummary | null, quality: RenderQuality | undefined): number {
  return credits(wallet, quality ?? "PREMIUM") - (wallet?.balance ?? 0);
}

/**
 * "Buy 1 credit · ₹99", or just "Buy an AI image credit" until the price has loaded.
 *
 * The server is the authority and refuses any other amount, so this is only ever a label —
 * but a button that names a price the payment then refuses is worse than one that names
 * none, which is why it reads the wallet's own figure rather than a constant.
 */
function buyCreditLabel(wallet: AiCreditSummary | null, needed: number): string {
  if (!wallet) return "Buy an AI image credit";
  const n = Math.max(1, needed);
  return `Buy ${n} credit${n === 1 ? "" : "s"} · ${formatRupees(wallet.pricePaise * n)}`;
}

/**
 * The line under the button: what this click will cost, or what to do if it cannot.
 *
 * Two cases where there used to be four. The others described a room's included image and
 * the upgrade that topped it up, and they are gone with the allowance itself — which is
 * the point: pressing this button spends money-equivalent without a payment sheet, and the
 * fewer different sentences that can precede it, the less surprising it is.
 */
function costNote(creditsLeft: number, cost: number): string {
  if (creditsLeft >= cost) {
    return `This image uses ${cost} of your ${creditsLeft} AI credit${creditsLeft === 1 ? "" : "s"}.`;
  }
  return `You need ${cost} credit${cost === 1 ? "" : "s"} for this image and have `
    + `${creditsLeft}. Credits work on any room.`;
}

function hexToRgb01(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [
    parseInt(clean.slice(0, 2), 16) / 255,
    parseInt(clean.slice(2, 4), 16) / 255,
    parseInt(clean.slice(4, 6), 16) / 255,
  ];
}
