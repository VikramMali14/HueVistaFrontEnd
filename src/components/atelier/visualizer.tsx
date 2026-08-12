"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eyebrow, Mono } from "@/components/ui/eyebrow";
import { Button, LinkButton } from "@/components/ui/button";
import { LoaderOverlay } from "@/components/ui/loader-overlay";
import { Spinner } from "@/components/ui/spinner";
import { type PipelineStage } from "./pipeline-bar";
import { ShadeGrid } from "./shade-grid";
import { CompanyPicker } from "./company-picker";
import { MaskStudio, type ExistingMask } from "./mask-studio";
import { ProjectDetailsGate, type ProjectDetails } from "./project-details-gate";
import type { RegionLite } from "./coordinate-suggestions";
import { PhoneHandoff } from "@/components/shared/phone-handoff";
import { buyOneProject, reopenProjectWithMoney } from "@/lib/payments";
import { PROJECT_VALID_DAYS, validityNote } from "@/lib/project-validity";
import { hexToRgb01, Recolor, regionMeanLuma, type RegionPaint } from "@/lib/webgl-recolor";
import { Canvas2DRecolor } from "@/lib/canvas2d-recolor";
import {
  BRIGHTEN_LEVELS,
  SOFT_EDGE_FEATHER_PX,
  type BrightenLevel,
  type RecolorEngine,
} from "@/lib/recolor-engine";
import {
  PollCancelledError,
  pollUntilSegmented as pollSegmentationStatus,
} from "@/lib/segmentation-polling";
import { api, guestApi, HttpError } from "@/lib/api";
import {
  buildColourBoardPdf,
  canvasToJpegDataUrl,
  downloadBlob,
  type PdfImageEntry,
} from "@/lib/pdf-export";
import { runColourBoardDownload } from "@/lib/colour-board-download";
import { ShareDialog } from "./share-dialog";
import { ReportDialog } from "./report-dialog";
import { IMAGE_ACCEPT, cropAndEncode, imageFileError, loadImageFromFile } from "@/lib/image-upload";
import { lrvCorrectedRgb01, undertoneClash } from "@/lib/color-science";
import { nearestShade } from "@/lib/color";
import { formatLimitSymbol, projectAllowance } from "@/lib/plan-quota";
import { encodeShadeCode, hasScheme, type ShadeCodeScheme } from "@/lib/shade-codes";
import { resolveMediaUrl } from "@/lib/media";
import type {
  MaskReportIssue,
  PaintShade,
  PdfAllowance,
  ProjectDetail,
  RegionCategory,
  RegionColorUpdate,
  RegionDetail,
  RegionKind,
  RetailerCombo,
  SegmentationOptions,
} from "@/lib/types";

interface VisualizerProps {
  /** When set, open this existing project: loads its SAVED masks + cleaned image from
   *  storage instead of re-running segmentation (no extra AI cost). */
  projectId?: string;
  /** Shades fetched server-side from the backend catalogue. */
  shades?: ReadonlyArray<PaintShade>;
  /** Pre-seeded project name (e.g. from the dashboard "New project" form). */
  initialName?: string;
  /** Anonymous guest mode (unlocked with a shop code, no account): CRUD goes to the
   *  guest endpoints, there's no AI auto-segment or share link, and the single
   *  project is owned by the access code. The shop resolves real shade codes. */
  guest?: boolean;
  /** Signed in as ADMIN: shows the testing-only "clean the photo first" toggle
   *  on the photo-confirm step, sent with the segmentation request. The backend
   *  ignores the flag for every other role. */
  isAdmin?: boolean;
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
/**
 * Longest side a photo is shrunk to when it has to be shrunk at all.
 *
 * Generous on purpose. Wall detection and the recolour both work off this
 * picture, so pixels thrown away here are detail lost from the finished room —
 * which is why an oversized photo is RE-COMPRESSED first and only scaled down if
 * that is not enough. 4000px is above what any phone camera needs to be reduced
 * to and well under what makes a browser canvas struggle.
 */
const SHRINK_MAX_DIM = 4000;
const MAX_CUSTOM_MASKS = 3;

// Render options fixed at their best-looking values — they used to be
// user-facing toggles in the floating bar, but the popup overwhelmed people
// at the counter, so only Brighten stays interactive:
//  - shadows ON (85%): the paint follows the photo's own light;
//  - soft edges OFF: crisp borders, no feathering;
//  - edge nudge +1px: masks tend to sit slightly inside the real surface,
//    so growing every painted edge a touch hides unpainted seams.
const SHADOW_ON = true;
const SHADOW_STRENGTH = 0.85;
const SOFT_EDGE_ON = false;
const EDGE_NUDGE_PX = 1;
/**
 * Most coloured snapshots one downloadable PDF may hold, used ONLY until the plan's real
 * figure arrives (`pdfAllowance.imagesPerPdf`).
 *
 * Deliberately the SMALLEST cap any tier carries, not the largest. The allowance fetch
 * fails silently by design — the server still gates the download — but a fallback above
 * the floor spends that silence in the wrong direction: a shop on a 4-image plan would be
 * invited to build an 8-image board and only find the ceiling at the download, after the
 * work. Guessing low is recoverable (the real, higher cap lands a moment later); guessing
 * high is not.
 */
const MAX_PDF_PAGES = 4;

const DEFAULT_REGIONS: ReadonlyArray<RegionState> = [
  { id: "main", kind: "MAIN_WALL", label: "Main wall", hex: "#e8d5b0" },
  { id: "accent", kind: "ACCENT_WALL", label: "Accent wall", hex: "#b0603e" },
  { id: "trim", kind: "TRIM", label: "Trim & frames", hex: "#4a362a" },
];

const CATEGORY_TO_KIND: Record<RegionCategory, RegionKind> = {
  MAIN_WALL: "MAIN_WALL",
  ACCENT_WALL: "ACCENT_WALL",
  OTHER_WALL: "ACCENT_WALL",
  TRIM: "TRIM",
  MANUAL: "MANUAL",
};

// Fallback swatches used only when the backend hasn't supplied an appliedHexCode
// (e.g. the pre-upload placeholders and hand-drawn masks). Auto-detected regions
// arrive already painted with the scene's reference colour from segmentation, so
// main/accent/trim mirror the backend's exterior reference palette here
// (SegmentationService#defaultHexFor MUST stay in sync): the project opens with
// a Cashmere Beige body, a Burnt Sienna feature wall and Dark Clove trim rather
// than a flat all-white house.
const DEFAULT_HEX_FOR_KIND: Record<RegionKind, string> = {
  MAIN_WALL: "#e8d5b0",   // Cashmere Beige (0342)
  ACCENT_WALL: "#b0603e", // Burnt Sienna (6118)
  TRIM: "#4a362a",        // Dark Clove (8511)
  MANUAL: "#ffffff",
};

// One name per surface, matching RegionCategory.getDefaultLabel() on the backend.
// These are the placeholders shown BEFORE a photo, and detection replaces them
// with the backend's own labels — so any disagreement shows up as the walls
// renaming themselves the moment the AI finishes ("Border" became "Trim &
// Frames" mid-flow).
const KIND_LABEL: Record<RegionKind, string> = {
  MAIN_WALL: "Main wall",
  ACCENT_WALL: "Accent wall",
  TRIM: "Trim & frames",
  MANUAL: "Wall",
};

// The paint company the opening 3-colour scheme is locked to. A freshly
// segmented exterior opens painted with the backend's fixed reference hexes;
// we snap those to REAL catalogue shades from this ONE company so the house
// never opens on a colour the shop can't sell, and never mixes two brands
// across main/accent/trim. Falls back to the catalogue's best-stocked brand
// when a shop doesn't carry this one (see pickOpeningBrand).
const OPENING_BRAND = "Asian Paints";

/**
 * The single company the opening scheme should draw from: OPENING_BRAND when the
 * catalogue stocks it, otherwise the brand with the most shades (always ONE
 * real, well-stocked company — never a mix). Undefined only for an empty catalogue.
 */
export function pickOpeningBrand(catalogue: ReadonlyArray<PaintShade>): string | undefined {
  if (catalogue.some((s) => s.brand === OPENING_BRAND)) return OPENING_BRAND;
  const counts = new Map<string, number>();
  for (const s of catalogue) counts.set(s.brand, (counts.get(s.brand) ?? 0) + 1);
  let best: string | undefined;
  let bestN = 0;
  for (const [brand, n] of counts) {
    if (n > bestN) {
      best = brand;
      bestN = n;
    }
  }
  return best;
}

function mapBackendRegion(
  region: RegionDetail,
  catalogue: ReadonlyArray<PaintShade>,
  openingBrand?: string,
): RegionState {
  const kind = CATEGORY_TO_KIND[region.category] ?? "MANUAL";
  const fallback = KIND_LABEL[kind];
  const hasColor = Boolean(region.appliedHexCode || region.appliedShadeCode);
  let hex = region.appliedHexCode || DEFAULT_HEX_FOR_KIND[kind];
  // Re-attach the catalogue shade: the saved row keeps only code + hex, but
  // LRV-true painting needs the shade's measured LRV back. Match by the saved
  // shade code first, then by exact hex (covers the auto-detected regions,
  // whose reference colours are catalogue shades applied by hex alone).
  let shade =
    (region.appliedShadeCode
      ? catalogue.find((s) => s.code === region.appliedShadeCode)
      : undefined) ??
    catalogue.find((s) => s.hex.toLowerCase() === hex.toLowerCase());

  // Opening scheme: an auto-detected region still carrying the backend's default
  // reference hex (no saved shade code) is the untouched "colour on create" —
  // snap it to the nearest shade from the single opening brand so every opening
  // colour is a real, same-company catalogue shade. Deterministic, so reopening
  // reproduces the same shades with nothing persisted; once the user picks a
  // real shade (appliedShadeCode set) this no longer fires.
  const isOpeningDefault =
    kind !== "MANUAL" &&
    hasColor &&
    !region.appliedShadeCode &&
    hex.toLowerCase() === DEFAULT_HEX_FOR_KIND[kind].toLowerCase();
  if (isOpeningDefault && openingBrand) {
    const snapped = nearestShade(hex, catalogue.filter((s) => s.brand === openingBrand));
    if (snapped) {
      shade = snapped;
      hex = snapped.hex;
    }
  }
  return {
    id: `r-${region.id}`,
    backendId: region.id,
    kind,
    label: region.label || fallback,
    hex,
    shade,
    // Reopened projects render every saved colour at once, not just one wall.
    applied: hasColor,
    // "Manual" survives reload via the backend's explicit flag; fall back to the
    // category for older rows saved before the flag existed.
    custom: region.manual === true || kind === "MANUAL",
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

/**
 * How one extra project is being paid for. Points are a balance debit with no checkout;
 * money opens Razorpay, which the buyer can close without paying. Both buy exactly the
 * same thing, and both are offered here because this is the only place a project is sold.
 */
type PayRail = "points" | "money";

/** How long a share link stays live — the same 10 days a walk-in access code gets. */
const SHARE_VALID_DAYS = 10;

export function Visualizer({ projectId: openProjectId, shades, initialName, guest = false, isAdmin = false }: VisualizerProps) {
  // Guest mode swaps the CRUD calls to the access-code-scoped endpoints. Signatures
  // match the user `api`, so the rest of the flow is identical. User-only calls
  // (segmentation, share) are guarded by `!guest` at their call sites.
  const router = useRouter();
  const uploadImageCall = guest ? guestApi.uploadImage : api.uploadImage;
  const createProjectCall = guest ? guestApi.createProject : api.createProject;
  const getProjectCall = guest ? guestApi.getProject : api.getProject;
  const updateRegionColorsCall = guest ? guestApi.updateRegionColors : api.updateRegionColors;
  const createCustomMaskCall = guest ? guestApi.createCustomMask : api.createCustomMask;
  const updateRegionMaskCall = guest ? guestApi.updateRegionMask : api.updateRegionMask;
  const deleteRegionCall = guest ? guestApi.deleteRegion : api.deleteRegion;
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
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
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  // True when the canvas is the backend's CLEANED image (paintable surfaces
  // repainted fresh white). Enables scene-light anchored shading: the paint
  // follows the photo's own light — an evening shot stays an evening shot —
  // instead of brightening every wall up to the swatch's showroom colour.
  const [canvasCleaned, setCanvasCleaned] = useState(false);
  const [classification, setClassification] = useState<"INDOOR" | "OUTDOOR" | "UNKNOWN" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [regions, setRegions] = useState<RegionState[]>(() =>
    [...DEFAULT_REGIONS],
  );
  const [activeRegion, setActiveRegion] = useState<string>(regions[0]!.id);
  const [compare, setCompare] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(initialName ?? null);
  const [projectRoom, setProjectRoom] = useState<string | null>(null);
  // View-only: the subscription has ended, or this project's own paid validity ran
  // out. The room and the colours last applied to it still render exactly as they
  // were — what stops is CHANGING them. Held here rather than derived per-render so
  // the colour handlers can refuse before touching the canvas: letting the paint land
  // locally and only failing on the autosave shows the user a colour that isn't saved
  // and won't be there next time.
  // The shop hides paint names everywhere a colour appears — studio, dock, PDF board.
  const [hideNames, setHideNames] = useState(false);
  const [viewOnly, setViewOnly] = useState(false);
  const [viewOnlyReason, setViewOnlyReason] = useState<string | null>(null);
  /**
   * Opening a project named in the URL failed. "notFound" is a 404/400 — the id
   * names nothing this account can open; "error" is anything else (a 5xx, a
   * network blip), which is worth retrying rather than abandoning.
   */
  const [openFailed, setOpenFailed] = useState<"notFound" | "error" | null>(null);
  /**
   * The job is finished. A superset of viewOnly rather than a flavour of it: closing
   * makes a project read-only, but a read-only project is not necessarily closed — it
   * may just have run out of days. The two want opposite things said to the customer,
   * so the studio has to be able to tell them apart.
   */
  const [closed, setClosed] = useState(false);
  const [unlockedShadeCodes, setUnlockedShadeCodes] = useState<string[]>([]);
  const [boardsUsed, setBoardsUsed] = useState(0);
  const [boardsAllowed, setBoardsAllowed] = useState(0);
  const [reopenPoints, setReopenPoints] = useState(0);
  const [reopenPaiseForProject, setReopenPaiseForProject] = useState(0);
  const [reopening, setReopening] = useState<"points" | "money" | null>(null);
  const [segmenting, setSegmenting] = useState(false);
  const [masksReady, setMasksReady] = useState(false);
  // Guest AI is billed to the shop; when the shop is out of credits we silently
  // fall back to manual wall-marking and show this gentle note (guests only).
  const [guestAiUnavailable, setGuestAiUnavailable] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [limitReached, setLimitReached] = useState(false);
  // A customer a SHOP onboarded has run out. Their projects were assigned and paid for
  // by that shop, which can add another in one click — so this gate asks the shop rather
  // than selling them one, which would take money for something the shop already owns.
  const [askRetailer, setAskRetailer] = useState(false);
  const [asking, setAsking] = useState<"idle" | "sending" | "sent">("idle");
  // What buying costs THIS account, so the gate quotes a real figure rather than a
  // hardcoded one that drifts from configuration. Best-effort: absent just means the
  // button says "Buy a project" with no price.
  const [purchaseOptions, setPurchaseOptions] =
    useState<import("@/lib/types").ProjectPurchaseOptions | null>(null);
  // Mount-time clock, so the "open until <date>" the purchase prompt quotes is stable
  // across renders rather than moving a millisecond at a time under the buyer.
  const [mountedAt] = useState(() => Date.now());
  // The point price list, so the out-of-quota prompts quote configuration rather than
  // a hardcoded number. 403 for a customer account, which is why it is best-effort.
  const [points, setPoints] =
    useState<import("@/lib/types").RewardPointsSummary | null>(null);
  const [accessExpired, setAccessExpired] = useState(false);
  // Retailer funnel gates (distinct from the customer entitlement ones above):
  // verification required before the first project, and "subscribe to a plan".
  const [needVerification, setNeedVerification] = useState(false);
  const [needSubscription, setNeedSubscription] = useState(false);
  // Retailer project-quota gate (402 PROJECT_LIMIT_REACHED): the month's projects
  // are spent — offer buy-one-more right in the overlay, at the plan's own rate.
  // There is no sibling auto-mask refusal any more: one project covers the clean-up
  // and the wall detection, so a run that can start can always finish.
  const [projectLimitReached, setProjectLimitReached] = useState(false);
  // Which rail a purchase is running on, so the two buttons can show their own spinner
  // and neither can be clicked while the other is mid-flight.
  const [buying, setBuying] = useState<PayRail | null>(null);
  const [buyingProject, setBuyingProject] = useState<PayRail | null>(null);
  const [pendingImageId, setPendingImageId] = useState<string | null>(null);
  // A photo the user has picked/received but NOT yet confirmed. While set, we show
  // a local preview with a Continue/Choose-different prompt; no upload, no
  // classification and no (billable) segmentation runs until the user confirms.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  // Per-run segmentation choices sent with every request so a retry keeps them.
  // maskMode is a real product choice (every signed-in role): AUTO = AI wall
  // detection after the compulsory clean-up, MANUAL = stop after the clean-up and
  // mark walls by hand. Both cost the same — one project — so this is about which
  // result the shop wants, not which one it can afford.
  // cleanImage is the ADMIN-only testing knob (backend strips it otherwise).
  // Masks are always stored raw — exactly as the model painted them.
  const [segOptions, setSegOptions] = useState<SegmentationOptions>({
    cleanImage: true,
    maskMode: "AUTO",
  });
  // The project quota, shown in the topbar so the cost is visible at the moment it's
  // spent. One project covers the whole automatic pipeline — clean-up and wall
  // detection — and everything after it (trying shades, recolouring, palettes) is
  // free. Null hides the pill: guests (the shop's budget, not theirs), customers
  // (no subscription → 404) and fetch failures.
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null);
  /**
   * The paint companies the whole colour panel is scoped to (empty = every
   * company the caller may see).
   *
   * It lives up here, in the topbar beside Share and Download, rather than inside
   * the Colours tab. As a filter buried in that tab's drawer it only narrowed the
   * catalogue grid: a counter who had picked one company still got AI palettes,
   * coordinate pairings and nearest-matches drawn from every other one, and the AI
   * tab carried a SECOND company filter with its own separate answer. Choosing a
   * company is a statement about the whole session — "this is what we sell" — so it
   * is asked once, at the top, and every tab below is handed the scoped list.
   *
   * Several companies can be in play at once: a shop that stocks two or three
   * brands was previously made to pick one and lose the rest, or open up to
   * every brand including the ones it cannot order.
   */
  const [companies, setCompanies] = useState<ReadonlyArray<string>>([]);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  // The share sheet's own open state and error, kept apart from the studio's global
  // `error` banner: a link that failed to mint belongs in the sheet the person is
  // looking at, not behind it.
  const [shareOpen, setShareOpen] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  // Guest "I'm done" hand-off to the issuing shop (guest mode only).
  const [sentToShop, setSentToShop] = useState(false);
  const [sendingToShop, setSendingToShop] = useState(false);
  // Inline rename in the topbar (signed-in users with a saved project).
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  // Set when Escape cancels the edit so the input's blur doesn't commit it.
  const skipRenameCommitRef = useRef(false);
  const [imageDims, setImageDims] = useState<{ w: number; h: number } | null>(null);
  // Step 0 — project details captured before anything is created on the backend.
  const [details, setDetails] = useState<ProjectDetails | null>(
    initialName ? { name: initialName } : null,
  );
  // "Brighten" — whole-image light lift for photos shot in dim light, so
  // colours can be judged as on a sunnier day. Three fixed levels (Original /
  // Soft glow / Radiant, see BRIGHTEN_LEVELS); Original (untouched) default.
  const [brighten, setBrighten] = useState<BrightenLevel["id"]>("original");
  // "Report a problem" — the channel for an AI run that came out visibly wrong.
  // Nothing server-side can spot that: a run with the walls in the wrong places
  // still returns SEGMENTED, so the person looking at their room is the only
  // source. `reported` keeps the button honest after a send so the same
  // complaint isn't fired twice by someone unsure it landed.
  const [reportOpen, setReportOpen] = useState(false);
  const [reported, setReported] = useState(false);
  // Manual mask studio.
  const [maskStudioOpen, setMaskStudioOpen] = useState(false);
  // When set, the studio is REFINING this region's existing mask (AI or hand-drawn)
  // rather than drawing a new wall; null = the "add a wall" flow.
  const [editingRegionId, setEditingRegionId] = useState<string | null>(null);
  const [savingMask, setSavingMask] = useState(false);
  // Per-region history of catalogue shades the user tried (newest first, max 5).
  const [triedByRegion, setTriedByRegion] = useState<Record<string, PaintShade[]>>({});
  // Project-wide history (newest first, max 10) — "that pink from before".
  const [recentShades, setRecentShades] = useState<PaintShade[]>([]);
  // The shop's suggested combinations ("shop picks") for the AI Suggest tab —
  // resolved server-side for whoever is visualising (retailer staff, entitled
  // customer, or guest). Empty (section hidden) when there's no shop to show.
  const [shopCombos, setShopCombos] = useState<RetailerCombo[]>([]);
  // The shop's shade-code scheme. Guests see codes ENCODED with it (instead of
  // no codes at all), so the counter reads the shade straight off their screen.
  const [codeScheme, setCodeScheme] = useState<ShadeCodeScheme | null>(null);
  // Whether the shop's scheme has been ASKED FOR yet, distinct from whether it has one.
  // The fetch is async, so for the first paint the two are indistinguishable — and
  // guessing "no scheme" there printed the manufacturer's real codes on screen for a
  // moment before they were replaced. That flash is the whole thing a shop runs its own
  // codes to prevent, and a customer only has to see it once.
  const [schemeLoaded, setSchemeLoaded] = useState(false);

  // "Add to PDF" colour board: snapshots of the recoloured canvas, each with the
  // shades applied on it, downloadable as one PDF. How many images one board may
  // hold and how many downloads remain this month come from the plan that pays
  // for this studio (the retailer's own, or the issuing shop's for guests).
  const [pdfPages, setPdfPages] = useState<PdfImageEntry[]>([]);
  // Transient hint under the Add button ("apply a colour first", "board full").
  const [pdfNotice, setPdfNotice] = useState<string | null>(null);
  const [pdfAllowance, setPdfAllowance] = useState<PdfAllowance | null>(null);
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [closing, setClosing] = useState(false);
  // Plan-driven page cap, falling back to the historical constant when the
  // allowance hasn't loaded (or an older backend doesn't serve it yet).
  const maxPdfPages = pdfAllowance ? Math.max(1, pdfAllowance.imagesPerPdf) : MAX_PDF_PAGES;

  // True when the (last loaded) project ran in MANUAL mask mode — the clean-up
  // finished but walls are the user's to mark, so notices must not claim the AI
  // detected anything.
  const [manualMaskProject, setManualMaskProject] = useState(false);
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

  // Shop picks load once, and only after a room photo is up — the section is
  // hidden before then, so visitors who never upload never trigger the request.
  // Best-effort: the section simply hides on failure.
  const shopCombosRequestedRef = useRef(false);
  useEffect(() => {
    if (!imageUrl || shopCombosRequestedRef.current) return;
    shopCombosRequestedRef.current = true;
    let cancelled = false;
    api.getRetailerCombos()
      .then((combos) => {
        if (!cancelled && Array.isArray(combos)) setShopCombos(combos);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  // The shade-code scheme only changes what GUESTS see, so only guests fetch it.
  // Best-effort: on failure codes just stay hidden, exactly as without a scheme.
  useEffect(() => {
    let cancelled = false;
    // Everyone under the shop, not only guests. A shop that builds its own numbering is
    // replacing the manufacturer's, so its staff, its painters and its customers all have
    // to be reading the same codes the counter reads — fetching this for guests alone
    // meant the one pattern the shop defined appeared on exactly one screen.
    // One endpoint for everyone: it resolves the shop from whoever is asking — the
    // caller's own org, their retailer's, or the shop that issued their guest code.
    if (!guest) {
      api.getProjectPurchaseOptions()
        .then((o) => !cancelled && setPurchaseOptions(o))
        .catch(() => {});
      api.getRewardPoints()
        .then((pts) => !cancelled && setPoints(pts))
        .catch(() => {});
    }
    api.getMyShadeCodeScheme()
      .then((scheme) => {
        if (cancelled) return;
        if (hasScheme(scheme)) setCodeScheme(scheme);
        // showNames is a shop-wide switch, independent of whether a pattern is set:
        // a shop can hide paint names without running its own codes.
        setHideNames(scheme?.showNames === false);
      })
      // Settled either way: a failed lookup must not leave codes hidden forever, or a
      // shop with no scheme at all would never see a code again.
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setSchemeLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [guest]);

  const projectPrice = purchaseOptions?.projectPricePoints ?? null;
  /**
   * The cash reopen price, taken from the PROJECT first and the account quote only as a
   * fallback.
   *
   * Reopening stopped having one price when closing arrived: a lapsed window is ₹9 and a
   * closed project ₹99. The account-level quote knows the buyer, not the room, so it can
   * only ever answer with the lapsed rate — which on a closed project would have put ₹9
   * on the banner and then had the payment refuse to match it.
   */
  const reopenPaise = reopenPaiseForProject || (purchaseOptions?.reopenPricePaise ?? 0);
  // Spendable points. Zero until the options land — and permanently zero for a customer,
  // who cannot hold points at all, which is what keeps the points rail from being
  // offered to someone the backend would refuse.
  const pointsBalance = purchaseOptions?.pointsBalance ?? 0;
  // Whether the account may use points AT ALL, which is a different question from whether
  // it holds enough. The balance answers both today only because a customer's is always
  // zero — an accident of the data, not a rule, and one a stray non-zero balance on a
  // non-retailer account would quietly break. The server states the rule; absent (an
  // older backend) falls back to the balance alone, exactly as before.
  const pointsRailOpen = purchaseOptions?.pointsEligible !== false;
  // Whether the points rail can actually pay for a project right now. Until the options
  // land the price is unknown, and offering a rail we cannot price is how the button
  // ended up reading "Buy a project ·  points".
  const canPayProjectWithPoints =
    purchaseOptions !== null && pointsRailOpen
    && pointsBalance >= purchaseOptions.projectPricePoints;
  // The cash price of one project, at this account's tier. Zero until the options land,
  // which is what hides the card button rather than showing "or pay ₹0".
  const projectPaise = purchaseOptions?.projectPricePaise ?? 0;
  // Quoted on the out-of-quota prompt. The rate falls with the shop's plan, so it is
  // read from the server; the fallback is the dearest (no-plan) rate, which is the safe
  // direction to guess in and keeps a button from reading "Spend  points".
  const projectPointPrice = points?.projectPrice ?? purchaseOptions?.projectPricePoints ?? 80;
  // What the buyer is actually getting, stated before they pay rather than discovered
  // afterwards: the window is days from the purchase, so it is quoted as both a length
  // and a date. Recomputed only when the served window changes — the mount-time clock
  // keeps the render pure.
  const projectValidityNote = useMemo(
    () => validityNote(purchaseOptions?.validDays ?? PROJECT_VALID_DAYS, mountedAt),
    [purchaseOptions?.validDays, mountedAt],
  );

  // With a scheme, encoded codes replace the manufacturer's everywhere they appear.
  const encodeCode = useMemo(
    () => (codeScheme ? (code: string) => encodeShadeCode(codeScheme, code) : undefined),
    [codeScheme],
  );

  // Raw codes are withheld from guests always, and from everyone once the shop has a
  // pattern — `encodeCode` then supplies what is shown in their place.
  // Withheld from guests always, from everyone once the shop has a pattern — and from
  // everyone while we still don't know, because the only safe way to be wrong here is to
  // show nothing. `encodeCode` supplies what appears in their place.
  const hideRawCodes = guest || !schemeLoaded || Boolean(codeScheme);

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

    // Prepare mask edges before painting — each is a no-op unless the
    // matching control changed since the engine last rendered: "edge nudge"
    // grows or shrinks every boundary uniformly, "soft edges" feathers them
    // inward.
    rc.setEdgeOffset?.(EDGE_NUDGE_PX);
    rc.setMaskFeather?.(SOFT_EDGE_ON ? SOFT_EDGE_FEATHER_PX : 0);

    // Brighten lifts the whole scene (photo AND paint). Hold-to-compare shows
    // the TRUE original — unbrightened — so the before/after is honest.
    const brightenGamma = BRIGHTEN_LEVELS.find((l) => l.id === brighten)?.gamma ?? 1;
    rc.setBrightness?.(compare ? 1 : brightenGamma);

    (async () => {
      if (compare) {
        rc.renderBase();
        return;
      }
      // Fetch every painted region's mask in PARALLEL — awaiting them one by
      // one serialised the network round-trips, so reopening a project with
      // several walls waited masks × latency before the first painted frame.
      const applied = regions.filter((r) => r.applied);
      const masks = await Promise.all(
        applied.map(async (r): Promise<HTMLImageElement | HTMLCanvasElement | null> => {
          // Narrow to img/canvas (both valid as a GL texture AND for 2D sampling).
          if (r.maskCanvas) return r.maskCanvas;
          if (!r.maskUrl) return null;
          try {
            return await loadMask(r.maskUrl);
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) return;
      const paints: RegionPaint[] = [];
      for (let i = 0; i < applied.length; i++) {
        const r = applied[i]!;
        const mask = masks[i];
        if (!mask) continue;
        let baseL = 0;
        if (SHADOW_ON) {
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
          // Catalogue shades paint at their MEASURED brightness: the hex's hue
          // with its luminance corrected to the shade's LRV, so a wall reads
          // as light or dark as the real paint would. Colour-wheel picks have
          // no shade (no LRV) and paint the raw hex, unchanged.
          target: r.shade ? lrvCorrectedRgb01(r.hex, r.shade.lrv) : hexToRgb01(r.hex),
          preserve: SHADOW_ON ? SHADOW_STRENGTH : 0,
          baseL,
          anchor: canvasCleaned,
        });
      }
      if (cancelled) return;
      rc.renderRegions(paints);
    })();

    return () => {
      cancelled = true;
    };
  }, [regions, imageUrl, compare, brighten, canvasCleaned, loadMask]);

  useEffect(() => {
    return () => {
      if (pollAbortRef.current) pollAbortRef.current.cancelled = true;
    };
  }, []);

  // Load the project count on entry and re-read it after anything that can spend (or
  // refund) a credit. Best-effort: any failure just hides the pill — the backend
  // remains the authority on every charge.
  const refreshQuota = useCallback(() => {
    if (guest) return;
    api
      .getCurrentSubscription()
      .then((s) => {
        if (s?.status === "ACTIVE") {
          setQuota({
            used: s.projectsUsed,
            // Bought extras and projects carried over from a replaced plan are both
            // spendable, so the pill counts them in — one that showed only the plan's
            // own allowance would read "full" with runs still in hand.
            limit: projectAllowance(s),
          });
        } else {
          setQuota(null);
        }
      })
      .catch(() => setQuota(null));
  }, [guest]);

  useEffect(() => {
    refreshQuota();
  }, [refreshQuota]);

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
          setCanvasCleaned(Boolean(detail.cleanedImageUrl));
          setImageDims({ w: img.naturalWidth, h: img.naturalHeight });
        } catch (err) {
          if (process.env.NODE_ENV !== "production") {
            console.warn("Failed to load cleaned image, keeping local preview:", err);
          }
        }
      }
      if (detail.name) setProjectName(detail.name);
      if (detail.roomType) setProjectRoom(detail.roomType);
      if (detail.sentToShopAt) setSentToShop(true);
      // A fresh run has landed on the canvas, so an earlier report was about a
      // different one — the button goes back to being pressable.
      setReported(false);
      setViewOnly(Boolean(detail.readOnly));
      setViewOnlyReason(detail.readOnlyReason ?? null);
      setReopenPoints(detail.reopenPricePoints ?? 0);
      setReopenPaiseForProject(detail.reopenPricePaise ?? 0);
      setClosed(Boolean(detail.closedAt));
      setBoardsUsed(detail.boardsUsed ?? 0);
      setBoardsAllowed(detail.boardsAllowed ?? 0);
      // MANUAL-mode projects arrive SEGMENTED with zero auto regions — the
      // cleaned canvas is the deliverable and the user marks walls by hand.
      setManualMaskProject(detail.maskMode === "MANUAL");
      const openingBrand = pickOpeningBrand(shades ?? []);
      const mapped = detail.regions
        .slice()
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
        .map((r) => mapBackendRegion(r, shades ?? [], openingBrand));
      if (mapped.length > 0) {
        setRegions(mapped);
        setActiveRegion(mapped[0]!.id);
      }
    },
    [shades],
  );

  // Open an existing project: fetch it and render its SAVED cleaned image + masks from
  // storage (S3/local). This does NOT call segmentation again — the masks are reused,
  // so there is no extra AI/Replicate cost when revisiting a project.
  useEffect(() => {
    if (!openProjectId) return;
    let cancelled = false;
    (async () => {
      setError(null);
      setOpenFailed(null);
      setUploading(true);
      try {
        const detail = await getProjectCall(openProjectId);
        if (cancelled) return;
        setProjectId(detail.id);
        await applyProjectDetail(detail);
        if (cancelled) return;
        setStage("recolor");
        setMasksReady(true);
        // Whatever was reported was reported about a DIFFERENT room.
        setReported(false);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof HttpError && err.status === 401) {
          window.location.href = "/sign-in?next=/dashboard";
          return;
        }
        // A project that cannot be opened needs its own screen, not the error
        // strip. Both surfaces that render `error` are conditioned on there being
        // a photo or a dropzone, and opening a project by id has neither — so a
        // ?project= pointing at nothing showed a working, empty, "Untitled
        // project" studio and said nothing at all about why.
        setOpenFailed(
          err instanceof HttpError && (err.status === 404 || err.status === 400)
            ? "notFound"
            : "error",
        );
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
      // Wall detection is two generative model calls back to back (image
      // clean + colour-coded mask), each of which the backend allows up to
      // ~3 minutes — plus a retry when the first generation is a dud. The
      // library default of 90s gave up on slow-but-successful runs AFTER the
      // AI credit was spent; this deadline covers the backend's worst case,
      // and genuine failures still surface early via status FAILED.
      timeoutMs: 480_000,
    });
  }, [guest]);

  // Type only. The size cap is not a validation any more — an oversized photo is
  // shrunk in selectFile rather than refused, so there is nothing here for the
  // user to fix and nothing to tell them about.
  const validateFile = useCallback((file: File): string | null => imageFileError(file), []);

  // Create the project + run segmentation for an already-uploaded image. Extracted so it
  // can be retried after the customer buys an extra project. Surfaces the new
  // entitlement errors: 402 = allowance used, 403 = access window expired.
  const createAndSegment = useCallback(
    async (imageId: string) => {
      setError(null);
      // A new run is a new thing to judge. Without this the "Reported — thank you"
      // acknowledgement from an earlier room survives into every later one in the
      // session, and takes the button with it.
      setReported(false);
      setLimitReached(false);
      setAccessExpired(false);
      setNeedVerification(false);
      setNeedSubscription(false);
      setProjectLimitReached(false);
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
        } else {
          // The shop's choice, full stop. This used to be overridden to MANUAL when the
          // auto-mask allowance was spent; a project now covers both steps, so there is
          // nothing left to fall back from.
          const maskMode = segOptions.maskMode;
          await api.requestSegmentation(
            project.id,
            isAdmin ? { ...segOptions, maskMode } : { maskMode },
          );
          const segmented = await pollUntilSegmented(project.id);
          await applyProjectDetail(segmented);
          setMasksReady(true);
        }
      } catch (err) {
        if (err instanceof PollCancelledError) {
          // Superseded by a newer poll or the component unmounted — not an error.
          return;
        }
        if (err instanceof HttpError && err.status === 401) {
          setError("Your session expired. Please sign in again.");
          setTimeout(() => {
            window.location.href = "/sign-in?next=/studio";
          }, 1200);
        } else if (err instanceof HttpError && err.status === 402) {
          // Retailer gates (coded): subscribe / monthly projects spent — vs the
          // customer "ask your shop" and "buy one extra project" fallbacks.
          if (err.code === "SUBSCRIPTION_REQUIRED") setNeedSubscription(true);
          else if (err.code === "PROJECT_LIMIT_REACHED") setProjectLimitReached(true);
          else if (err.code === "ASK_RETAILER") setAskRetailer(true);
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
        refreshQuota(); // segmentation charges on success / refunds on failure
      }
    },
    [pollUntilSegmented, applyProjectDetail, details, guest, createProjectCall, refreshQuota, isAdmin, segOptions],
  );

  // Pick / receive a photo (file picker, drag-drop, or phone hand-off) and show it
  // as a LOCAL preview only. Nothing is sent to the backend here — no upload, no
  // classification, no segmentation — so choosing the wrong photo never costs an
  // AI call. The user confirms via confirmSelection() before any of that runs.
  const selectFile = useCallback(
    async (picked: File) => {
      setError(null);
      const validation = validateFile(picked);
      if (validation) {
        setError(validation);
        return;
      }
      // A photo off a modern phone is routinely over the limit, and being told
      // "larger than 10 MB, use a smaller copy" at a counter meant the customer's
      // room simply could not be opened — the shopkeeper had no way to make a
      // smaller copy on the spot. The browser can, so it does: re-encode, scaling
      // down only if compression alone is not enough. Untouched when it already
      // fits, so nothing that worked before is degraded.
      let file = picked;
      if (picked.size > MAX_UPLOAD_BYTES) {
        try {
          const source = await loadImageFromFile(picked);
          file = await cropAndEncode(
            source,
            { x: 0, y: 0, width: source.naturalWidth, height: source.naturalHeight },
            { maxDim: SHRINK_MAX_DIM, maxBytes: MAX_UPLOAD_BYTES, filename: picked.name },
          );
        } catch {
          setError("That photo is too large to open on this device. Try one taken at a smaller size.");
          return;
        }
        if (file.size > MAX_UPLOAD_BYTES) {
          setError("That photo is too large even after shrinking. Try one taken at a smaller size.");
          return;
        }
      }
      try {
        const localUrl = URL.createObjectURL(file);
        const img = await loadImage(localUrl);
        srcImgRef.current = img;
        recolorRef.current?.setImage(img);
        recolorRef.current?.renderBase();
        setCanvasCleaned(false); // raw local photo — not the cleaned canvas
        setImageUrl((prev) => {
          if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
          return localUrl;
        });
        setImageDims({ w: img.naturalWidth, h: img.naturalHeight });
        setPendingFile(file);
        // Still on the upload step — nothing created on the backend yet.
        setStage("upload");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not open the image.");
      }
    },
    [validateFile],
  );

  // User confirmed the previewed photo. THIS is the first point any billable
  // backend / AI call happens: upload + classify, then create the project and
  // request segmentation.
  const confirmSelection = useCallback(async () => {
    const file = pendingFile;
    if (!file) return;
    setUploading(true);
    setMasksReady(false);
    setProjectId(null);
    setSaveStatus("idle");
    maskCacheRef.current.clear();
    baseLumaRef.current.clear();
    try {
      setStage("clean");
      const uploaded = await uploadImageCall(file);
      if (!uploaded?.imageId) {
        throw new Error("Upload failed. Please try again.");
      }
      // The photo is safely on the backend — only now is the confirm step done.
      // (createAndSegment reports its own failures and offers its own retries.)
      setPendingFile(null);
      setClassification(uploaded.imageType);
      setPendingImageId(uploaded.imageId);
      setStage("mask");

      await createAndSegment(uploaded.imageId);
    } catch (err) {
      // Upload failed: return to the confirm step with the photo still pending,
      // so "Continue with this image" retries without re-picking the file.
      setStage("upload");
      if (err instanceof HttpError && err.status === 401) {
        setError("Your session expired. Please sign in again.");
        setTimeout(() => {
          window.location.href = "/sign-in?next=/studio";
        }, 1200);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Something went wrong.");
      }
    } finally {
      setUploading(false);
    }
  }, [pendingFile, createAndSegment, uploadImageCall]);

  // Discard the previewed photo without sending anything to the backend, and
  // return to the upload drop-zone so the user can pick or re-scan another.
  const chooseDifferent = useCallback(() => {
    setPendingFile(null);
    setError(null);
    srcImgRef.current = null;
    setImageDims(null);
    setStage("upload");
    setCanvasCleaned(false);
    setImageUrl((prev) => {
      if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  // "Try again" after a wall-detection timeout/failure: re-runs segmentation on
  // the ALREADY-created project, so the customer never re-uploads the photo.
  const handleRetrySegmentation = useCallback(async (forcedMaskMode?: "AUTO" | "MANUAL") => {
    if (!projectId) return;
    setError(null);
    // A re-run is a fresh result to judge — and re-reporting it is exactly what the
    // backend expects, since a second report on the same project updates the open one
    // rather than filing a duplicate.
    setReported(false);
    setProjectLimitReached(false);
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
        const maskMode = forcedMaskMode ?? segOptions.maskMode;
        if (forcedMaskMode) setSegOptions((o) => ({ ...o, maskMode: forcedMaskMode }));
        await api.requestSegmentation(
          projectId,
          isAdmin ? { ...segOptions, maskMode } : { maskMode },
        );
        const segmented = await pollUntilSegmented(projectId);
        await applyProjectDetail(segmented);
      }
      setMasksReady(true);
    } catch (err) {
      if (err instanceof PollCancelledError) return;
      if (err instanceof HttpError && err.status === 402) {
        if (err.code === "SUBSCRIPTION_REQUIRED") setNeedSubscription(true);
        else if (err.code === "PROJECT_LIMIT_REACHED") setProjectLimitReached(true);
        else if (err.code === "ASK_RETAILER") setAskRetailer(true);
        else setLimitReached(true);
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    } finally {
      setSegmenting(false);
      refreshQuota(); // retry charges on success / refunds on failure
    }
  }, [projectId, guest, pollUntilSegmented, applyProjectDetail, refreshQuota, isAdmin, segOptions]);

  const handleBuyAndRetry = useCallback(async (rail: PayRail = "points") => {
    setError(null);
    setBuying(rail);
    try {
      // Points are a balance debit — no checkout to dismiss, so that rail either
      // succeeds or throws (402 when the balance is short). Card opens Razorpay,
      // which the buyer can close: a null there is a change of mind, not a failure.
      // Both rails answer with the account's refreshed options, so the balance and the
      // credit count behind a second visit to this gate are never a purchase behind.
      if (rail === "points") {
        setPurchaseOptions(await api.pointsPayProjectCredit());
      } else {
        const paid = await buyOneProject();
        if (!paid) return;
        setPurchaseOptions(paid);
      }
      setLimitReached(false);
      if (pendingImageId) {
        await createAndSegment(pendingImageId);
      } else if (!pendingFile) {
        // Paid, but the uploaded photo's id is gone (state was reset along the
        // way). Never leave a blank canvas after taking money: back to the
        // picker with a note — the purchased slot stays on the account.
        chooseDifferent();
        setError(
          "Paid — your extra project is ready. Add your photo again to continue. "
          + projectValidityNote,
        );
      }
      // With a pendingFile the confirm box is back on screen — "Continue with
      // this image" re-runs the upload against the freshly bought slot.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment could not be completed.");
    } finally {
      setBuying(null);
    }
  }, [pendingImageId, pendingFile, createAndSegment, chooseDifferent, projectValidityNote]);

  // Out of projects mid-month: buy ONE more at the plan's own rate and immediately
  // re-run the blocked segmentation — on the already-created project when there is one,
  // else from the pending upload. There is only one thing to buy now, so the shop can't
  // pick the wrong one and still be stuck; the choice is only how to pay for it.
  //
  // Both rails live here because this is the only place a project is sold. The card
  // route used to be on the subscription page, which meant a shop that had run out and
  // held no points had to leave the upload it was in the middle of to find it.
  const handleBuyProjectAndRetry = useCallback(async (rail: PayRail = "points") => {
    setError(null);
    setBuyingProject(rail);
    try {
      if (rail === "points") {
        setPurchaseOptions(await api.pointsPayProjectCredit());
      } else {
        const paid = await buyOneProject();
        if (!paid) return; // buyer closed Checkout
        setPurchaseOptions(paid);
      }
      setProjectLimitReached(false);
      if (projectId) await handleRetrySegmentation();
      else if (pendingImageId) await createAndSegment(pendingImageId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment could not be completed.");
    } finally {
      setBuyingProject(null);
    }
  }, [projectId, pendingImageId, createAndSegment, handleRetrySegmentation]);

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
      if (viewOnly) return;
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

      if (projectId && updatedBackendId !== undefined) {
        const payload: RegionColorUpdate[] = [
          { regionId: updatedBackendId, shadeCode: shade.code, hexCode: shade.hex },
        ];
        runSave(async () => {
          await updateRegionColorsCall(projectId, payload);
        });
      }
    },
    [projectId, updateRegionColorsCall, runSave, viewOnly],
  );

  const onSelectShade = useCallback(
    (shade: PaintShade) => applyShadeTo(activeRegion, shade),
    [applyShadeTo, activeRegion],
  );

  // Apply a custom-picked colour EXACTLY (no catalogue shade) to the active region.
  const onApplyCustom = useCallback(
    (hex: string) => {
      if (viewOnly) return;
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

      if (projectId && updatedBackendId !== undefined) {
        const payload: RegionColorUpdate[] = [
          { regionId: updatedBackendId, shadeCode: null, hexCode: hex },
        ];
        runSave(async () => {
          await updateRegionColorsCall(projectId, payload);
        });
      }
    },
    [activeRegion, projectId, updateRegionColorsCall, runSave, viewOnly],
  );

  // "Keep original" — strip any colour from a region so it renders unpainted
  // (the cleaned surface shows through) instead of forcing one of the three
  // colours onto every wall. Clears the saved colour on the backend too, so a
  // reopened project remembers the wall was left bare on purpose.
  const clearRegionColor = useCallback(
    (regionId: string) => {
      if (viewOnly) return;
      let updatedBackendId: number | undefined;
      let didClear = false;
      setRegions((prev) =>
        prev.map((r) => {
          if (r.id !== regionId) return r;
          updatedBackendId = r.backendId;
          if (r.applied) didClear = true;
          return { ...r, shade: undefined, applied: false };
        }),
      );
      if (!didClear) return; // nothing painted here — no-op, no needless save
      setCompare(false);
      setStage("recolor");

      if (projectId && updatedBackendId !== undefined) {
        const payload: RegionColorUpdate[] = [
          { regionId: updatedBackendId, shadeCode: null, hexCode: null },
        ];
        runSave(async () => {
          await updateRegionColorsCall(projectId, payload);
        });
      }
    },
    [projectId, updateRegionColorsCall, runSave, viewOnly],
  );

  const onKeepOriginalActive = useCallback(
    () => clearRegionColor(activeRegion),
    [clearRegionColor, activeRegion],
  );

  /**
   * Tell the shop this customer needs another project.
   *
   * The whole reason the sale is refused here: the shop assigned these projects and its
   * quota paid for them, so the app carries a message to a counter the customer can also
   * walk back to. Stays on "sent" rather than resetting — a second identical mail helps
   * nobody, and the customer needs to see that the first one went.
   */
  const handleAskRetailer = useCallback(async () => {
    if (asking !== "idle") return;
    setAsking("sending");
    try {
      await api.requestMoreProjects();
      setAsking("sent");
    } catch (err) {
      setAsking("idle");
      setError(err instanceof Error ? err.message : "Could not reach your shop just now.");
    }
  }, [asking]);

  /**
   * Pay to give this project another validity window.
   *
   * Reloads the project on success rather than flipping `viewOnly` locally: the server
   * owns whether a window is open (and may have PAUSED the fresh one behind a
   * subscription that came back), so trusting the payment alone would be guessing at
   * state we can simply ask for.
   */
  /**
   * Buy another validity window. Both rails land here: `points` spends the reward balance,
   * `money` opens Checkout. Either way the project is re-read afterwards, because the
   * response deliberately carries only the new expiry — the studio needs the whole project
   * back to drop out of view-only.
   */
  const handleReopen = useCallback(async (rail: "points" | "money") => {
    if (!projectId || reopening) return;
    setReopening(rail);
    setError(null);
    try {
      if (rail === "points") {
        await api.pointsPayProjectReopen(projectId);
      } else if (!(await reopenProjectWithMoney(projectId))) {
        return; // buyer closed Checkout
      }
      const refreshed = await getProjectCall(projectId);
      await applyProjectDetail(refreshed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reopen this project.");
    } finally {
      setReopening(null);
    }
  }, [projectId, reopening, getProjectCall, applyProjectDetail]);

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

  // Persist a REFINED mask back onto an EXISTING region (AI-detected or hand-drawn):
  // the mask the studio opened for editing, now fixed, replaces the region's mask in
  // place — no new region, no AI call. Optimistic: the composite shows the new shape
  // immediately; the backend save is retryable via the same Retry chip.
  const handleUpdateMask = useCallback(
    async (regionId: string, mask: HTMLCanvasElement) => {
      const target = regions.find((r) => r.id === regionId);
      // Show the refined shape at once, and drop the cached region luminance so
      // scene-light shading recomputes against the new mask.
      setRegions((prev) =>
        prev.map((r) => (r.id === regionId ? { ...r, maskCanvas: mask } : r)),
      );
      baseLumaRef.current.delete(regionId);
      setActiveRegion(regionId);
      setStage("recolor");

      const backendId = target?.backendId;
      if (!projectId || backendId === undefined) {
        setMaskStudioOpen(false);
        setEditingRegionId(null);
        return;
      }
      const persist = async () => {
        const detail = await updateRegionMaskCall(projectId, backendId, mask.toDataURL("image/png"));
        setRegions((prev) =>
          prev.map((r) =>
            r.id === regionId ? { ...r, maskUrl: resolveMediaUrl(detail.maskUrl), maskCanvas: mask } : r,
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
        if (process.env.NODE_ENV !== "production") console.warn("Mask update failed:", err);
        failedSavesRef.current.push(persist);
        setSaveStatus("failed");
      } finally {
        setSavingMask(false);
        setMaskStudioOpen(false);
        setEditingRegionId(null);
      }
    },
    [regions, projectId, updateRegionMaskCall],
  );

  // Open the Mask Studio to REFINE an existing region's mask (the ✎ on a wall chip).
  const editRegionMask = useCallback((regionId: string) => {
    setEditingRegionId(regionId);
    setMaskStudioOpen(true);
  }, []);

  // Delete a hand-drawn wall. Guard rails: only regions the user created by
  // hand (custom) can be removed — AI-detected walls have no delete control and
  // are rejected here too. Removes it from the composite immediately (optimistic),
  // moves the active selection off it, frees a custom-mask slot, and deletes the
  // backend row when the region was persisted.
  const handleDeleteWall = useCallback(
    (regionId: string) => {
      const target = regions.find((r) => r.id === regionId);
      if (!target || !target.custom) return;

      setRegions((prev) => prev.filter((r) => r.id !== regionId));
      setActiveRegion((cur) =>
        cur === regionId ? (regions.find((r) => r.id !== regionId)?.id ?? cur) : cur,
      );
      setTriedByRegion((prev) => {
        if (!(regionId in prev)) return prev;
        const next = { ...prev };
        delete next[regionId];
        return next;
      });

      if (projectId && target.backendId != null) {
        // Through the shared save machine, so a failed delete surfaces the
        // "Could not save · Retry" chip (like colour saves) instead of the wall
        // silently reappearing on the next reload.
        const backendId = target.backendId;
        runSave(async () => {
          await deleteRegionCall(projectId, backendId);
        });
      }
    },
    [regions, projectId, deleteRegionCall, runSave],
  );

  // Open the share sheet, creating the public link if this project has not been
  // shared yet.
  //
  // 10 days, matching a walk-in access code: a share link lets whoever holds it repaint
  // the room, so it hands out the same thing a code does and should not outlive one.
  //
  // The sheet opens FIRST and the link arrives into it. Sharing used to be a
  // clipboard write reported by a two-word status pill, which left the link
  // unreachable whenever the clipboard was refused — a non-secure origin, Safari
  // outside a direct gesture, a locked-down shop tablet — because the only other
  // copy of it was in a `title` attribute, and a tablet has no hover.
  const handleShare = useCallback(async () => {
    if (!projectId) return;
    setShareOpen(true);
    // Already have one: a share link is stable for its 10 days, so re-opening the
    // sheet must not mint a second token for the same room.
    if (shareUrl || sharing) return;
    setSharing(true);
    setShareError(null);
    try {
      const res = await api.generateShareLink(projectId, SHARE_VALID_DAYS);
      setShareUrl(`${window.location.origin}/share/${res.shareToken}`);
    } catch (err) {
      setShareError(err instanceof Error ? err.message : "Could not create a share link.");
    } finally {
      setSharing(false);
    }
  }, [projectId, shareUrl, sharing]);

  /**
   * The colours on the shared room, for the sheet's summary.
   *
   * Reduced by exactly the rules the rest of the studio uses: no paint name where
   * the shop hides names, and the shop's own numbering in place of the
   * manufacturer's wherever it runs a pattern. A share sheet that listed
   * "Asian Paints Ivory Mist" would undo the scheme in the one artefact most
   * likely to be forwarded on.
   */
  const shareShades = useMemo(
    () =>
      regions
        .filter((r) => r.applied)
        .map((r) => ({
          label: r.label,
          name: hideNames ? "" : (r.shade?.name ?? "Custom colour"),
          code: hideRawCodes
            ? r.shade && encodeCode
              ? encodeCode(r.shade.code)
              : undefined
            : r.shade?.code,
          hex: r.hex,
        })),
    [regions, hideNames, hideRawCodes, encodeCode],
  );

  /** Snapshot the painted room for the sheet's "Download image". */
  const captureRoomImage = useCallback(() => {
    const engine = recolorRef.current;
    if (!engine || !imageUrl) return null;
    return canvasToJpegDataUrl(engine.canvas, 1500, 0.85);
  }, [imageUrl]);

  // Commit the inline rename: optimistic (the topbar updates immediately), with
  // a revert + error message if the backend rejects it. No-ops on blank/unchanged.
  const commitRename = useCallback(async () => {
    const name = nameDraft.trim();
    setRenaming(false);
    if (!projectId || !name || name === (projectName ?? "")) return;
    const prev = projectName;
    setProjectName(name);
    try {
      await api.updateProject(projectId, { name });
    } catch (err) {
      setProjectName(prev);
      setError(err instanceof Error ? err.message : "Could not rename the project.");
    }
  }, [nameDraft, projectId, projectName]);

  // Guest "I'm done — this is the one": hands the project to the issuing shop
  // (idempotent server-side; the shop owner also gets an email heads-up).
  const handleSendToShop = useCallback(async () => {
    if (!projectId) return;
    setSendingToShop(true);
    setError(null);
    try {
      await guestApi.sendToShop(projectId);
      setSentToShop(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send this to the shop.");
    } finally {
      setSendingToShop(false);
    }
  }, [projectId]);

  // Download the current recoloured canvas as a bounded JPEG (not a full-res
  // PNG): the studio canvas renders at up to 4K × devicePixelRatio, so the raw
  // PNG export was many megabytes. A capped JPEG is a fraction of the size.
  const downloadCurrentImage = useCallback(() => {
    const engine = recolorRef.current;
    if (!engine) return;
    const jpeg = canvasToJpegDataUrl(engine.canvas, 2200, 0.9);
    if (!jpeg) return;
    const a = document.createElement("a");
    a.href = jpeg;
    a.download = `huevista-${Date.now()}.jpg`;
    a.click();
  }, []);

  // The board caps and remaining downloads come from the paying plan. Best-effort:
  // when the endpoint is missing/unreachable the tray falls back to the defaults,
  // and the backend still enforces the quota at download time.
  useEffect(() => {
    let cancelled = false;
    void (guest ? guestApi.getPdfAllowance() : api.getPdfAllowance())
      .then((a) => {
        if (!cancelled) setPdfAllowance(a);
      })
      .catch(() => {
        /* no active plan / older backend — defaults apply, server still gates */
      });
    return () => {
      cancelled = true;
    };
  }, [guest]);

  // Snapshot the current painted canvas + the shades on it into the PDF board.
  const addToPdf = useCallback(() => {
    const engine = recolorRef.current;
    if (!engine || !imageUrl) return;
    if (pdfPages.length >= maxPdfPages) {
      setPdfNotice(`That's the most (${maxPdfPages}) — download or remove one to add more.`);
      return;
    }
    const painted = regions.filter((r) => r.applied);
    if (painted.length === 0) {
      setPdfNotice("Apply a colour first, then add it to the PDF.");
      return;
    }
    const jpeg = canvasToJpegDataUrl(engine.canvas, 1500, 0.85);
    if (!jpeg) {
      setPdfNotice("Could not capture this image — please try again.");
      return;
    }
    // The board leaves the shop, so it follows the shop's own presentation exactly:
    // its codes where it has a pattern, and no paint name where it hides names. A PDF
    // that still printed "Asian Paints Ivory Mist" would undo the whole scheme in the
    // one artefact the customer walks out with.
    const shades = painted.map((r) => ({
      label: r.label,
      name: hideNames ? "" : (r.shade?.name ?? "Custom colour"),
      code: hideRawCodes
        ? r.shade && encodeCode
          ? encodeCode(r.shade.code)
          : undefined
        : r.shade?.code,
      hex: r.hex,
      // Not printed. Both exist so this board can be reported to the server as it
      // really is: the region so the combination can be re-rendered from the masks
      // later, and the true code so a shop's display scheme cannot make its own
      // customer's board unreadable back to us. backendId, not id — the local id is a
      // client-side string, and a region drawn but not yet saved has no backend row.
      regionId: r.backendId,
      rawCode: r.shade?.code,
    }));
    setPdfPages((prev) => [...prev, { jpegDataUrl: jpeg, shades }]);
    setPdfNotice(null);
  }, [imageUrl, regions, pdfPages.length, maxPdfPages, hideRawCodes, hideNames, encodeCode]);

  /**
   * "Add to PDF" on a palette card: the palette is applied by the shade grid, and the
   * snapshot has to wait for that paint to land. Applying and capturing in the same tick
   * caught the PREVIOUS colours — React state and the WebGL canvas both update after the
   * handler returns — so the board got the room the customer had just moved on from.
   * Arming a flag and capturing once `regions` reflects the new paint is what makes the
   * sheet show what is on screen.
   */
  const [pdfCaptureArmed, setPdfCaptureArmed] = useState(false);

  useEffect(() => {
    if (!pdfCaptureArmed) return;
    const id = requestAnimationFrame(() => {
      addToPdf();
      setPdfCaptureArmed(false);
    });
    return () => cancelAnimationFrame(id);
  }, [pdfCaptureArmed, regions, addToPdf]);

  const removePdfPage = useCallback((index: number) => {
    setPdfPages((prev) => prev.filter((_, i) => i !== index));
    setPdfNotice(null);
  }, []);

  // Build the file, THEN charge for it — see runColourBoardDownload, which owns
  // that order and the reasoning behind it. Charging first used to mean a build
  // failure spent a download and produced nothing, with no refund path on the
  // server to put it back.
  const downloadPdf = useCallback(async () => {
    if (pdfPages.length === 0 || pdfDownloading) return;
    const id = projectId ?? openProjectId;
    setPdfDownloading(true);
    setPdfNotice(null);
    try {
      // What was on each page travels with the charge. The board is built here and the
      // server never sees the file, so this is the only moment the combinations that
      // went onto paper can be recorded — and the closing flow is built entirely on them.
      const pages = pdfPages.map((page) => ({
        shades: page.shades.map((s) => ({
          regionId: s.regionId ?? null,
          regionLabel: s.label,
          shadeCode: s.rawCode ?? null,
          shadeName: s.name || null,
          hex: s.hex,
        })),
      }));
      const outcome = await runColourBoardDownload({
        build: () => buildColourBoardPdf(pdfPages, projectName || "HueVista colour board"),
        charge: () =>
          id
            ? guest
              ? guestApi.recordColourBoard(id, pages)
              : api.recordColourBoard(id, pages)
            : Promise.reject(new Error("no project to record this board against")),
        save: (blob) => downloadBlob(blob, `huevista-colours-${Date.now()}.pdf`),
        onResult: (result) => {
          setPdfAllowance(result.allowance);
          setBoardsUsed(result.boardsUsed);
          setBoardsAllowed(result.boardsAllowed);
        },
      });
      if (outcome.status === "build-failed") {
        setPdfNotice("Could not make the PDF on this device — try removing a photo and downloading again.");
      } else if (outcome.status === "quota-spent") {
        setPdfNotice(outcome.message);
      } else if (outcome.status === "closed" && id && !guest) {
        // That was the last board, so the job is finished. The file has already been
        // handed over by this point — see runColourBoardDownload — so navigating away
        // cannot cost the customer the board they just paid for.
        setClosed(true);
        router.push(`/render?project=${encodeURIComponent(id)}`);
      }
    } finally {
      setPdfDownloading(false);
    }
  }, [pdfPages, projectName, guest, pdfDownloading, projectId, openProjectId, router]);

  /** Finish the job early, before both boards are spent. */
  const closeProject = useCallback(async () => {
    const id = projectId ?? openProjectId;
    if (!id || guest || closing) return;
    setClosing(true);
    try {
      await api.closeProject(id);
      setClosed(true);
      router.push(`/render?project=${encodeURIComponent(id)}`);
    } catch (e) {
      setPdfNotice(e instanceof Error ? e.message : "Could not close this project.");
    } finally {
      setClosing(false);
    }
  }, [projectId, openProjectId, guest, closing, router]);

  const active = useMemo(() => regions.find((r) => r.id === activeRegion)!, [regions, activeRegion]);

  // Companies this caller may actually work with. For a shop that is what its
  // distributor assigned it and what its plan includes; for a guest it is what the
  // access code unlocked — both already applied by the backend, so this is simply
  // what came back. One company means there is nothing to choose, and the picker
  // hides rather than offering a list of one.
  const availableBrands = useMemo(
    () => Array.from(new Set((shades ?? []).map((s) => s.brand).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [shades],
  );
  // What the colour panel is handed. A selection that matches nothing — a catalogue
  // re-imported under the picker, say — falls back to the whole list: an empty panel
  // would look like the studio had broken rather than like a filter needing clearing.
  const panelShades = useMemo(() => {
    // A CLOSED project shows only the shades that went onto its colour boards. The job
    // is finished and those are what the customer chose; the rest of the catalogue is
    // what reopening buys back.
    //
    // This is presentation, not access control, and it is deliberately not pretending
    // otherwise: /api/shades is a global catalogue endpoint with no project scope, so
    // there is no server-side filter to mirror here. What the server DOES enforce is the
    // thing that matters — a closed project refuses every recolour — so the worst a
    // determined browser can do is look at a shade it cannot apply.
    if (closed) {
      const unlocked = new Set(
        unlockedShadeCodes.map((c) => c.toUpperCase()),
      );
      const kept = (shades ?? []).filter((s) => unlocked.has(s.code.toUpperCase()));
      // Never hand back an empty panel: a closed project whose boards recorded only
      // custom colours would otherwise look broken rather than finished.
      if (kept.length > 0) return kept;
    }
    if (companies.length === 0) return shades;
    const scoped = (shades ?? []).filter((s) => companies.includes(s.brand));
    return scoped.length > 0 ? scoped : shades;
  }, [shades, companies, closed, unlockedShadeCodes]);

  /**
   * The shade codes this project's colour boards carried — what stays visible once it
   * closes. Loaded only when it actually is closed: on a live project the whole
   * catalogue is open and there is nothing to filter, so asking would be a request per
   * project open for an answer nobody reads.
   */
  useEffect(() => {
    const id = projectId ?? openProjectId;
    if (!closed || !id || guest) return;
    let cancelled = false;
    api
      .getProjectCombos(id)
      .then((list) => {
        if (cancelled) return;
        setUnlockedShadeCodes(
          list.flatMap((c) => c.shades.map((s) => s.shadeCode).filter((x): x is string => !!x)),
        );
      })
      .catch(() => {
        /* The panel falls back to the full catalogue, which is still unpaintable. */
      });
    return () => {
      cancelled = true;
    };
  }, [closed, projectId, openProjectId, guest]);

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
        custom: Boolean(r.custom),
        hasMask: Boolean(r.maskCanvas || r.maskUrl),
      })),
    [regions],
  );

  // The region the Mask Studio is refining (its current mask seeds the canvas).
  const editTarget = useMemo<ExistingMask | null>(() => {
    if (!editingRegionId) return null;
    const r = regions.find((x) => x.id === editingRegionId);
    return r ? { id: r.id, label: r.label, kind: r.kind, maskUrl: r.maskUrl, maskCanvas: r.maskCanvas } : null;
  }, [editingRegionId, regions]);

  // Claude photo palettes: signed-in users with a saved project only. Guests
  // never get the section (their AI budget is the shop's segmentation quota),
  // and before the project exists there's no photo on the backend to analyse.
  // Every ask re-reads the quota pill — charged on success, refunded on failure.
  const fetchAiPalettes = useMemo(
    () =>
      !guest && projectId
        ? async () => {
            try {
              return await api.getAiRecommendations(projectId);
            } finally {
              refreshQuota();
            }
          }
        : undefined,
    [guest, projectId, refreshQuota],
  );

  /**
   * File a "this came out wrong" report against the current project.
   *
   * Throws on failure rather than swallowing it: the dialog owns the error
   * message, because the person who just described a problem needs to know
   * whether the description actually left the building.
   */
  const submitReport = useCallback(
    async (issues: MaskReportIssue[], note: string) => {
      if (!projectId) throw new Error("This room hasn't been saved yet — try again in a moment.");
      const body = { issues, ...(note ? { note } : {}) };
      if (guest) await guestApi.reportMask(projectId, body);
      else await api.reportMask(projectId, body);
      setReported(true);
    },
    [guest, projectId],
  );

  // The report button belongs to a FINISHED run: while one is in flight there is
  // nothing to judge, and before a project exists there is nothing to report against.
  //
  // "Finished" is `masksReady`, NOT `stage === "recolor"`. Nothing moves `stage` past
  // "mask" when a run completes — only applying a colour or REOPENING the project does
  // — so a freshly segmented room failed this test and the button never rendered. That
  // hid it in precisely the case it exists for: a MANUAL-mode run, or one where wall
  // detection found nothing, has no region to put a colour on, so the user could never
  // reach "recolor" to report that no walls were detected. `stage` is the pipeline's
  // idea of what the user is DOING; `masksReady` is whether a run has produced its
  // result, and that is the question here.
  const canReport = Boolean(projectId) && masksReady && !uploading && !segmenting;

  const manualRun = !guest && segOptions.maskMode === "MANUAL";
  const overlayLabel = uploading && !segmenting
    ? "Uploading photo"
    : segmenting
      ? manualRun ? "Cleaning up the photo" : "Detecting walls"
      : "Working";
  const overlayHint = uploading && !segmenting
    ? "Uploading the photo."
    : segmenting
      ? manualRun
        ? "Tidying up the photo. When it's done, click each wall to mark it yourself."
        // "About a minute" against a job the backend gives eight minutes to finish:
        // detection is two generative model calls in sequence, and a real upload
        // took two and a half. An estimate the wait routinely beats is worse than a
        // wider one, because the person reading it starts wondering what broke.
        : "Finding the walls and other paintable surfaces. This usually takes one to three minutes; a busy photo can take longer."
      : undefined;

  const showDetailsGate = !imageUrl && !details && !openProjectId;

  /**
   * Take someone who reached for a colour to the thing that has to come first.
   *
   * On desktop the uploader is already beside the panel; on a stacked mobile
   * layout it is a screen away, which is how "press Apply, nothing happens"
   * became so easy to hit. Scroll it into view either way, then open the file
   * chooser — unless the project still needs a name, in which case that form is
   * what is actually in the way and the chooser would land behind it.
   */
  const needPhoto = useCallback(() => {
    canvasWrapRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (!showDetailsGate) fileRef.current?.click();
  }, [showDetailsGate]);

  // Wall detection can be retried without re-uploading the photo once the
  // project exists and we're still on the mask step. Guests can retry too — each
  // attempt is billed to the shop.
  const canRetrySegmentation = Boolean(projectId) && stage === "mask";
  // The photo uploaded fine but creating the project failed (network blip, 5xx):
  // retry project creation + segmentation from the already-uploaded image, so
  // the user never has to re-pick or re-upload the photo.
  const canRetryCreate = !projectId && Boolean(pendingImageId) && stage === "mask";
  // Errors after the photo is on screen (segmentation timeout/failure, share
  // failures…) need their own surface — the DropZone one is gone by then.
  const showCanvasError = Boolean(
    error && imageUrl && !uploading && !segmenting &&
    !limitReached && !askRetailer && !accessExpired && !needVerification && !needSubscription &&
    !projectLimitReached,
  );

  // A ?project= that names nothing gets a plain answer instead of an empty studio.
  // The old behaviour was worse than a blank page: it looked like a real, working,
  // untitled project, and it skipped the name-first step the normal flow enforces,
  // so anything done in it belonged to no project at all.
  if (openFailed) {
    const missing = openFailed === "notFound";
    return (
      <div className="hv-visualizer">
        <div style={{ maxWidth: 560, margin: "0 auto", padding: "72px var(--gutter) 96px", textAlign: "center" }}>
          <Eyebrow>Studio · project</Eyebrow>
          <h1 className="display" style={{ fontSize: "clamp(32px, 4.5vw, 52px)", margin: "16px 0 14px" }}>
            {missing ? <>No such <i>project.</i></> : <>That didn&apos;t <i>open.</i></>}
          </h1>
          <p style={{ font: "400 16px/1.6 var(--sans)", color: "var(--fg-soft)", maxWidth: "46ch", margin: "0 auto 28px" }}>
            {missing
              ? "This link points at a project that doesn't exist, or isn't one this account can open. It may have been deleted."
              : error || "Something went wrong opening this project. Try again in a moment."}
          </p>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
            <Link className="btn btn-brass" href="/dashboard">Back to your projects <span className="arr">→</span></Link>
            <Link className="btn btn-ghost" href="/studio">Start a new project</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="hv-visualizer">
      {/* The studio had no heading of any level. It is a full-bleed working surface,
          so there is no room for a display title, but a page with no h1 gives a
          screen reader nothing to land on and no way to tell one project from the
          next in a heading list. Visually hidden, and it names the actual project. */}
      <h1 className="sr-only">
        Studio — {projectName || (openProjectId ? "project" : "new project")}
      </h1>
      <div className="hv-studio-topbar">
        <div className="hv-studio-project">
          <Mono>Project</Mono>
          {renaming ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => {
                if (!skipRenameCommitRef.current) void commitRename();
                skipRenameCommitRef.current = false;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                  skipRenameCommitRef.current = true;
                  setRenaming(false);
                }
              }}
              aria-label="Project name"
              maxLength={200}
              style={{
                font: "inherit",
                color: "inherit",
                background: "var(--surface)",
                border: "1px solid var(--rule-strong)",
                borderRadius: 4,
                padding: "2px 8px",
                minWidth: 140,
              }}
            />
          ) : !guest && projectId ? (
            <button
              type="button"
              onClick={() => {
                setNameDraft(projectName ?? "");
                setRenaming(true);
              }}
              title="Rename this project"
              style={{ font: "inherit", color: "inherit", background: "transparent", border: "none", cursor: "text", padding: 0, display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <span>{projectName || "Untitled project"}</span>
              <span aria-hidden style={{ color: "var(--fg-mute)", fontSize: 12 }}>✎</span>
            </button>
          ) : (
            <span>{projectName || "Untitled project"}</span>
          )}
          {projectRoom && <Mono>· {projectRoom}</Mono>}
        </div>

        <div className="hv-studio-status">
          {quota && (
            <span
              className={`hv-status-pill ${quota.used >= quota.limit ? "is-error" : ""}`}
              title="Projects used this month. One project covers the clean-up and finding the walls together — everything after that (trying shades, painting each wall, colour suggestions) is free."
            >
              {quota.used}/{formatLimitSymbol(quota.limit)} projects
            </span>
          )}
          {basicPreview && (
            <span className="hv-status-pill" title="This device is using a simpler display mode. Colours are still accurate.">
              ⚠ Basic preview
            </span>
          )}
          {classification && (
            <span className={`hv-status-pill ${classification === "INDOOR" ? "is-accent" : ""}`}>
              {classification === "INDOOR" ? "Indoor" : classification === "OUTDOOR" ? "Outdoor" : "Unknown"}
            </span>
          )}
          {segmenting && (
            <span className="hv-status-pill">
              <span className="dot" />
              Detecting walls…
            </span>
          )}
          {masksReady && wallsNoticeVisible && !guestAiUnavailable && (
            <span className="hv-status-pill is-success">
              {manualMaskProject ? "Photo cleaned — click walls to mark them" : "Walls detected"}
            </span>
          )}
          {guest && guestAiUnavailable && masksReady && (
            <span className="hv-status-pill" title="The shop has used up this month's projects — mark the walls by hand instead.">
              AI unavailable
            </span>
          )}
          {saveStatus === "saving" && (
            <span className="hv-status-pill">
              <span className="dot" />
              Saving…
            </span>
          )}
          {saveStatus === "saved" && savedNoticeVisible && <span className="hv-status-pill is-success">Saved</span>}
          {saveStatus === "failed" && (
            <button type="button" className="hv-status-pill is-error" onClick={retrySave}>
              Could not save · <span style={{ textDecoration: "underline" }}>Retry</span>
            </button>
          )}
          {shareUrl && !shareOpen && (
            // Clickable, not decorative: once the sheet is closed this is the way
            // back to a link that already exists.
            <button
              type="button"
              className="hv-status-pill is-accent"
              onClick={() => setShareOpen(true)}
            >
              Share link
            </button>
          )}
        </div>

        <div className="hv-studio-actions">
          {availableBrands.length > 1 && (
            <CompanyPicker
              brands={availableBrands}
              selected={companies}
              onChange={setCompanies}
            />
          )}
          {!guest && (
            <Button
              size="sm"
              variant="brass"
              disabled={!projectId}
              onClick={() => void handleShare()}
              title={projectId ? "Create a public link (colours shown, codes hidden)" : "Save the project first"}
            >
              Share
            </Button>
          )}
          {guest && (
            <Button
              size="sm"
              variant="brass"
              disabled={!projectId || sendingToShop || sentToShop}
              onClick={() => void handleSendToShop()}
              title={
                sentToShop
                  ? "The shop has your room and colours."
                  : projectId
                    ? "Done choosing? Send this room to your shop — they'll see your colours and the exact shades."
                    : "Pick a photo first"
              }
            >
              {sentToShop ? "Sent to shop ✓" : sendingToShop ? "Sending…" : "Send to my shop"}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={!imageUrl}
            onClick={downloadCurrentImage}
          >
            Download
          </Button>
        </div>
      </div>

      {/* View-only: the room and its last colours are all still here — what has ended
          is the ability to change them. Stated once, above the canvas, with the one
          action that actually fixes it, rather than as a failure on every swatch. */}
      {viewOnly && (
        <div className="hv-viewonly-bar" role="status">
          <span className="hv-viewonly-text">
            {viewOnlyReason ??
              "This project is view-only — you can still see the colours last applied to it."}
          </span>
          <span className="hv-viewonly-actions">
            {/* Both rails, priced from the server. Points lead when they can actually
                pay — they are the cheaper one — and the card button is always there.
                A project a live plan already covers never gets here — it isn't view-only.

                Gated on eligibility AND the balance, not on the price. Points are a shop
                currency: the backend refuses to sell or spend them for anyone but a
                RETAILER, so "Reopen for 9 points" was a button that 403'd for every
                customer who pressed it — and it led, so it was the one they pressed. It
                is equally wrong for a shop holding 3 points, which is what the balance
                catches; eligibility is what catches the account that may never hold any. */}
            {reopenPoints > 0 && pointsRailOpen && pointsBalance >= reopenPoints && projectId && (
              <Button
                size="sm"
                variant="ghost"
                disabled={reopening !== null}
                onClick={() => void handleReopen("points")}
              >
                {reopening === "points" ? "Reopening…" : `Reopen for ${reopenPoints} points`}
              </Button>
            )}
            {reopenPaise > 0 && projectId && (
              <Button
                size="sm"
                variant="ghost"
                disabled={reopening !== null}
                onClick={() => void handleReopen("money")}
              >
                {reopening === "money"
                  ? "Opening checkout…"
                  : `or pay ₹${(reopenPaise / 100).toLocaleString("en-IN")}`}
              </Button>
            )}
            <LinkButton href="/plan" size="sm" variant="ghost">
              See plans <span className="arr">→</span>
            </LinkButton>
          </span>
          <style>{`
            .hv-viewonly-bar {
              display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
              gap: 12px; padding: 12px 20px;
              border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule);
              background: var(--surface-soft);
            }
            .hv-viewonly-text { font: 400 14px/1.4 var(--sans); color: var(--fg); }
            .hv-viewonly-actions { display: inline-flex; align-items: center; gap: 8px; }
          `}</style>
        </div>
      )}

      <div className="hv-studio-body">
        <div className="hv-studio-canvas-wrap" ref={canvasWrapRef}>
          <div className="hv-studio-canvas">
            {/* The one thing on the page a screen reader most needs named, and the
                only canvas here that had no name at all — the little colour wheel
                beside it has carried one all along. `img` because that is what it
                is to a reader: a picture of the room, not a control. */}
            <canvas
              key={engineEpoch}
              ref={canvasRef}
              role="img"
              aria-label={
                regions.some((r) => r.applied)
                  ? `${projectName || "Your room"} — preview with ${regions.filter((r) => r.applied).length} surface${regions.filter((r) => r.applied).length === 1 ? "" : "s"} painted`
                  : `${projectName || "Your room"} — room photo, no colours applied yet`
              }
              style={{
                display: imageUrl ? "block" : "none",
              }}
            />
            {showDetailsGate && (
              <ProjectDetailsGate
                initial={details ?? undefined}
                onSubmit={(d) => {
                  setDetails(d);
                  setProjectName(d.name);
                  setProjectRoom(d.roomType ?? null);
                }}
              />
            )}
            {!imageUrl && !showDetailsGate && !openProjectId && (
              <>
                <DropZone
                  uploading={uploading}
                  error={error}
                  onChoose={() => fileRef.current?.click()}
                  onDrop={(file) => void selectFile(file)}
                />
                {/* The way back. "Continue to photo" was one-way: a name, a room type
                    and notes typed on the previous step became uneditable the moment
                    it was pressed, and the only route back to them was abandoning the
                    project. Nothing has been created on the backend yet at this point
                    — the details are still local — so returning costs nothing. */}
                {details && (
                  <button
                    type="button"
                    onClick={() => setDetails(null)}
                    className="hv-studio-back"
                  >
                    <span aria-hidden>←</span> Edit project details
                  </button>
                )}
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept={IMAGE_ACCEPT}
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void selectFile(f);
                e.target.value = "";
              }}
            />
            {imageUrl && !pendingFile && !uploading && !segmenting && (
              /* Floating preview option (glass, top-left): just the Brighten
                 level — every other render option is fixed at its best default
                 (shadows on, +1px edge nudge). */
              <div className="hv-studio-floatbar" role="group" aria-label="Preview options">
                <div className="hv-studio-tool hv-studio-tool-col">
                  <span className="hv-studio-tool-label">
                    <span className="hv-studio-tool-icon"><SunIcon /></span>
                    Brighten
                  </span>
                  <div className="hv-seg" role="radiogroup" aria-label="Brighten the photo">
                    {BRIGHTEN_LEVELS.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        role="radio"
                        aria-checked={brighten === l.id}
                        data-on={brighten === l.id}
                        className="hv-seg-btn"
                        title={
                          l.id === "original"
                            ? "Original — the photo as taken"
                            : l.id === "soft"
                              ? "Soft glow — a gentle lift, like opening the curtains"
                              : "Bright — a stronger lift for dark photos"
                        }
                        onClick={() => setBrighten(l.id)}
                      >
                        {l.id === "original" ? "Original" : l.id === "soft" ? "Soft" : "Radiant"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {imageUrl && !pendingFile && (
              <>
                {/* HOLD-TO-PEEK — press and hold to see the original photo */}
                <button
                  type="button"
                  className={`hv-studio-compare ${compare ? "is-active" : ""}`}
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
                >
                  <CompareIcon />
                  {/* Both labels are always in the layout (stacked in one grid
                      cell) so the button keeps ONE width — swapping the text
                      used to shrink it mid-press, sliding it out from under
                      the pointer. */}
                  <span className="hv-studio-compare-label" aria-hidden={false}>
                    <span style={{ visibility: compare ? "hidden" : "visible" }}>Hold to compare</span>
                    <span style={{ visibility: compare ? "visible" : "hidden" }} aria-hidden={!compare}>Original</span>
                  </span>
                </button>
              </>
            )}
            {/* On-canvas legend: every painted surface with its shade name and
                code, so the colours in the preview are never anonymous — the
                counter (or a screenshot) reads them straight off the image.
                Labelled by the SAME rules as the share sheet and the PDF: this
                branched on `guest` alone, so a signed-in customer of a shop
                running its own numbering was shown the manufacturer's real code
                right under a picker that had just shown them the coded one. The
                customer uses this exact screen, so that one label undid the
                scheme everywhere else it was honoured. */}
            {imageUrl && !pendingFile && !uploading && !segmenting && regions.some((r) => r.applied) && (
              <div className="hv-studio-legend" role="list" aria-label="Colours in this preview">
                {regions.filter((r) => r.applied).map((r) => {
                  // A custom-picked colour is nobody's catalogue shade, so its hex
                  // is all there is to name it by and nothing is being protected.
                  const code = r.shade
                    ? hideRawCodes
                      ? encodeCode
                        ? encodeCode(r.shade.code)
                        : undefined
                      : r.shade.code
                    : r.hex.toUpperCase();
                  const name = hideNames ? "" : (r.shade?.name ?? "Custom colour");
                  return (
                    <div key={r.id} className="hv-studio-legend-row" role="listitem">
                      <span aria-hidden className="hv-studio-legend-chip" style={{ background: r.hex }} />
                      <span className="hv-studio-legend-region">{r.label}</span>
                      {name && <span className="hv-studio-legend-name">{name}</span>}
                      {/* No code to show and no name either → the swatch itself is
                          the only handle, and the hex is a worse leak than none. */}
                      {code && <span className="hv-studio-legend-code">{code}</span>}
                    </div>
                  );
                })}
              </div>
            )}
            {/* Screens and real paint never match exactly, and the preview is a
                lighting-aware approximation — set that expectation on the page
                itself so a colour is chosen by its shade name/code, not the pixels. */}
            {imageUrl && !pendingFile && !uploading && !segmenting && regions.some((r) => r.applied) && (
              <p className="hv-studio-disclaimer" role="note">
                Colours shown are indicative. The final painted shade may look different on your
                wall — confirm the exact colour by its shade name and number before buying.
              </p>
            )}
            {/* "The AI got this wrong." Deliberately quiet and deliberately
                ALWAYS THERE once a run has finished — a bad mask is invisible to
                every check the backend makes, so this button is the only way the
                team ever learns a run failed. Hiding it behind a menu would lose
                exactly the reports worth having. */}
            {canReport && (
              <div className="hv-studio-report">
                {reported ? (
                  <Mono>Reported — thank you. Our team will take a look.</Mono>
                ) : (
                  <button type="button" className="hv-studio-report-btn" onClick={() => setReportOpen(true)}>
                    <FlagIcon />
                    Not right? Report a problem
                  </button>
                )}
              </div>
            )}
            {imageUrl && !pendingFile && !uploading && !segmenting && (
              <div className="hv-pdf-tray" role="group" aria-label="Colour board PDF">
                <div className="hv-pdf-tray-main">
                  <button
                    type="button"
                    className="hv-pdf-add"
                    onClick={addToPdf}
                    disabled={pdfPages.length >= maxPdfPages}
                    title={
                      pdfPages.length >= maxPdfPages
                        ? `The PDF is full (${maxPdfPages} images on this plan)`
                        : "Add this coloured image to the PDF"
                    }
                  >
                    <PlusIcon />
                    Add to PDF
                  </button>
                  {pdfPages.length > 0 && (
                    <>
                      <span className="hv-pdf-count">
                        {pdfPages.length}/{maxPdfPages}
                      </span>
                      <button
                        type="button"
                        className="hv-pdf-download"
                        onClick={() => void downloadPdf()}
                        disabled={pdfDownloading || (pdfAllowance !== null && !pdfAllowance.unlimited && pdfAllowance.remaining <= 0)}
                        title={
                          pdfAllowance !== null && !pdfAllowance.unlimited && pdfAllowance.remaining <= 0
                            ? "This month's colour-board downloads are used up"
                            : pdfAllowance !== null && !pdfAllowance.unlimited
                              ? `${pdfAllowance.remaining} download${pdfAllowance.remaining === 1 ? "" : "s"} left this month`
                              : "Download the colour board as a PDF"
                        }
                      >
                        {pdfDownloading ? "Preparing…" : "Download PDF"}
                      </button>
                    </>
                  )}
                  {/* Finishing early. Only offered once a board has actually been
                      handed over: closing with nothing to show for it would lock the
                      catalogue on a job that produced nothing to choose from. */}
                  {!guest && !closed && boardsUsed > 0 && (
                    <button
                      type="button"
                      className="hv-pdf-close-project"
                      onClick={() => void closeProject()}
                      disabled={closing}
                      title="Finish this job and make your AI image"
                    >
                      {closing ? "Closing…" : "Close project"}
                    </button>
                  )}
                </div>
                {!guest && boardsAllowed > 0 && !closed && (
                  <p className="hv-pdf-boards-left">
                    {boardsUsed === 0
                      ? `${boardsAllowed} colour boards on this project.`
                      : boardsAllowed - boardsUsed === 1
                        ? "One colour board left — the next one finishes this project."
                        : `${boardsAllowed - boardsUsed} colour boards left on this project.`}
                  </p>
                )}
                {pdfPages.length > 0 && (
                  <div className="hv-pdf-thumbs">
                    {pdfPages.map((page, i) => (
                      <div key={i} className="hv-pdf-thumb">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={page.jpegDataUrl} alt={`Colour option ${i + 1}`} />
                        <span className="hv-pdf-thumb-dots" aria-hidden>
                          {page.shades.slice(0, 5).map((s, j) => (
                            <span key={j} style={{ background: s.hex }} />
                          ))}
                        </span>
                        <button
                          type="button"
                          className="hv-pdf-thumb-remove"
                          onClick={() => removePdfPage(i)}
                          aria-label={`Remove colour option ${i + 1}`}
                          title="Remove"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {pdfNotice && <p className="hv-pdf-notice">{pdfNotice}</p>}
              </div>
            )}
            {pendingFile && !uploading && !segmenting && (
              <div
                role="group"
                aria-label="Confirm your photo"
                style={{
                  position: "absolute",
                  left: "50%",
                  bottom: 20,
                  transform: "translateX(-50%)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 10,
                  padding: "14px 18px",
                  background: "var(--bg)",
                  border: "1px solid var(--rule-strong)",
                  borderRadius: 12,
                  maxWidth: "min(92%, 440px)",
                  textAlign: "center",
                  zIndex: 5,
                }}
              >
                <p style={{ margin: 0, font: "400 15px/1.4 var(--serif)", color: "var(--fg)" }}>
                  Use this photo? Nothing is sent for processing until you continue.
                </p>
                {!guest && (
                  <fieldset
                    style={{
                      border: "1px solid var(--rule)",
                      borderRadius: 8,
                      padding: "10px 12px",
                      margin: 0,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      textAlign: "left",
                    }}
                  >
                    <legend style={{ font: "500 12px/1 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase", color: "var(--fg-mute)", padding: "0 6px" }}>
                      After the AI photo clean-up
                    </legend>
                    <label style={{ display: "flex", alignItems: "flex-start", gap: 8, font: "400 13px/1.4 var(--sans)", color: "var(--fg-soft)", cursor: "pointer" }}>
                      <input
                        type="radio"
                        name="mask-mode"
                        checked={segOptions.maskMode !== "MANUAL"}
                        onChange={() => setSegOptions((o) => ({ ...o, maskMode: "AUTO" }))}
                        style={{ marginTop: 2 }}
                      />
                      <span>
                        Let AI detect the walls
                        <span style={{ display: "block", font: "400 12px/1.4 var(--mono)", color: "var(--fg-mute)" }}>
                          included in this project — no extra credit
                        </span>
                      </span>
                    </label>
                    <label style={{ display: "flex", alignItems: "flex-start", gap: 8, font: "400 13px/1.4 var(--sans)", color: "var(--fg-soft)", cursor: "pointer" }}>
                      <input
                        type="radio"
                        name="mask-mode"
                        checked={segOptions.maskMode === "MANUAL"}
                        onChange={() => setSegOptions((o) => ({ ...o, maskMode: "MANUAL" }))}
                        style={{ marginTop: 2 }}
                      />
                      <span>
                        I&apos;ll mark the walls myself
                        <span style={{ display: "block", font: "400 12px/1.4 var(--mono)", color: "var(--fg-mute)" }}>
                          same one project — click each wall after the clean-up
                        </span>
                      </span>
                    </label>
                  </fieldset>
                )}
                {isAdmin && !guest && (
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      font: "400 13px/1.4 var(--sans)",
                      color: "var(--fg-soft)",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(segOptions.cleanImage)}
                      onChange={(e) => setSegOptions((o) => ({ ...o, cleanImage: e.target.checked }))}
                    />
                    Clean the photo before mask generation
                    <span style={{ font: "500 12px/1 var(--mono)", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--fg-mute)" }}>
                      admin · testing
                    </span>
                  </label>
                )}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
                  <button type="button" className="btn btn-ghost" onClick={chooseDifferent}>
                    Choose a different photo
                  </button>
                  <button type="button" className="btn btn-brass" onClick={() => void confirmSelection()}>
                    Continue with this image →
                  </button>
                </div>
              </div>
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
                {(canRetrySegmentation || canRetryCreate) && (
                  <button
                    type="button"
                    onClick={() =>
                      void (canRetrySegmentation
                        ? handleRetrySegmentation()
                        : createAndSegment(pendingImageId!))
                    }
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
            {(limitReached || askRetailer || accessExpired || needVerification || needSubscription || projectLimitReached) && (
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
                      : askRetailer
                        ? "Ask your shop for another"
                        : needSubscription
                        ? "Subscribe to continue"
                        : accessExpired
                          ? "Access ended"
                          : projectLimitReached
                            ? "Monthly projects used up"
                            : "Project limit reached"}
                  </Mono>
                  <p style={{ font: "400 19px/1.5 var(--serif)", color: "var(--fg-soft)", margin: "14px 0 22px" }}>
                    {error ||
                      (needVerification
                        ? "Verify your email and mobile number before creating your project."
                        : askRetailer
                        ? "You've used the projects on your code. Your shop can add another."
                        : needSubscription
                          ? "You\u2019ve used this month\u2019s free projects. Buy one more, pick a plan, or wait for next month."
                          : accessExpired
                            ? "Your access has ended. Ask your paint shop for a new code."
                            : projectLimitReached
                              ? "You've used this month's projects. One more covers the clean-up and finding the walls, same as the rest."
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
                  {projectLimitReached && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "stretch" }}>
                      {/* Points lead only when the balance covers the price — a shop
                          holding 3 of the 80 it needs was shown "Spend 80 points" as its
                          primary action, and got a 402 for pressing it. */}
                      {canPayProjectWithPoints && (
                        <Button
                          variant="brass"
                          onClick={() => void handleBuyProjectAndRetry("points")}
                          disabled={buyingProject !== null}
                        >
                          {buyingProject === "points" ? (
                            <>
                              <Spinner size={14} color="currentColor" />
                              <span>Paying…</span>
                            </>
                          ) : (
                            <>
                              Spend {projectPointPrice} points <span className="arr">→</span>
                            </>
                          )}
                        </Button>
                      )}
                      {/* The card rail, for a shop that has run out and holds no points.
                          It used to live on the subscription page, which meant leaving the
                          upload half-finished to go and find it. */}
                      {projectPaise > 0 && (
                        <Button
                          variant={canPayProjectWithPoints ? "ghost" : "brass"}
                          onClick={() => void handleBuyProjectAndRetry("money")}
                          disabled={buyingProject !== null}
                        >
                          {buyingProject === "money"
                            ? "Opening checkout…"
                            : canPayProjectWithPoints
                              ? `or pay ₹${(projectPaise / 100).toLocaleString("en-IN")} by card`
                              : `Buy a project · ₹${(projectPaise / 100).toLocaleString("en-IN")}`}
                        </Button>
                      )}
                      {/* What the money buys, before it is spent. An extra project is not
                          an unlimited one, and a buyer who only finds that out a month
                          later has been sold something they didn't agree to. */}
                      <Mono>{projectValidityNote}</Mono>
                      <a
                        href="/plan"
                        style={{ font: "400 12px/1 var(--mono)", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--accent-text)" }}
                      >
                        top up your points or upgrade your plan →
                      </a>
                    </div>
                  )}
                  {askRetailer && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "stretch" }}>
                      <Button
                        variant="brass"
                        disabled={asking !== "idle"}
                        onClick={() => void handleAskRetailer()}
                      >
                        {asking === "sending" ? (
                          <>
                            <Spinner size={14} color="currentColor" />
                            <span>Sending…</span>
                          </>
                        ) : asking === "sent" ? (
                          "Sent — your shop has been told ✓"
                        ) : (
                          <>
                            Ask my shop for another project <span className="arr">→</span>
                          </>
                        )}
                      </Button>
                      <Mono>
                        {asking === "sent"
                          ? "They can add it from their counter — refresh once they have."
                          : "They can add one in a click, from the counter."}
                      </Mono>
                    </div>
                  )}
                  {/* An account with no shop behind it. Two honest routes, side by side:
                      pay for a project, or unlock with a code if they have walked into a paint
                      shop since. Offering only the first strands anyone holding a code;
                      offering only the second strands anyone who has no shop to visit. */}
                  {limitReached && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "stretch" }}>
                      {/* Points only when the balance can actually pay. This prompt is
                          reached mainly by an account with no shop behind it — a CUSTOMER,
                          who cannot hold points at all — so leading with a points button
                          led with the one action the backend refuses. The card is the
                          primary route whenever points cannot cover it. */}
                      {canPayProjectWithPoints && (
                        <Button
                          variant="brass"
                          onClick={() => void handleBuyAndRetry("points")}
                          disabled={buying !== null}
                        >
                          {buying === "points" ? (
                            <>
                              <Spinner size={14} color="currentColor" />
                              <span>Paying…</span>
                            </>
                          ) : (
                            <>
                              {/* Points, not rupees — this button debits the balance. It
                                  said "₹80" for a price of 80 POINTS, which is the same
                                  figure in the wrong currency and a promise nobody kept. */}
                              Buy a project{projectPrice ? ` · ${projectPrice} points` : ""} <span className="arr">→</span>
                            </>
                          )}
                        </Button>
                      )}
                      {projectPaise > 0 && (
                        <Button
                          variant={canPayProjectWithPoints ? "ghost" : "brass"}
                          onClick={() => void handleBuyAndRetry("money")}
                          disabled={buying !== null}
                        >
                          {buying === "money"
                            ? "Opening checkout…"
                            : canPayProjectWithPoints
                              ? `or pay ₹${(projectPaise / 100).toLocaleString("en-IN")} by card`
                              : `Buy a project · ₹${(projectPaise / 100).toLocaleString("en-IN")}`}
                        </Button>
                      )}
                      <a className="btn" href="/unlock">
                        Unlock with a shop code <span className="arr">→</span>
                      </a>
                      <Mono>{projectValidityNote}</Mono>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="hv-studio-sidebar">
          <ShadeGrid
            selected={active.shade?.code}
            onSelect={onSelectShade}
            onApplyExact={onApplyCustom}
            activeShade={active.shade}
            activeRegionLabel={active.label}
            activeApplied={active.applied}
            shades={panelShades}
            baseHex={active.applied ? active.hex : undefined}
            activeRegionId={activeRegion}
            regions={regionLites}
            onApplyToRegion={applyShadeTo}
            onKeepOriginal={onKeepOriginalActive}
            hideCodes={hideRawCodes}
            hideNames={hideNames}
            encodeCode={encodeCode}
            onSelectRegion={(id) => setActiveRegion(id)}
            onAddWall={() => {
              setEditingRegionId(null);
              setMaskStudioOpen(true);
            }}
            onEditWall={editRegionMask}
            onDeleteWall={handleDeleteWall}
            masksRemaining={masksRemaining}
            triedShades={triedByRegion[activeRegion]}
            recentShades={recentShades}
            outdoor={classification === "OUTDOOR"}
            clashNote={clashNote}
            onFetchAiPalettes={fetchAiPalettes}
            onAddComboToPdf={guest ? undefined : () => setPdfCaptureArmed(true)}
            // Shop picks appear once the room photo is up — before that there's
            // nothing to apply them to.
            shopCombos={imageUrl ? shopCombos : undefined}
            // Nothing to paint until a photo is up. The panel used to be fully
            // live on the "Name your project" and "Add a photo" screens — you
            // could pick a shade and press Apply and absolutely nothing
            // happened, with no toast and no error.
            awaitingPhoto={!imageUrl}
            onNeedPhoto={needPhoto}
          />
        </div>
      </div>

      {maskStudioOpen && imageUrl && imageDims && (
        <MaskStudio
          key={editingRegionId ?? "new-wall"}
          imageUrl={imageUrl}
          imageDims={imageDims}
          existing={existingMasks}
          remaining={masksRemaining}
          saving={savingMask}
          editTarget={editTarget}
          onClose={() => {
            setMaskStudioOpen(false);
            setEditingRegionId(null);
          }}
          onSave={(mask, category, label) =>
            editingRegionId
              ? void handleUpdateMask(editingRegionId, mask)
              : void handleSaveMask(mask, category, label)
          }
        />
      )}

      {reportOpen && (
        <ReportDialog
          hadCleanedImage={canvasCleaned}
          onSubmit={submitReport}
          onClose={() => setReportOpen(false)}
        />
      )}

      {shareOpen && (
        <ShareDialog
          url={shareUrl}
          creating={sharing}
          error={shareError}
          projectName={projectName || "HueVista room"}
          shades={shareShades}
          captureImage={captureRoomImage}
          onRetry={() => void handleShare()}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  );
}

function FlagIcon() {
  // Flag — "report a problem with this run".
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 22V4" />
      <path d="M4 4h11l-1.5 4L15 12H4z" />
    </svg>
  );
}

function SunIcon() {
  // Sun — the whole-image Brighten control.
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function CompareIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
      <path d="M12 8v8M8 12h8" opacity={0} />
      <path d="M12 2v20" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
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
      className={`hv-studio-dropzone ${isDragging ? "is-dragging" : ""}`}
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
    >
      <span aria-hidden className="hv-studio-dropzone-icon">
        <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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
        A straight-on photo in daylight works best. JPEG, PNG or WebP — any size; large photos are shrunk for you.
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

