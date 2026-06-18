"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { LoaderOverlay } from "@/components/ui/loader-overlay";
import { Spinner } from "@/components/ui/spinner";
import { PipelineBar, type PipelineStage } from "./pipeline-bar";
import { ShadeGrid } from "./shade-grid";
import { MaskStudio, type ExistingMask } from "./mask-studio";
import { ProjectDetailsGate, type ProjectDetails } from "./project-details-gate";
import type { RegionLite } from "./coordinate-suggestions";
import { PhoneHandoff } from "@/components/shared/phone-handoff";
import { hexToRgb01, Recolor, regionMeanLuma, type RegionPaint } from "@/lib/webgl-recolor";
import { Canvas2DRecolor } from "@/lib/canvas2d-recolor";
import type { RecolorEngine } from "@/lib/recolor-engine";
import {
  PollCancelledError,
  pollUntilSegmented as pollSegmentationStatus,
} from "@/lib/segmentation-polling";
import { api, guestApi, HttpError } from "@/lib/api";
import { undertoneClash } from "@/lib/color-science";
import { resolveMediaUrl } from "@/lib/media";
import { buyExtraProject } from "@/lib/payments";
import type {
  PaintShade,
  ProjectDetail,
  RegionCategory,
  RegionColorUpdate,
  RegionDetail,
  RegionKind,
} from "@/lib/types";

interface VisualizerProps {
  /** When set, open this existing project: loads its SAVED masks + cleaned image from
   *  storage instead of re-running segmentation (no extra AI cost). */
  projectId?: string;
  /** Shades fetched server-side from the backend catalogue. */
  shades?: ReadonlyArray<PaintShade>;
  /** Pre-seeded project name (e.g. from the dashboard "New project" form). */
  initialName?: string;
  /** Anonymous guest mode (redeemed a shop code, no account): CRUD goes to the
   *  guest endpoints, there's no AI auto-segment or share link, and the single
   *  project is owned by the access code. The shop resolves real shade codes. */
  guest?: boolean;
}

interface RegionState {
  id: string;
  backendId?: number;
  kind: RegionKind;
  label: string;
  hex: string;
  shade?: PaintShade;
  maskUrl?: string | null;
  /** In-memory mask for a hand-drawn (polygon) region — takes precedence over
   *  maskUrl so the preview is instant and survives a failed backend save. */
  maskCanvas?: HTMLCanvasElement | null;
  /** True once the user has put a colour on this region — only applied regions
   *  are painted, and they STAY painted while you edit another region. */
  applied?: boolean;
  /** True for masks the user created by hand (counts against the 3-mask cap). */
  custom?: boolean;
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_CUSTOM_MASKS = 3;

const DEFAULT_REGIONS: ReadonlyArray<RegionState> = [
  { id: "main", kind: "MAIN_WALL", label: "Main wall", hex: "#a47148" },
  { id: "accent", kind: "ACCENT_WALL", label: "Accent wall", hex: "#5b6c5b" },
  { id: "trim", kind: "TRIM", label: "Trim", hex: "#f3eee4" },
];

const CATEGORY_TO_KIND: Record<RegionCategory, RegionKind> = {
  MAIN_WALL: "MAIN_WALL",
  ACCENT_WALL: "ACCENT_WALL",
  OTHER_WALL: "ACCENT_WALL",
  TRIM: "TRIM",
  MANUAL: "MANUAL",
};

const DEFAULT_HEX_FOR_KIND: Record<RegionKind, string> = {
  MAIN_WALL: "#a47148",
  ACCENT_WALL: "#5b6c5b",
  TRIM: "#f3eee4",
  MANUAL: "#b89968",
};

const KIND_LABEL: Record<RegionKind, string> = {
  MAIN_WALL: "Main wall",
  ACCENT_WALL: "Accent wall",
  TRIM: "Trim",
  MANUAL: "Wall",
};

function mapBackendRegion(region: RegionDetail): RegionState {
  const kind = CATEGORY_TO_KIND[region.category] ?? "MANUAL";
  const fallback = KIND_LABEL[kind];
  const hasColor = Boolean(region.appliedHexCode || region.appliedShadeCode);
  return {
    id: `r-${region.id}`,
    backendId: region.id,
    kind,
    label: region.label || fallback,
    hex: region.appliedHexCode || DEFAULT_HEX_FOR_KIND[kind],
    // Reopened projects render every saved colour at once, not just one wall.
    applied: hasColor,
    custom: kind === "MANUAL",
    // Route relative backend mask URLs through the BFF so auth is attached and the canvas
    // stays untainted; S3 presigned URLs pass through unchanged.
    maskUrl: resolveMediaUrl(region.maskUrl),
  };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image: " + url));
    img.src = url;
  });
}

type SaveStatus = "idle" | "saving" | "saved" | "failed";

export function Visualizer({ projectId: openProjectId, shades, initialName, guest = false }: VisualizerProps) {
  // Guest mode swaps the CRUD calls to the access-code-scoped endpoints. Signatures
  // match the user `api`, so the rest of the flow is identical. User-only calls
  // (segmentation, share) are guarded by `!guest` at their call sites.
  const uploadImageCall = guest ? guestApi.uploadImage : api.uploadImage;
  const createProjectCall = guest ? guestApi.createProject : api.createProject;
  const getProjectCall = guest ? guestApi.getProject : api.getProject;
  const updateRegionColorsCall = guest ? guestApi.updateRegionColors : api.updateRegionColors;
  const createCustomMaskCall = guest ? guestApi.createCustomMask : api.createCustomMask;
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recolorRef = useRef<RecolorEngine | null>(null);
  const srcImgRef = useRef<HTMLImageElement | null>(null);
  const maskCacheRef = useRef<Map<string, Promise<HTMLImageElement>>>(new Map());
  const baseLumaRef = useRef<Map<string, number>>(new Map());
  const pollAbortRef = useRef<{ cancelled: boolean } | null>(null);
  // Monotonic id so only the LATEST in-flight auto-save may write saveStatus —
  // out-of-order responses from rapid edits can't clobber a newer one's status.
  const saveSeqRef = useRef(0);
  // Saves that failed (colour updates AND custom-mask uploads), kept as thunks
  // so "Retry" re-fires exactly what was lost — not just the latest payload.
  const failedSavesRef = useRef<Array<() => Promise<void>>>([]);
  const [stage, setStage] = useState<PipelineStage>("upload");
  const [done, setDone] = useState<Partial<Record<PipelineStage, boolean>>>({});
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [classification, setClassification] = useState<"INDOOR" | "OUTDOOR" | "UNKNOWN" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [regions, setRegions] = useState<RegionState[]>(() =>
    [...DEFAULT_REGIONS],
  );
  const [activeRegion, setActiveRegion] = useState<string>(regions[0]!.id);
  const [cleanOn, setCleanOn] = useState(true);
  const [compare, setCompare] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(initialName ?? null);
  const [projectRoom, setProjectRoom] = useState<string | null>(null);
  const [segmenting, setSegmenting] = useState(false);
  const [masksReady, setMasksReady] = useState(false);
  // Guest AI is billed to the shop; when the shop is out of credits we silently
  // fall back to manual wall-marking and show this gentle note (guests only).
  const [guestAiUnavailable, setGuestAiUnavailable] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [limitReached, setLimitReached] = useState(false);
  const [accessExpired, setAccessExpired] = useState(false);
  // Retailer funnel gates (distinct from the customer entitlement ones above):
  // verification required before the first project, and "subscribe to a plan".
  const [needVerification, setNeedVerification] = useState(false);
  const [needSubscription, setNeedSubscription] = useState(false);
  const [buying, setBuying] = useState(false);
  const [pendingImageId, setPendingImageId] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [imageDims, setImageDims] = useState<{ w: number; h: number } | null>(null);
  // Step 0 — project details captured before anything is created on the backend.
  const [details, setDetails] = useState<ProjectDetails | null>(
    initialName ? { name: initialName } : null,
  );
  // Shadow / relief preservation (opt-in).
  const [shadowOn, setShadowOn] = useState(false);
  const [shadowStrength, setShadowStrength] = useState(0.7);
  // Manual mask studio.
  const [maskStudioOpen, setMaskStudioOpen] = useState(false);
  const [savingMask, setSavingMask] = useState(false);
  // Per-region history of catalogue shades the user tried (newest first, max 5).
  const [triedByRegion, setTriedByRegion] = useState<Record<string, PaintShade[]>>({});
  // Project-wide history (newest first, max 10) — "that pink from before".
  const [recentShades, setRecentShades] = useState<PaintShade[]>([]);
  // "Copy palette" click feedback on the applied-palette strip.
  const [paletteCopied, setPaletteCopied] = useState(false);
  // Transient topbar notices — "Walls detected" / "Saved" auto-hide after a beat.
  const [wallsNoticeVisible, setWallsNoticeVisible] = useState(false);
  const [savedNoticeVisible, setSavedNoticeVisible] = useState(false);
  // True when WebGL2 was unavailable and we fell back to the Canvas 2D engine.
  const [basicPreview, setBasicPreview] = useState(false);
  // 0 = try the WebGL2 engine; >= 1 = remount a fresh canvas and use the 2D
  // engine. A canvas is locked to its first successful getContext type, so a
  // partially-initialised WebGL2 attempt (context created, shaders failed)
  // would leave the original canvas unable to provide a 2D context.
  const [engineEpoch, setEngineEpoch] = useState(0);

  useEffect(() => {
    if (!masksReady) {
      setWallsNoticeVisible(false);
      return;
    }
    setWallsNoticeVisible(true);
    const t = setTimeout(() => setWallsNoticeVisible(false), 4000);
    return () => clearTimeout(t);
  }, [masksReady]);

  useEffect(() => {
    if (saveStatus !== "saved") {
      setSavedNoticeVisible(false);
      return;
    }
    setSavedNoticeVisible(true);
    const t = setTimeout(() => setSavedNoticeVisible(false), 2500);
    return () => clearTimeout(t);
  }, [saveStatus]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      if (engineEpoch === 0) {
        recolorRef.current = new Recolor(canvas);
      } else {
        recolorRef.current = new Canvas2DRecolor(canvas);
        setBasicPreview(true);
      }
    } catch (err) {
      if (engineEpoch === 0) {
        // No WebGL2 — fall back to the approximate Canvas 2D engine instead of
        // blocking the visualizer, on a freshly mounted canvas (the failed
        // attempt may have claimed this one for WebGL2).
        setEngineEpoch(1);
      } else {
        // Both engines failed — this browser genuinely can't render previews.
        setError(err instanceof Error ? err.message : String(err));
      }
    }
    return () => {
      recolorRef.current?.dispose();
      recolorRef.current = null;
    };
  }, [engineEpoch]);

  const loadMask = useCallback((url: string) => {
    const cache = maskCacheRef.current;
    const cached = cache.get(url);
    if (cached) return cached;
    const promise = loadImage(url);
    cache.set(url, promise);
    promise.catch(() => cache.delete(url));
    return promise;
  }, []);

  // Composite EVERY painted region over the photo in one frame, so switching the
  // active wall never wipes the colours already applied to the others.
  useEffect(() => {
    const rc = recolorRef.current;
    if (!rc || !imageUrl) return;
    let cancelled = false;

    (async () => {
      if (compare) {
        rc.renderBase();
        return;
      }
      const paints: RegionPaint[] = [];
      for (const r of regions) {
        if (!r.applied) continue;
        // Narrow to img/canvas (both valid as a GL texture AND for 2D sampling).
        let mask: HTMLImageElement | HTMLCanvasElement | null = r.maskCanvas ?? null;
        if (!mask && r.maskUrl) {
          try {
            mask = await loadMask(r.maskUrl);
          } catch {
            mask = null;
          }
        }
        if (cancelled) return;
        if (!mask) continue;
        let baseL = 0;
        if (shadowOn) {
          const cached = baseLumaRef.current.get(r.id);
          if (cached !== undefined) {
            baseL = cached;
          } else {
            baseL = srcImgRef.current ? regionMeanLuma(srcImgRef.current, mask) : 0;
            baseLumaRef.current.set(r.id, baseL);
          }
        }
        paints.push({
          mask,
          target: hexToRgb01(r.hex),
          preserve: shadowOn ? shadowStrength : 0,
          baseL,
        });
      }
      if (cancelled) return;
      rc.renderRegions(paints);
    })();

    return () => {
      cancelled = true;
    };
  }, [regions, imageUrl, compare, shadowOn, shadowStrength, loadMask]);

  useEffect(() => {
    return () => {
      if (pollAbortRef.current) pollAbortRef.current.cancelled = true;
    };
  }, []);

  const applyProjectDetail = useCallback(
    async (detail: ProjectDetail) => {
      const rc = recolorRef.current;
      const canvasUrl = resolveMediaUrl(detail.cleanedImageUrl || detail.imageUrl);
      if (rc && canvasUrl) {
        try {
          const img = await loadImage(canvasUrl);
          srcImgRef.current = img;
          baseLumaRef.current.clear();
          rc.setImage(img);
          setImageUrl(canvasUrl);
          setImageDims({ w: img.naturalWidth, h: img.naturalHeight });
        } catch (err) {
          if (process.env.NODE_ENV !== "production") {
            console.warn("Failed to load cleaned image, keeping local preview:", err);
          }
        }
      }
      if (detail.name) setProjectName(detail.name);
      if (detail.roomType) setProjectRoom(detail.roomType);
      const mapped = detail.regions
        .slice()
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
        .map((r) => mapBackendRegion(r));
      if (mapped.length > 0) {
        setRegions(mapped);
        setActiveRegion(mapped[0]!.id);
      }
    },
    [],
  );

  // Open an existing project: fetch it and render its SAVED cleaned image + masks from
  // storage (S3/local). This does NOT call segmentation again — the masks are reused,
  // so there is no extra AI/Replicate cost when revisiting a project.
  useEffect(() => {
    if (!openProjectId) return;
    let cancelled = false;
    (async () => {
      setError(null);
      setUploading(true);
      try {
        const detail = await getProjectCall(openProjectId);
        if (cancelled) return;
        setProjectId(detail.id);
        await applyProjectDetail(detail);
        if (cancelled) return;
        setStage("recolor");
        setDone({ upload: true, clean: true, mask: true, recolor: true });
        setMasksReady(true);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof HttpError && err.status === 401) {
          window.location.href = "/sign-in?next=/dashboard";
          return;
        }
        setError(err instanceof Error ? err.message : "Could not open this project.");
      } finally {
        if (!cancelled) setUploading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openProjectId, applyProjectDetail, getProjectCall]);

  // Poll the backend until segmentation finishes. The loop itself lives in
  // src/lib/segmentation-polling.ts (pure + unit-testable); this wrapper only
  // owns the abort token: starting a new poll cancels the previous one, and the
  // unmount cleanup above flips the live token. Guests poll their masked project
  // (guestApi.getProject carries the same status field); everyone else uses the
  // lightweight status endpoint.
  const pollUntilSegmented = useCallback(async (id: string) => {
    if (pollAbortRef.current) pollAbortRef.current.cancelled = true;
    const token = { cancelled: false };
    pollAbortRef.current = token;
    return pollSegmentationStatus<ProjectDetail>({
      getStatus: () => (guest ? guestApi.getProject(id) : api.getProjectStatus(id)),
      isCancelled: () => token.cancelled,
    });
  }, [guest]);

  const validateFile = useCallback((file: File): string | null => {
    if (!ALLOWED_MIME.has(file.type)) {
      return "Only JPEG, PNG or WebP photos are accepted.";
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return "Photo is larger than 10 MB. Use a smaller copy.";
    }
    return null;
  }, []);

  // Create the project + run segmentation for an already-uploaded image. Extracted so it
  // can be retried after the customer buys an extra project. Surfaces the new
  // entitlement errors: 402 = allowance used, 403 = access window expired.
  const createAndSegment = useCallback(
    async (imageId: string) => {
      setError(null);
      setLimitReached(false);
      setAccessExpired(false);
      setNeedVerification(false);
      setNeedSubscription(false);
      setSegmenting(true);
      try {
        const project = await createProjectCall({
          imageId,
          name: details?.name,
          roomType: details?.roomType,
          notes: details?.notes,
        });
        setProjectId(project.id);
        if (project.name) setProjectName(project.name);
        if (guest) {
          // Guest AI wall-detection is billed to the issuing shop. If the shop is
          // out of credits (402) or the AI run fails, fall back to marking walls by
          // hand — the canvas opens either way so the guest is never blocked.
          setGuestAiUnavailable(false);
          try {
            await guestApi.requestSegmentation(project.id);
            const segmented = await pollUntilSegmented(project.id);
            await applyProjectDetail(segmented);
          } catch (segErr) {
            if (segErr instanceof PollCancelledError) return;
            setGuestAiUnavailable(true);
          }
          setMasksReady(true);
          setDone((d) => ({ ...d, mask: true }));
        } else {
          await api.requestSegmentation(project.id);
          const segmented = await pollUntilSegmented(project.id);
          await applyProjectDetail(segmented);
          setMasksReady(true);
          setDone((d) => ({ ...d, mask: true }));
        }
      } catch (err) {
        if (err instanceof PollCancelledError) {
          // Superseded by a newer poll or the component unmounted — not an error.
          return;
        }
        if (err instanceof HttpError && err.status === 401) {
          setError("Your session expired. Please sign in again.");
          setTimeout(() => {
            window.location.href = "/sign-in?next=/atelier";
          }, 1200);
        } else if (err instanceof HttpError && err.status === 402) {
          // Retailer "subscribe to a plan" (coded) vs customer "buy one extra project".
          if (err.code === "SUBSCRIPTION_REQUIRED") setNeedSubscription(true);
          else setLimitReached(true);
          setError(err.message);
        } else if (err instanceof HttpError && err.status === 403) {
          // Retailer "verify email + mobile" (coded) vs customer access window ended.
          if (err.code === "VERIFICATION_REQUIRED") setNeedVerification(true);
          else setAccessExpired(true);
          setError(err.message);
        } else if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Something went wrong.");
        }
      } finally {
        setSegmenting(false);
      }
    },
    [pollUntilSegmented, applyProjectDetail, details, guest, createProjectCall],
  );

  const onFileChosen = useCallback(
    async (file: File) => {
      setError(null);
      const validation = validateFile(file);
      if (validation) {
        setError(validation);
        return;
      }
      setUploading(true);
      setMasksReady(false);
      setProjectId(null);
      setSaveStatus("idle");
      maskCacheRef.current.clear();
      baseLumaRef.current.clear();
      try {
        const localUrl = URL.createObjectURL(file);
        const img = await loadImage(localUrl);
        srcImgRef.current = img;
        recolorRef.current?.setImage(img);
        recolorRef.current?.renderBase();
        setImageUrl(localUrl);
        setImageDims({ w: img.naturalWidth, h: img.naturalHeight });
        setStage("clean");
        setDone((d) => ({ ...d, upload: true }));
        try {
          const uploaded = await uploadImageCall(file);
          if (!uploaded?.imageId) {
            throw new Error("Upload failed. Please try again.");
          }
          setClassification(uploaded.imageType);
          setPendingImageId(uploaded.imageId);
          setStage("mask");
          setDone((d) => ({ ...d, upload: true, clean: cleanOn }));

          await createAndSegment(uploaded.imageId);
        } catch (err) {
          if (err instanceof HttpError && err.status === 401) {
            setError("Your session expired. Please sign in again.");
            setTimeout(() => {
              window.location.href = "/sign-in?next=/atelier";
            }, 1200);
          } else if (err instanceof Error) {
            setError(err.message);
          } else {
            setError("Something went wrong.");
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not open the image.");
      } finally {
        setUploading(false);
      }
    },
    [cleanOn, createAndSegment, validateFile, uploadImageCall],
  );

  // "Try again" after a wall-detection timeout/failure: re-runs segmentation on
  // the ALREADY-created project, so the customer never re-uploads the photo.
  const handleRetrySegmentation = useCallback(async () => {
    if (!projectId) return;
    setError(null);
    setSegmenting(true);
    try {
      if (guest) {
        // Guest retry is billed to the shop again; a 402/failure quietly drops
        // back to manual wall-marking rather than surfacing a hard error.
        setGuestAiUnavailable(false);
        try {
          await guestApi.requestSegmentation(projectId);
          const segmented = await pollUntilSegmented(projectId);
          await applyProjectDetail(segmented);
        } catch (segErr) {
          if (segErr instanceof PollCancelledError) return;
          setGuestAiUnavailable(true);
        }
      } else {
        await api.requestSegmentation(projectId);
        const segmented = await pollUntilSegmented(projectId);
        await applyProjectDetail(segmented);
      }
      setMasksReady(true);
      setDone((d) => ({ ...d, mask: true }));
    } catch (err) {
      if (err instanceof PollCancelledError) return;
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSegmenting(false);
    }
  }, [projectId, guest, pollUntilSegmented, applyProjectDetail]);

  const handleBuyAndRetry = useCallback(async () => {
    setError(null);
    setBuying(true);
    try {
      const purchased = await buyExtraProject();
      if (!purchased) return; // user dismissed the payment modal
      setLimitReached(false);
      if (pendingImageId) await createAndSegment(pendingImageId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment could not be completed.");
    } finally {
      setBuying(false);
    }
  }, [pendingImageId, createAndSegment]);

  // Run a persistence call under the shared save-status machine. Failures are
  // queued for Retry even when a newer save has since succeeded — an older
  // request failing out of order must never be silently dropped.
  const runSave = useCallback((save: () => Promise<void>) => {
    const seq = ++saveSeqRef.current;
    setSaveStatus("saving");
    void (async () => {
      try {
        await save();
        if (failedSavesRef.current.length > 0) setSaveStatus("failed");
        else if (saveSeqRef.current === seq) setSaveStatus("saved");
      } catch (err) {
        if (process.env.NODE_ENV !== "production") console.warn("Auto-save failed:", err);
        failedSavesRef.current.push(save);
        setSaveStatus("failed");
      }
    })();
  }, []);

  // Apply a catalogue shade to a SPECIFIC region (the active one, or any region
  // a coordinate suggestion targets). Persists when the region exists on the backend.
  const applyShadeTo = useCallback(
    (regionId: string, shade: PaintShade) => {
      let updatedBackendId: number | undefined;
      setRegions((prev) =>
        prev.map((r) => {
          if (r.id !== regionId) return r;
          updatedBackendId = r.backendId;
          return { ...r, hex: shade.hex, shade, applied: true };
        }),
      );
      // Applying a colour must always show the result — never the original peek.
      setCompare(false);
      setTriedByRegion((prev) => {
        const list = prev[regionId] ?? [];
        return { ...prev, [regionId]: [shade, ...list.filter((s) => s.code !== shade.code)].slice(0, 5) };
      });
      setRecentShades((prev) => [shade, ...prev.filter((s) => s.code !== shade.code)].slice(0, 10));
      setStage("recolor");
      setDone((d) => ({ ...d, mask: true, recolor: true }));

      if (projectId && updatedBackendId !== undefined) {
        const payload: RegionColorUpdate[] = [
          { regionId: updatedBackendId, shadeCode: shade.code, hexCode: shade.hex },
        ];
        runSave(async () => {
          await updateRegionColorsCall(projectId, payload);
        });
      }
    },
    [projectId, updateRegionColorsCall, runSave],
  );

  const onSelectShade = useCallback(
    (shade: PaintShade) => applyShadeTo(activeRegion, shade),
    [applyShadeTo, activeRegion],
  );

  // Apply a custom-picked colour EXACTLY (no catalogue shade) to the active region.
  const onApplyCustom = useCallback(
    (hex: string) => {
      let updatedBackendId: number | undefined;
      setRegions((prev) =>
        prev.map((r) => {
          if (r.id !== activeRegion) return r;
          updatedBackendId = r.backendId;
          return { ...r, hex, shade: undefined, applied: true };
        }),
      );
      // Applying a colour must always show the result — never the original peek.
      setCompare(false);
      setStage("recolor");
      setDone((d) => ({ ...d, mask: true, recolor: true }));

      if (projectId && updatedBackendId !== undefined) {
        const payload: RegionColorUpdate[] = [
          { regionId: updatedBackendId, shadeCode: null, hexCode: hex },
        ];
        runSave(async () => {
          await updateRegionColorsCall(projectId, payload);
        });
      }
    },
    [activeRegion, projectId, updateRegionColorsCall, runSave],
  );

  // Re-run every failed save; any that fails again re-queues itself via runSave.
  const retrySave = useCallback(() => {
    const pending = failedSavesRef.current;
    if (pending.length === 0) return;
    failedSavesRef.current = [];
    for (const save of pending) runSave(save);
  }, [runSave]);

  const customMaskCount = useMemo(() => regions.filter((r) => r.custom).length, [regions]);
  const masksRemaining = Math.max(0, MAX_CUSTOM_MASKS - customMaskCount);

  // The masks the Mask Studio can offer as a "start from" base.
  const existingMasks = useMemo<ExistingMask[]>(
    () =>
      regions
        .filter((r) => r.maskCanvas || r.maskUrl)
        .map((r) => ({ id: r.id, label: r.label, kind: r.kind, maskUrl: r.maskUrl, maskCanvas: r.maskCanvas })),
    [regions],
  );

  // Persist a mask built in the Mask Studio as a new manual region.
  const handleSaveMask = useCallback(
    async (mask: HTMLCanvasElement, category: RegionKind, label: string) => {
      const id = `drawn-${Date.now()}`;
      const newRegion: RegionState = {
        id,
        kind: category,
        label,
        hex: DEFAULT_HEX_FOR_KIND[category],
        maskCanvas: mask,
        custom: true,
        applied: false,
      };
      setRegions((prev) => [...prev, newRegion]);
      setActiveRegion(id);
      setStage("recolor");
      setDone((d) => ({ ...d, refine: true }));

      if (!projectId) {
        setMaskStudioOpen(false);
        return;
      }
      // Retryable thunk: on failure the Retry chip re-uploads THIS mask and
      // wires the backendId into the region, not just the last colour change.
      const persist = async () => {
        const detail = await createCustomMaskCall(projectId, {
          maskBase64: mask.toDataURL("image/png"),
          category,
          label,
        });
        setRegions((prev) =>
          prev.map((r) =>
            r.id === id ? { ...r, backendId: detail.id, maskUrl: resolveMediaUrl(detail.maskUrl) } : r,
          ),
        );
      };
      const seq = ++saveSeqRef.current;
      setSavingMask(true);
      setSaveStatus("saving");
      try {
        await persist();
        if (failedSavesRef.current.length > 0) setSaveStatus("failed");
        else if (saveSeqRef.current === seq) setSaveStatus("saved");
      } catch (err) {
        if (process.env.NODE_ENV !== "production") console.warn("Custom mask save failed:", err);
        failedSavesRef.current.push(persist);
        setSaveStatus("failed");
      } finally {
        setSavingMask(false);
        setMaskStudioOpen(false);
      }
    },
    [projectId, createCustomMaskCall],
  );

  // Generate a public, code-hidden share link for this project and copy it.
  const handleShare = useCallback(async () => {
    if (!projectId) return;
    setSharing(true);
    setError(null);
    try {
      const res = await api.generateShareLink(projectId, 7);
      const url = `${window.location.origin}/share/${res.shareToken}`;
      setShareUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 1600);
      } catch {
        /* clipboard blocked — the link is still shown for manual copy */
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create a share link.");
    } finally {
      setSharing(false);
    }
  }, [projectId]);

  // Copy the applied palette as one line per wall, e.g.
  // "Main wall — Silken Dawn (AP-1432) #e8dcc8" (guests never see shade codes).
  const handleCopyPalette = useCallback(async () => {
    const lines = regions
      .filter((r) => r.applied)
      .map((r) => {
        if (!r.shade) return `${r.label} — ${r.hex}`;
        return guest
          ? `${r.label} — ${r.shade.name} ${r.hex}`
          : `${r.label} — ${r.shade.name} (${r.shade.code}) ${r.hex}`;
      });
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setPaletteCopied(true);
      setTimeout(() => setPaletteCopied(false), 1600);
    } catch {
      /* clipboard blocked — nothing else to do */
    }
  }, [regions, guest]);

  const active = useMemo(() => regions.find((r) => r.id === activeRegion)!, [regions, activeRegion]);

  // Undertone check across every painted wall: the first warm-vs-cool (or
  // white-tint) fight found becomes a quiet note in the shade panel.
  const clashNote = useMemo(() => {
    const painted = regions.filter((r) => r.applied);
    for (let i = 0; i < painted.length; i++) {
      for (let j = i + 1; j < painted.length; j++) {
        const verdict = undertoneClash(painted[i]!.hex, painted[j]!.hex);
        if (verdict.clash) {
          return `${painted[i]!.label} and ${painted[j]!.label}: ${verdict.reason}.`;
        }
      }
    }
    return null;
  }, [regions]);

  // Slim region list for the shade grid's coordinate suggestions.
  const regionLites = useMemo<RegionLite[]>(
    () =>
      regions.map((r) => ({
        id: r.id,
        kind: r.kind,
        label: r.label,
        hex: r.hex,
        applied: Boolean(r.applied),
        shadeCode: r.shade?.code,
      })),
    [regions],
  );

  const overlayLabel = uploading && !segmenting
    ? "Uploading photo"
    : segmenting
      ? "Detecting walls"
      : "Working";
  const overlayHint = uploading && !segmenting
    ? "Sending the photo to our service."
    : segmenting
      ? "Finding the walls, trim and other paintable surfaces. This usually takes 5 to 10 seconds."
      : undefined;

  const regionLabelStyle: React.CSSProperties = { font: "500 13px/1 var(--sans)", color: "var(--fg)" };
  const controlChipStyle: React.CSSProperties = {
    font: "500 12px/1 var(--sans)",
    letterSpacing: 0,
    textTransform: "none",
    color: "var(--fg-soft)",
  };

  const showDetailsGate = !imageUrl && !details && !openProjectId;

  // Wall detection can be retried without re-uploading the photo once the
  // project exists and we're still on the mask step. Guests can retry too — each
  // attempt is billed to the shop, falling back to manual if it's out of credits.
  const canRetrySegmentation = Boolean(projectId) && stage === "mask";
  // Errors after the photo is on screen (segmentation timeout/failure, share
  // failures…) need their own surface — the DropZone one is gone by then.
  const showCanvasError = Boolean(
    error && imageUrl && !uploading && !segmenting &&
    !limitReached && !accessExpired && !needVerification && !needSubscription,
  );

  return (
    <div
      className="hv-visualizer"
      style={{ border: "1px solid var(--rule-strong)", borderRadius: "var(--radius)", overflow: "hidden", background: "var(--bg)", boxShadow: "0 24px 60px -42px rgba(0,0,0,.5)" }}
    >
      <div className="hv-vis-topbar">
        <div className="hv-vis-project">
          <Mono>Project</Mono>
          <span style={{ font: "600 14px/1.2 var(--sans)", color: "var(--fg)" }}>
            {projectName || "Untitled project"}
          </span>
          {projectRoom && <Mono>· {projectRoom}</Mono>}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          {basicPreview && (
            <span style={controlChipStyle} title="WebGL2 unavailable — using the simplified renderer">
              {"Basic preview mode — this browser doesn't support WebGL2, colours are approximate."}
            </span>
          )}
          {classification && (
            <span style={{ ...controlChipStyle, color: "var(--accent)" }}>
              {classification === "INDOOR" ? "Indoor" : classification === "OUTDOOR" ? "Outdoor" : "Unknown"}
            </span>
          )}
          {segmenting && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Spinner size={12} color="var(--accent)" />
              <span style={controlChipStyle}>Detecting walls…</span>
            </span>
          )}
          {masksReady && wallsNoticeVisible && !guestAiUnavailable && (
            <span style={{ ...controlChipStyle, color: "var(--accent)" }}>Walls detected</span>
          )}
          {guest && guestAiUnavailable && masksReady && (
            <span style={controlChipStyle} title="The shop's AI previews are used up — mark the walls by hand instead.">
              AI previews unavailable — mark walls by hand
            </span>
          )}
          {saveStatus === "saving" && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Spinner size={12} color="var(--fg-mute)" />
              <span style={controlChipStyle}>Saving…</span>
            </span>
          )}
          {saveStatus === "saved" && savedNoticeVisible && <span style={controlChipStyle}>Saved</span>}
          {saveStatus === "failed" && (
            <button
              type="button"
              onClick={retrySave}
              style={{
                ...controlChipStyle,
                color: "var(--terracotta)",
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
              }}
            >
              Could not save · <span style={{ textDecoration: "underline" }}>Retry</span>
            </button>
          )}
          {shareUrl && (
            <span
              title={shareUrl}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                maxWidth: 220,
                overflow: "hidden",
              }}
            >
              <Mono brass>{shareCopied ? "Link copied" : "Share link"}</Mono>
              <span style={{ font: "400 11px/1 var(--mono)", color: "var(--fg-mute)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {shareUrl.replace(/^https?:\/\//, "")}
              </span>
            </span>
          )}
          {!guest && (
            <Button
              size="sm"
              variant="brass"
              disabled={!projectId || sharing}
              onClick={() => void handleShare()}
              title={projectId ? "Create a public link (colours shown, codes hidden)" : "Save the project first"}
            >
              {sharing ? "Sharing…" : "Share with customer"}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={!imageUrl}
            onClick={() => recolorRef.current && downloadPng(recolorRef.current.exportPng())}
          >
            Download image
          </Button>
        </div>
      </div>

      <PipelineBar current={stage} done={done} busy={segmenting ? "mask" : uploading ? "upload" : undefined} />

      <div className="hv-vis-body" style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 0 }}>
        <div className="hv-vis-canvas-wrap" style={{ position: "relative", background: "var(--surface)" }}>
          <canvas
            key={engineEpoch}
            ref={canvasRef}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "contain",
              display: imageUrl ? "block" : "none",
            }}
          />
          {showDetailsGate && (
            <ProjectDetailsGate
              onSubmit={(d) => {
                setDetails(d);
                setProjectName(d.name);
                setProjectRoom(d.roomType ?? null);
              }}
            />
          )}
          {!imageUrl && !showDetailsGate && !openProjectId && (
            <DropZone
              uploading={uploading}
              error={error}
              onChoose={() => fileRef.current?.click()}
              onDrop={(file) => void onFileChosen(file)}
            />
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFileChosen(f);
              e.target.value = "";
            }}
          />
          {imageUrl && (
            <>
              {/* CONTROL CLUSTER — clean-up + shadow preservation */}
              <div
                className="hv-vis-control"
                style={{
                  position: "absolute",
                  top: 20,
                  left: 20,
                  padding: "10px 14px",
                  background: "var(--bg)",
                  border: "1px solid var(--rule-strong)",
                  zIndex: 5,
                  borderRadius: 8,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  maxWidth: "calc(100% - 40px)",
                }}
              >
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <span style={controlChipStyle}>Tidy up image</span>
                  <Toggle on={cleanOn} onClick={() => setCleanOn((v) => !v)} ariaLabel="image clean-up" />
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <span style={controlChipStyle}>Keep shadows</span>
                  <Toggle on={shadowOn} onClick={() => setShadowOn((v) => !v)} ariaLabel="shadow preservation" />
                  {shadowOn ? (
                    <input
                      type="range"
                      min={0.2}
                      max={1}
                      step={0.05}
                      value={shadowStrength}
                      onChange={(e) => setShadowStrength(Number(e.target.value))}
                      aria-label="Shadow intensity"
                      style={{ width: 80, accentColor: "var(--accent)" }}
                    />
                  ) : null}
                </div>
              </div>

              {/* REGION TABS */}
              <div
                className="hv-vis-control hv-vis-regions"
                style={{
                  position: "absolute",
                  bottom: 20,
                  left: 20,
                  right: 20,
                  background: "var(--bg)",
                  border: "1px solid var(--rule-strong)",
                  zIndex: 5,
                  borderRadius: 8,
                }}
              >
                {/* APPLIED-PALETTE STRIP — the "counter ticket" summary of every painted wall */}
                <div
                  className="hv-vis-palette"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "10px 16px",
                    borderBottom: "1px solid var(--rule)",
                    overflowX: "auto",
                  }}
                >
                  {regions.some((r) => r.applied) ? (
                    <>
                      {regions
                        .filter((r) => r.applied)
                        .map((r) => (
                          <span
                            key={r.id}
                            style={{ display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}
                          >
                            <span
                              aria-hidden
                              style={{
                                width: 18,
                                height: 18,
                                borderRadius: 5,
                                background: r.hex,
                                border: "1px solid var(--rule-strong)",
                                flexShrink: 0,
                              }}
                            />
                            <span style={{ font: "500 12px/1 var(--sans)", color: "var(--fg)" }}>{r.label}</span>
                            <span style={{ font: "400 11px/1 var(--mono)", color: "var(--fg-mute)" }}>
                              {guest
                                ? r.shade?.name ?? r.hex
                                : r.shade
                                  ? `${r.shade.name} · ${r.shade.code}`
                                  : r.hex}
                            </span>
                          </span>
                        ))}
                      <button
                        type="button"
                        onClick={() => void handleCopyPalette()}
                        style={{
                          marginLeft: "auto",
                          padding: "6px 12px",
                          background: "transparent",
                          border: "1px solid var(--rule-strong)",
                          borderRadius: 6,
                          color: "var(--fg-soft)",
                          whiteSpace: "nowrap",
                          font: "500 12px/1 var(--sans)",
                          cursor: "pointer",
                        }}
                      >
                        {paletteCopied ? "Copied" : "Copy palette"}
                      </button>
                    </>
                  ) : (
                    <span style={{ font: "400 12px/1 var(--sans)", color: "var(--fg-mute)" }}>
                      No colours applied yet
                    </span>
                  )}
                </div>
                <div style={{ position: "relative" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "10px 44px 10px 16px",
                      overflowX: "auto",
                    }}
                  >
                    <span style={{ ...controlChipStyle, whiteSpace: "nowrap" }}>Walls in this photo</span>
                    <div
                      aria-hidden
                      style={{
                        width: 1,
                        height: 16,
                        background: "var(--rule)",
                        marginLeft: 14,
                        marginRight: 14,
                        flexShrink: 0,
                      }}
                    />
                    {regions.map((r) => {
                      const isActive = r.id === activeRegion;
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setActiveRegion(r.id)}
                          aria-pressed={isActive}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "6px 14px",
                            borderRight: "1px solid var(--rule)",
                            opacity: isActive ? 1 : 0.75,
                            background: isActive ? "var(--surface-soft)" : "transparent",
                            boxShadow: isActive ? "inset 0 -2px 0 var(--accent)" : "none",
                            borderTop: "none",
                            borderBottom: "none",
                            borderLeft: "none",
                            cursor: "pointer",
                            color: "var(--fg)",
                            textAlign: "left",
                            whiteSpace: "nowrap",
                            flexShrink: 0,
                          }}
                        >
                          <span
                            aria-hidden
                            style={{
                              width: 16,
                              height: 16,
                              background: r.applied ? r.hex : "transparent",
                              border: "1px solid var(--rule-strong)",
                              borderRadius: "50%",
                              flexShrink: 0,
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            {r.applied && (
                              <span
                                style={{
                                  font: "600 9px/1 var(--sans)",
                                  color: "#fff",
                                  textShadow: "0 0 2px rgba(0,0,0,.6)",
                                }}
                              >
                                ✓
                              </span>
                            )}
                          </span>
                          <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            <span style={regionLabelStyle}>{r.label}</span>
                            <span className="hv-chip-sub" style={{ font: "400 11px/1 var(--sans)", color: "var(--fg-mute)" }}>
                              {r.applied ? r.shade?.name ?? r.hex : "No colour yet"}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setMaskStudioOpen(true)}
                      disabled={!imageDims || masksRemaining <= 0}
                      title={
                        masksRemaining <= 0
                          ? "You can add up to 3 walls"
                          : "Open Mask Studio to draw or edit a wall mask"
                      }
                      style={{
                        marginLeft: "auto",
                        padding: "6px 12px",
                        background: "transparent",
                        border: "1px solid var(--rule-strong)",
                        borderRadius: 6,
                        color: "var(--fg-soft)",
                        opacity: imageDims && masksRemaining > 0 ? 1 : 0.5,
                        whiteSpace: "nowrap",
                        font: "500 12px/1 var(--sans)",
                        cursor: imageDims && masksRemaining > 0 ? "pointer" : "not-allowed",
                        flexShrink: 0,
                      }}
                    >
                      + Add wall
                    </button>
                  </div>
                  {/* Right-edge fade — hints that the chips row scrolls horizontally. */}
                  <span
                    aria-hidden
                    style={{
                      position: "absolute",
                      top: 0,
                      bottom: 0,
                      right: 0,
                      width: 28,
                      pointerEvents: "none",
                      background: "linear-gradient(90deg, transparent, var(--bg))",
                    }}
                  />
                </div>
              </div>

              {/* HOLD-TO-PEEK — press and hold to see the original photo */}
              <button
                type="button"
                onPointerDown={() => setCompare(true)}
                onPointerUp={() => setCompare(false)}
                onPointerLeave={() => setCompare(false)}
                onPointerCancel={() => setCompare(false)}
                onKeyDown={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    setCompare(true);
                  }
                }}
                onKeyUp={(e) => {
                  if (e.key === " " || e.key === "Enter") setCompare(false);
                }}
                onBlur={() => setCompare(false)}
                aria-pressed={compare}
                style={{
                  // Top-right: clear of the control cluster (top-left) and the
                  // two-row palette/chips overlay along the bottom.
                  position: "absolute",
                  top: 20,
                  right: 20,
                  padding: "6px 12px",
                  background: compare ? "var(--accent)" : "var(--bg)",
                  border: "1px solid " + (compare ? "var(--accent)" : "var(--rule-strong)"),
                  borderRadius: 6,
                  color: compare ? "var(--bg)" : "var(--fg-soft)",
                  font: "500 12px/1 var(--sans)",
                  cursor: "pointer",
                  zIndex: 5,
                  userSelect: "none",
                  touchAction: "none",
                }}
              >
                Hold to see original
              </button>
            </>
          )}
          {showCanvasError && (
            <div
              className="field-error"
              role="alert"
              style={{
                position: "absolute",
                top: 20,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 6,
                display: "flex",
                alignItems: "center",
                gap: 12,
                maxWidth: "calc(100% - 48px)",
                background: "var(--bg)",
                border: "1px solid var(--rule-strong)",
                borderRadius: 8,
                padding: "10px 14px",
              }}
            >
              <span>{error}</span>
              {canRetrySegmentation && (
                <button
                  type="button"
                  onClick={() => void handleRetrySegmentation()}
                  style={{
                    padding: "6px 12px",
                    background: "transparent",
                    border: "1px solid var(--rule-strong)",
                    borderRadius: 6,
                    color: "var(--fg-soft)",
                    whiteSpace: "nowrap",
                    font: "500 12px/1 var(--sans)",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  Try again
                </button>
              )}
              <button
                type="button"
                onClick={() => setError(null)}
                aria-label="Dismiss error"
                style={{
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  color: "var(--fg-mute)",
                  font: "500 14px/1 var(--sans)",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                ×
              </button>
            </div>
          )}
          <LoaderOverlay show={uploading || segmenting} label={overlayLabel} hint={overlayHint} />
          {(limitReached || accessExpired || needVerification || needSubscription) && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(0,0,0,0.55)",
                zIndex: 10,
                padding: 24,
              }}
            >
              <div
                style={{
                  maxWidth: 420,
                  background: "var(--bg)",
                  border: "1px solid var(--rule-strong)",
                  padding: 28,
                  textAlign: "center",
                  borderRadius: 10,
                }}
              >
                <Mono brass>
                  {needVerification
                    ? "Verify your account"
                    : needSubscription
                      ? "Subscribe to continue"
                      : accessExpired
                        ? "Access ended"
                        : "Project limit reached"}
                </Mono>
                <p style={{ font: "400 19px/1.5 var(--serif)", color: "var(--fg-soft)", margin: "14px 0 22px" }}>
                  {error ||
                    (needVerification
                      ? "Verify your email and mobile number before creating your project."
                      : needSubscription
                        ? "Your free trial includes one project. Subscribe to a plan to create more."
                        : accessExpired
                          ? "Your access has ended. Ask your retailer for a new code."
                          : "You've used your included project.")}
                </p>
                {needVerification && (
                  <a className="btn btn-brass" href="/dashboard">
                    Verify my account <span className="arr">→</span>
                  </a>
                )}
                {needSubscription && (
                  <a className="btn btn-brass" href="/pricing">
                    See plans <span className="arr">→</span>
                  </a>
                )}
                {limitReached && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "stretch" }}>
                    <Button variant="brass" onClick={() => void handleBuyAndRetry()} disabled={buying}>
                      {buying ? (
                        <>
                          <Spinner size={14} color="currentColor" />
                          <span>Opening payment…</span>
                        </>
                      ) : (
                        <>
                          Buy another project <span className="arr">→</span>
                        </>
                      )}
                    </Button>
                    <Mono>or ask your retailer to add one</Mono>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <ShadeGrid
          selected={active.shade?.code}
          onSelect={onSelectShade}
          onApplyExact={onApplyCustom}
          activeShade={active.shade}
          activeRegionLabel={active.label}
          shades={shades}
          baseHex={active.applied ? active.hex : undefined}
          activeRegionId={activeRegion}
          regions={regionLites}
          onApplyToRegion={applyShadeTo}
          hideCodes={guest}
          onSelectRegion={(id) => setActiveRegion(id)}
          onAddWall={() => setMaskStudioOpen(true)}
          masksRemaining={masksRemaining}
          triedShades={triedByRegion[activeRegion]}
          recentShades={recentShades}
          outdoor={classification === "OUTDOOR"}
          clashNote={clashNote}
        />
      </div>

      {maskStudioOpen && imageUrl && imageDims && (
        <MaskStudio
          imageUrl={imageUrl}
          imageDims={imageDims}
          existing={existingMasks}
          remaining={masksRemaining}
          saving={savingMask}
          onClose={() => setMaskStudioOpen(false)}
          onSave={(mask, category, label) => void handleSaveMask(mask, category, label)}
        />
      )}

      <style>{`
        .hv-vis-topbar {
          display: flex;
          align-items: center;
          gap: 24px;
          padding: 18px 24px;
          border-bottom: 1px solid var(--rule);
          flex-wrap: wrap;
        }
        .hv-visualizer.is-classic .hv-vis-topbar { padding: 12px 16px; gap: 16px; background: var(--surface); }
        .hv-vis-project {
          display: flex;
          gap: 10px;
          align-items: center;
          border-left: 1px solid var(--rule);
          padding-left: 20px;
        }
        .hv-visualizer.is-classic .hv-vis-project { border-left: none; padding-left: 0; }
        /* Lock the working area to a fixed height so the photo never resizes when you
           switch shade tabs. The explicit row gives the panel a DEFINITE height so its
           internal overflow scrolls instead of stretching the row (and the image). */
        .hv-vis-body { height: min(82vh, 820px); grid-template-rows: minmax(0, 1fr); }
        .hv-vis-canvas-wrap { min-height: 0; overflow: hidden; }
        /* Largest breakpoint first: at <=768 the single-column rule below must win
           over the <=1024 two-column rule (equal specificity → source order decides). */
        @media (max-width: 1024px) {
          .hv-vis-body { grid-template-columns: 1fr 320px !important; }
        }
        @media (max-width: 768px) {
          .hv-vis-topbar { gap: 12px; padding: 12px 16px; }
          .hv-vis-project { padding-left: 12px; }
          .hv-vis-body { grid-template-columns: 1fr !important; grid-template-rows: auto auto !important; height: auto !important; }
          .hv-vis-canvas-wrap { min-height: 60vh; }
          /* Keep the photo visible on phones: single-line chips, and the
             palette ticket lives in the Walls tab instead of over the image. */
          .hv-vis-palette { display: none !important; }
          .hv-chip-sub { display: none !important; }
        }
        @media (max-width: 480px) {
          .hv-vis-topbar { padding: 10px 12px; }
          .hv-vis-project { border-left: none; padding-left: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
}

/** Small on/off switch, shared by the clean-up and shadow controls. */
function Toggle({
  on,
  onClick,
  ariaLabel,
}: {
  on: boolean;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={(on ? "Turn off " : "Turn on ") + ariaLabel}
      style={{
        width: 34,
        height: 18,
        position: "relative",
        background: on ? "var(--accent)" : "var(--surface-soft)",
        border: "1px solid " + (on ? "var(--accent)" : "var(--rule-strong)"),
        padding: 0,
        cursor: "pointer",
        borderRadius: 999,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 1,
          ...(on ? { right: 1 } : { left: 1 }),
          width: 14,
          height: 14,
          // --accent === --fg, so a var(--fg) knob vanishes on the "on" (accent)
          // track. Paint the knob with the inverse token so it reads in both states.
          background: on ? "var(--bg)" : "var(--fg)",
          borderRadius: "50%",
        }}
      />
    </button>
  );
}

function DropZone({
  uploading,
  error,
  onChoose,
  onDrop,
}: {
  uploading: boolean;
  error: string | null;
  onChoose: () => void;
  onDrop: (file: File) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  return (
    <div
      onClick={onChoose}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onChoose()}
      onDragEnter={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onDrop(f);
      }}
      role="button"
      tabIndex={0}
      aria-label="Choose a photo"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        cursor: "pointer",
        padding: 40,
        textAlign: "center",
        background: isDragging ? "var(--surface-soft)" : "transparent",
        transition: "background .2s var(--ease)",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 64,
          height: 64,
          border: isDragging ? "1px solid var(--accent)" : "1px dashed var(--rule-strong)",
          borderRadius: 12,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--accent)",
          transition: "border .2s var(--ease)",
        }}
      >
        <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 16V4M6 10l6-6 6 6" />
          <path d="M4 20h16" />
        </svg>
      </span>
      <h2
        style={{
          font: "600 28px/1.2 var(--serif)",
          letterSpacing: "-.02em",
          color: "var(--fg)",
          margin: 0,
          maxWidth: "24ch",
        }}
      >
        {isDragging ? "Drop it here" : "Add a photo of the room"}
      </h2>
      <p style={{ font: "400 15px/1.5 var(--sans)", color: "var(--fg-soft)", maxWidth: "44ch", margin: 0 }}>
        A straight-on photo in daylight works best. JPEG, PNG or WebP, up to 10 MB.
      </p>
      <div
        style={{
          display: "flex",
          gap: 12,
          marginTop: 10,
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <span className="btn">Choose a photo</span>
        <span style={{ font: "400 13px/1 var(--sans)", color: "var(--fg-mute)" }}>or</span>
        {/* Shoot the room on a phone and have it land here. Stop propagation so the
            QR button / modal don't trigger the dropzone's click-to-choose. */}
        <div
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          style={{ display: "inline-flex" }}
        >
          <PhoneHandoff onImage={onDrop} />
        </div>
      </div>

      {uploading && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--accent)" }}>
          <Spinner size={14} color="var(--accent)" />
          <span style={{ font: "500 13px/1 var(--sans)" }}>Uploading…</span>
        </span>
      )}
      {error && (
        <div
          className="field-error"
          role="alert"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            maxWidth: "calc(100% - 48px)",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

function downloadPng(dataUrl: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `huevista-${Date.now()}.png`;
  a.click();
}
