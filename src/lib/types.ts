// Must match the backend UserRole enum exactly (auth/model/UserRole.java).
export type UserRole = "ADMIN" | "DISTRIBUTOR" | "RETAILER" | "PAINTER" | "CUSTOMER";
export type AuthProvider = "LOCAL" | "GOOGLE" | "ACCESS_CODE";

export interface AuthUser {
  id: string;
  name: string;
  /**
   * Absent for an account opened with a shop's access code. Those accounts are
   * passwordless and have no real address — only one synthesised from the code —
   * so the backend withholds it rather than presenting a machine identifier as the
   * customer's own e-mail. Anything rendering this must handle it being missing.
   */
  email?: string | null;
  picture?: string | null;
  provider: AuthProvider;
  role: UserRole;
  emailVerified?: boolean;
  /**
   * A contact detail, not a verified one. The backend still returns
   * `phoneVerified` alongside it, but nothing here reads it: with no SMS sender
   * registered, the flag can never move off false, and a "Not verified" chip
   * beside a number the owner cannot verify is a complaint, not information.
   */
  phoneNumber?: string | null;
}

/**
 * One account in the network tree (backend NetworkNodeResponse). Children carry
 * the downline: distributor → retailers → painters. Counts are subtree rollups.
 */
export interface NetworkNode {
  userId: string | null;
  name: string;
  email?: string | null;
  phone?: string | null;
  role: UserRole;
  joinedAt?: string | null;
  orgId?: string | null;
  orgName?: string | null;
  city?: string | null;
  state?: string | null;
  /**
   * DISTRIBUTOR nodes: the platform's own "house" distributor, which carries every
   * shop no partner distributor brought in.
   *
   * It is a real distributor organization in the tree but not a distributor ACCOUNT,
   * which is why the distributor total does not count it — the flag is what lets the
   * report say so instead of showing an unexplained extra branch.
   */
  house?: boolean;
  retailerCount: number;
  painterCount: number;
  /** Customers in this subtree — the walk-ins a shop onboarded with an access code. */
  customerCount: number;
  codesIssued: number;
  codesRedeemed: number;

  /**
   * CUSTOMER nodes: projects the shop gave them, and how many they have used.
   *
   * Read as a pair — it is what tells a working customer from a code that was
   * redeemed and never touched. `projectsUsed` never falls: deleting a project
   * does not hand the slot back.
   */
  projectAllowance?: number | null;
  projectsUsed?: number | null;
  /** CUSTOMER nodes: when their access lapses. Past dates are shown, not hidden. */
  accessExpiresAt?: string | null;
  /**
   * Paint brands a distributor granted this shop (RETAILER nodes). Read it with
   * `brandsRestricted` — an empty list means "all brands" when the shop is
   * unrestricted and "no brands at all" when it isn't, and the list alone can't
   * tell those apart.
   */
  assignedBrands?: string[] | null;
  brandsRestricted?: boolean;
  /** Labels of the pages the distributor switched on. Same reading rule as above. */
  assignedFeatures?: string[] | null;
  featuresRestricted?: boolean;
  children: NetworkNode[];
}

/** One assignable paint brand for a shop, with whether it's currently granted. */
export interface RetailerBrandOption {
  id: number;
  name: string;
  slug: string;
  assigned: boolean;
}

/**
 * A page a distributor can switch on for a shop (backend `AppFeature`).
 *
 * Only genuinely optional pages appear here. The dashboard, account settings and
 * plan page are never restrictable — a shop locked out of its own billing page
 * could never fix a lapsed subscription.
 */
export type AppFeatureKey =
  | "STUDIO"
  | "COLOR_FINDER"
  | "CATALOGUE"
  | "PRODUCTS"
  | "CUSTOMER_PORTAL"
  | "NETWORK";

/** One assignable page for a shop, with whether it's currently switched on. */
export interface RetailerFeatureOption {
  key: AppFeatureKey;
  label: string;
  /** The route this option gates, e.g. "/colour-finder". */
  path: string;
  description: string;
  assigned: boolean;
}

/**
 * What the signed-in caller may see — drives the nav tabs and the page guards.
 *
 * Both allowances are three-state, because two states can't say what's needed:
 * not restricted at all, restricted to a list, or restricted to nothing. Read
 * each `allowed*` list only when its `*Restricted` flag is true.
 *
 * Non-retailers always come back unrestricted; this is a distributor→shop
 * constraint and never applies upward.
 */
export interface MyAccess {
  role: UserRole;
  orgId?: string | null;
  orgName?: string | null;
  brandsRestricted: boolean;
  allowedBrands: string[];
  featuresRestricted: boolean;
  allowedFeatures: AppFeatureKey[];
  /** Routes for `allowedFeatures`, so the frontend needn't hardcode the mapping. */
  allowedPaths: string[];
  /** The shop's own tier, or FREE when nothing is in force. */
  plan?: PlanName | null;
  planDisplayName?: string | null;
  /**
   * Pages the shop's PLAN does not include — `COLOR_FINDER` on the free tier.
   *
   * A second list rather than a subtraction from `allowedFeatures`, because the two
   * closed pages need different words: one is lifted by ringing the distributor, the
   * other by pressing subscribe. Sending a free shop to its distributor for something no
   * distributor can switch on is exactly what collapsing them would do.
   *
   * Optional so a server too old to send it reads as "nothing withheld" rather than as
   * "everything withheld".
   */
  planLockedFeatures?: AppFeatureKey[];
  /** Routes for `planLockedFeatures`, on the same terms as `allowedPaths`. */
  planLockedPaths?: string[];
}

/** Role-scoped network report (backend NetworkReportResponse). */
export interface NetworkReport {
  viewerRole: UserRole;
  totals: Record<string, number>;
  roots: NetworkNode[];
}

/** Returned after a verification code is sent. */
export interface VerificationStatus {
  channel: "EMAIL" | "PHONE";
  /** Masked destination, e.g. "j***@gmail.com" or "******321". */
  destination: string;
  expiresInSeconds: number;
  cooldownSeconds: number;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  user: AuthUser;
  /** True when the password was right but an emailed code is still required
   *  (ADMIN accounts with mail configured). Tokens are absent until the code
   *  is submitted via authApi.loginOtp. */
  twoFactorRequired?: boolean | null;
}

export interface UserProfile extends AuthUser {
  createdAt?: string;
  updatedAt?: string;
}

export type ImageClassification = "INDOOR" | "OUTDOOR" | "UNKNOWN";

export interface UploadedImage {
  imageId: string;
  imageUrl: string;
  originalFilename: string;
  imageType: ImageClassification;
  fileSize: number;
  uploadedAt: string;
}

export interface ApiError {
  status: number;
  message: string;
  fieldErrors?: Record<string, string>;
  // Machine-readable hint for specific cases (e.g. "VERIFICATION_REQUIRED",
  // "SUBSCRIPTION_REQUIRED") so the UI can branch beyond the HTTP status.
  code?: string;
}

/**
 * Canonical colour families, used for the bundled sample shades and as the
 * fallback bucket when a catalogue shade has no family in the shades table.
 * Live shades keep whatever family their brand's data actually uses (e.g.
 * "Off Whites"), so filter UIs must derive their options from the data.
 */
export type ColorFamily =
  | "Whites"
  | "Neutrals"
  | "Earths"
  | "Reds"
  | "Greens"
  | "Blues"
  | "Yellows"
  | "Greys"
  | "Browns";

/**
 * Companies whose catalogues we cover, used only to seed a picker before the live
 * list arrives and to show "· soon" against one that isn't loaded yet. The real
 * brand list is dynamic — derived from the shades the backend returns — so a newly
 * uploaded company (e.g. "Birla Opus") appears without a code change.
 *
 * These are real company names, and that is the point: they say whose shades a shop
 * can look up. They are never presented as partners, and no shade is ever attributed
 * to one of them unless it came from that company's own catalogue data — the bundled
 * fallback shades are labelled "Sample palette" precisely so they cannot be.
 */
export const PAINT_BRANDS = ["Asian Paints", "Berger", "Nerolac", "Dulux"] as const;
export type ShadeBrand = string;

/** A company present in the shade catalogue (backend GET /api/shades/brands). */
export interface ShadeBrandSummary {
  name: string;
  slug: string;
  shadeCount: number;
}

/** One shade as the decoder returns it (backend ShadeResponse, the fields the counter reads). */
export interface DecodedShade {
  brandName?: string | null;
  brandSlug?: string | null;
  shadeCode?: string | null;
  hvCode?: string | null;
  name?: string | null;
  hexCode?: string | null;
  shadeFamily?: string | null;
}

/**
 * What the counter gets back for a customer's code (backend ShadeDecodeResponse).
 *
 * `shade` is what the code IS. `brandMatch` is what this shop can actually sell —
 * the nearest colour in a company they stock, which is the question that follows
 * every lookup where the customer designed their room against something else.
 */
export interface ShadeDecodeResult {
  query: string;
  /** How it resolved. Absent when nothing matched at all. */
  matchedBy?: "HV_CODE" | "SHADE_CODE" | null;
  shade?: DecodedShade | null;
  /**
   * Set instead of `shade` when a bare manufacturer code is carried by more than one
   * company. Manufacturer codes are only unique within a company, so this is a
   * question for the counter rather than something the server may guess at.
   */
  candidates?: DecodedShade[] | null;
  brandMatch?: {
    brandName: string;
    brandSlug: string;
    shade: DecodedShade;
    /** True only when this company carries the very colour, not an approximation. */
    exact: boolean;
    /** CIE76 ΔE from the decoded colour. 0 when exact. */
    deltaE: number;
    /** That distance in words, for a counter that does not think in ΔE. */
    closeness: string;
  } | null;
}

export interface PaintShade {
  code: string;
  /**
   * The platform-wide customer-facing code — "HV0348" — that any HueVista shop can
   * decode and nobody else can. This is what a customer, a guest or a share-link
   * viewer is shown in place of {@link code}; shop staff see the manufacturer's own.
   *
   * Null for a shade the backend sent without one (an older deployment), in which
   * case callers fall back to the real code.
   */
  hvCode?: string | null;
  name: string;
  hex: string;
  /** The brand's own family name from the shades table, e.g. "Off Whites". */
  family: string;
  lrv: number;
  brand: ShadeBrand;
  /** Recommended finishes as the shades table spells them, e.g. "Matt", "Eggshell". */
  finishes: ReadonlyArray<string>;
}

export type RegionKind = "MAIN_WALL" | "ACCENT_WALL" | "TRIM" | "MANUAL";

export interface Region {
  id: string;
  kind: RegionKind;
  label: string;
  maskUrl?: string;
  shade?: PaintShade;
}

export type ProjectStatus = "CREATED" | "SEGMENTING" | "SEGMENTED" | "FAILED";

/**
 * Which half of a FAILED run gave up: the photo clean-up, or wall detection.
 *
 * Carried so the studio can offer the report with the right problem already ticked
 * — the two are different bugs in different models, and a user who has just been
 * told their run failed should not also have to diagnose it. Absent on runs that
 * failed for a reason belonging to neither stage.
 */
export type FailureStage = "CLEAN" | "MASK";

export type RegionCategory = "MAIN_WALL" | "ACCENT_WALL" | "OTHER_WALL" | "TRIM" | "MANUAL";

export interface RegionDetail {
  id: number;
  label: string;
  category: RegionCategory;
  maskData?: string | null;
  maskUrl?: string | null;
  appliedShadeCode?: string | null;
  /**
   * The platform-wide code for the applied shade — "HV0348".
   *
   * Present where {@link appliedShadeCode} is deliberately absent (the shared-link
   * view), because it gives nothing away: it names no paint company and no colour,
   * and only a HueVista shop can read it back into a tin.
   */
  appliedHvCode?: string | null;
  appliedHexCode?: string | null;
  displayOrder?: number | null;
  /** True for walls the user drew by hand (vs. AI-detected). Only these may be
   *  deleted. Survives reload independently of the region's category. */
  manual?: boolean;
}

/** Options sent with a segmentation request. maskMode is a real product choice
 *  open to everyone: "AUTO" (default) runs AI wall detection after the
 *  compulsory photo clean-up and consumes one auto-mask credit; "MANUAL" stops
 *  after the clean-up so walls are marked by hand (free, unlimited on every
 *  plan). cleanImage is an ADMIN-only testing knob (the backend strips it for
 *  other roles): false skips the image-cleaner step. Masks are always stored
 *  raw — exactly as the model painted them. */
export interface SegmentationOptions {
  cleanImage?: boolean;
  maskMode?: "AUTO" | "MANUAL";
  /** ADMIN-only testing knob (the backend strips it for other roles): make the
   *  image models decline for one half of this run, so the recovery paths can be
   *  walked through on demand instead of waited for. "CLEAN" fails the run at the
   *  clean-up stage; "MASK" lets the clean land and returns no walls (the project
   *  comes back on its cleaned canvas with `autoMaskFailed`); "BOTH" is a wholly
   *  unavailable Nano Banana; "NONE" forces an honest run on a deployment where
   *  the simulation is switched on globally. */
  simulateFailure?: "NONE" | "CLEAN" | "MASK" | "BOTH";
  /** ADMIN-only testing knobs (the backend strips them for other roles): which
   *  Replicate model runs this run's photo clean-up, and which one generates its
   *  wall mask, instead of the configured ones — so two models can be compared on
   *  the same photo. The id must be one the backend offers (`listAiModels`); the
   *  empty string is how the studio says "back to the configured model".
   *
   *  A pinned model is asked ALONE: the clean's usual fallback hierarchy is not
   *  walked, because a comparison answered by some other model is worse than no
   *  answer — nothing in the image says which one produced it. */
  cleanModel?: string;
  maskModel?: string;
}

/** One image model an admin may pin a run to. Served by the backend rather than
 *  listed here so the studio can only ever offer models the backend will run —
 *  the same list the segment endpoint validates against. `family` is the request
 *  schema it speaks (NANO_BANANA / FLUX / FLUX_KONTEXT / OPENAI / SEEDREAM). */
export interface AiModelOption {
  id: string;
  label: string;
  family: string;
}

export interface ProjectDetail {
  id: string;
  name: string;
  roomType?: string | null;
  notes?: string | null;
  status: ProjectStatus;
  imageId: string;
  imageUrl: string;
  /** The scene the pipeline ran this project as. Travels with the project because
   *  the upload response is not where it is finally decided: a guest upload arrives
   *  UNKNOWN and is classified when segmentation runs. */
  imageType?: ImageClassification | null;
  cleanedImageUrl?: string | null;
  /** The model's raw colour-coded mask (RED/GREEN/BLUE/BLACK) from the accepted
   *  generation — admin mask-viewer diagnostics. Null for projects segmented
   *  before raw-mask capture shipped or with manual-only regions. */
  rawMaskUrl?: string | null;
  failureReason?: string | null;
  /** Set when status is FAILED: which stage gave up. See FailureStage. */
  failureStage?: FailureStage | null;
  /** "AUTO" / "MANUAL" — the wall-creation choice this project was segmented
   *  with; null/undefined = default AUTO. MANUAL projects arrive SEGMENTED with
   *  zero auto regions: the cleaned canvas is ready for hand-marked walls. */
  maskMode?: "AUTO" | "MANUAL" | null;
  /** This project ASKED for AI wall detection, got its cleaned photo, and the mask
   *  model still found nothing. The project is SEGMENTED and fully workable — it
   *  just has no walls yet, so they are the user's to mark. Not a failure and not
   *  a choice: `maskMode` stays "AUTO", and this is what tells the two apart. The
   *  team has already been told; the pipeline files its own report here, because
   *  somebody holding a working room never would. */
  autoMaskFailed?: boolean;
  /** What to SAY about `autoMaskFailed`, written by the backend so the studio, the
   *  share view and the kiosk stop each inventing their own wording. Null unless
   *  `autoMaskFailed`. */
  autoMaskNotice?: string | null;
  /** What the AI run is doing right now, while `status` is SEGMENTING — "That model
   *  was busy — trying Nano Banana 2 (2 of 4)". The pipeline walks a chain of models
   *  and hands over whenever one is busy; without this the studio shows one motionless
   *  spinner for minutes, and a working run is indistinguishable from a dead one. */
  aiProgressNote?: string | null;
  /** The image models this project's last run was PINNED to by an admin comparing
   *  models; null/undefined (the normal case) means the server's configured ones.
   *  Read by the admin mask viewer so the canvas and mask on screen can be
   *  attributed — a comparison nobody can attribute afterwards was not one. */
  cleanModel?: string | null;
  maskModel?: string | null;
  regions: RegionDetail[];
  hasShareLink?: boolean;
  shareExpiresAt?: string | null;
  /** Shared/public view only: brand names the retailer opened for the share
   *  viewer's repaint palette. Empty = every brand. */
  sharedBrands?: string[] | null;
  /** Shared/public view only: how the issuing shop presents a colour — its code
   *  pattern and whether paint names show. Travels with the project because the
   *  share viewer has no session to resolve it from. */
  shadeCodeScheme?: import("./shade-codes").ShadeCodeScheme | null;
  /** When the customer sent the project to the issuing shop; null until then. */
  sentToShopAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  /** Look but don't touch: the colours last applied still render, every write is
   *  refused. Set when the subscription has ended, or when a bought project's own
   *  validity has run out. The studio disables the palette on this rather than
   *  letting the user paint and then fail on autosave. */
  readOnly?: boolean;
  /** Why, in a sentence fit to show. Absent when the project is fully open. */
  readOnlyReason?: string | null;
  /** When this project's paid validity ends. Absent when it has no window of its
   *  own (covered by a plan or a shop's code) or while that window is paused. */
  accessExpiresAt?: string | null;
  /** What reopening THIS project costs, on both rails. Only meaningful while readOnly,
   *  and read from the project rather than the account quote: a lapsed window and a
   *  closed project are different purchases at different prices, and only the project
   *  knows which one this is. */
  reopenPricePoints?: number;
  reopenPricePaise?: number;

  /** Copied off the free library shelf.
   *
   *  What the shelf gives away is the way IN — the photograph was already stored and the
   *  walls already detected, so opening one costs no plan credit and needs no
   *  subscription. Everything after that is the ordinary job on the ordinary terms: the
   *  board cap applies, the last board closes it, and the AI image is bought with an AI
   *  credit (a library room includes none). So this changes nothing the studio offers —
   *  it is here for the dashboard, which labels where a room came from. */
  fromLibrary?: boolean;

  /** When the job finished — by the customer closing it, or by its last colour board.
   *  Absent while it is still running. A closed project is read-only whatever plan or
   *  access code is covering it, and the studio shows only its board combinations. */
  closedAt?: string | null;
  /** Colour boards handed over, and how many this project gets. The tray counts down
   *  with these so "one board left" can be said before the last one closes it. */
  boardsUsed?: number;
  boardsAllowed?: number;
  /** AI images this room has made. A count, not an allowance: no room includes an image
   *  and none can be bought for one room alone. Every image is paid for with an AI credit
   *  from the ACCOUNT's wallet, which is where the studio reads the price from. */
  rendersUsed?: number;
}

/** Where a dashboard room came from, seen from the reader's side. */
export type ProjectSource = "OWN" | "CUSTOMER";

export interface ProjectSummary {
  id: string;
  name: string;
  status: ProjectStatus;
  imageId: string;
  imageUrl: string;
  /** Cleaned (AI photo clean-up) image, when produced; null/absent until the
   *  project has been cleaned. Drives the dashboard raw-vs-cleaned slider. */
  cleanedImageUrl?: string | null;
  regionCount: number;
  hasShareLink?: boolean;
  createdAt?: string;
  updatedAt?: string;
  /** "OWN" — the reader created it; "CUSTOMER" — one of their customers did, under a
   *  code this shop issued. The dashboard filter runs on exactly this. */
  source?: ProjectSource;
  /** For a CUSTOMER room: the name the shop typed when it issued the code. */
  customerName?: string | null;
  /** For a CUSTOMER room: the code it was created under, and that code's id. */
  accessCode?: string | null;
  accessCodeId?: string | null;
  /** Look-but-don't-touch (subscription lapsed, or this room's validity ran out). */
  readOnly?: boolean;
  /** Copied off the free library shelf. It carries no paid validity of its own, so the
   *  expiry line has nothing to show for one — but it closes like any other room, so the
   *  "done" badge means the same thing here as everywhere else. */
  fromLibrary?: boolean;
  /** When this room's paid validity ends; absent when it has no window of its own. */
  accessExpiresAt?: string | null;
  /** When the job finished. A closed room is DONE; a merely read-only one ran out.
   *  They look the same on a card unless this is used to tell them apart. */
  closedAt?: string | null;
}

/** One combination the customer was handed on a colour board — the unit the closing
 *  flow asks them to choose between, and all a closed project will still show them. */
export interface ProjectCombo {
  id: string;
  /** Which board it came from (1-based) and where it sat in it (0-based). */
  boardIndex: number;
  pageIndex: number;
  title?: string | null;
  /** Whether an AI render of this combination already exists. */
  rendered: boolean;
  shades: ProjectComboShade[];
}

export interface ProjectComboShade {
  /** The region this colour was on, when it still exists — what the preview repaints. */
  regionId?: number | null;
  regionLabel?: string | null;
  shadeCode?: string | null;
  shadeName?: string | null;
  /** The platform-wide HV code for `shadeCode`, resolved server-side. Present so a board
   *  rebuilt away from the studio — the closing sheet that carries the AI image — prints
   *  the same customer-facing code the original did, without fetching the catalogue. */
  hvCode?: string | null;
  /** The colour itself. The one field a combo cannot be re-rendered without. */
  hex: string;
}

/** One page of a colour board, as it is reported to the server after being built.
 *  Mirrors the studio's own PdfImageEntry minus the pixels — the server keeps the
 *  shades, not the picture, and re-renders the combo from them when it needs to. */
export interface ColourBoardPage {
  title?: string;
  shades: ColourBoardPageShade[];
}

export interface ColourBoardPageShade {
  regionId?: number | null;
  regionLabel?: string | null;
  shadeCode?: string | null;
  shadeName?: string | null;
  /** #rrggbb. Validated server-side — it ends up in an AI prompt. */
  hex: string;
}

/** What comes back from recording (and charging for) a colour board. */
export interface ColourBoardResult {
  allowance: PdfAllowance;
  /** Boards this project has handed over, and how many it gets. */
  boardsUsed: number;
  boardsAllowed: number;
  /** True when this board was the one that closed the project — the signal to send
   *  the customer on to choose a combination and render it. */
  closed: boolean;
}

export type RenderStatus = "QUEUED" | "RUNNING" | "READY" | "FAILED";

/** The options a render is made with. All closed sets: the only free text is the note,
 *  and it is bounded and framed as data before it reaches the model. */
export interface RenderOptions {
  timeOfDay: "DAY" | "NIGHT";
  /** KEEP_ORIGINAL sends the project's own masks so the model paints inside the
   *  boundaries that are already there; AI_SUGGESTED lets it propose the trim. */
  borderMode: "KEEP_ORIGINAL" | "AI_SUGGESTED";
  lighting: "NATURAL" | "WARM" | "COOL" | "DRAMATIC";
  furnishing: "KEEP" | "STAGED" | "EMPTY";
  style: "MODERN" | "MINIMAL" | "TRADITIONAL" | "HERITAGE" | "LUXE";
  /**
   * How good an image to make, and therefore what it costs in credits.
   *
   * Optional: omitting it asks for BASIC, which is what every render made before the tiers
   * existed was. Defaulting the other way would charge four credits for saying nothing.
   */
  quality?: RenderQuality;
  /**
   * Which photograph of the room the model paints.
   *
   * Optional: omitting it asks for CLEANED, which is what every image made before the
   * choice existed was given and the better starting point in the ordinary case. ORIGINAL
   * is for the times the clean-up took something real with it — a picture rail, a texture,
   * a shadow that was the point of the photograph. A room with no cleaned photo gets its
   * original either way.
   */
  sourceImage?: RenderSourceImage;
  note?: string;
}

/** Which photograph of the room an image is painted from. */
export type RenderSourceImage = "CLEANED" | "ORIGINAL";

/**
 * One finished room offered as the starting point for a new AI image, from
 * `GET /api/me/renderable-projects`.
 *
 * Deliberately not `ProjectSummary`. That describes a room to work IN — its status, its
 * regions, its access window, whose shop it is — and none of that is a reason to pick one
 * here. This carries what the choice is actually made on: what the room is called, what it
 * looks like, and how many combinations are waiting in it.
 */
export interface RenderableProject {
  id: string;
  name: string;
  roomType?: string | null;
  /** The photograph as it was taken. Always present. */
  imageUrl: string;
  /** The cleaned photograph, or null when the room never got one — which is what tells
   *  the picker there is no choice to offer rather than one with a single real option. */
  cleanedImageUrl?: string | null;
  /** When the job finished. Never null: only closed rooms are offered. */
  closedAt?: string | null;
  /** Combinations this room can be photographed in. Never zero. */
  comboCount: number;
}

/** One AI render, while it is being made and after it lands. */
export interface ProjectRender extends RenderOptions {
  id: string;
  /** The colour-board combination it was made from. */
  comboId?: string | null;
  status: RenderStatus;
  /** The finished image, presigned fresh on every read. Null until READY. */
  imageUrl?: string | null;
  /** Why it failed, fit to show. Null unless FAILED — and a failed render has
   *  already handed its credit back, so trying again costs nothing. */
  failureReason?: string | null;
  createdAt?: string;
  completedAt?: string | null;
}

/**
 * One finished AI image, seen from the ACCOUNT rather than from a project.
 *
 * `ProjectRender` above is what the studio polls while an image is being made: it belongs
 * to a project the caller already has open, so it needs no room name and no shades. This
 * is the other view — the shelf at /ai-images, where an image made last week has to be
 * findable without remembering which room it was on.
 *
 * That is why it carries the project's name and the combination's shades. Both are needed
 * to say what the picture is, and the shades in particular are what let a single image be
 * printed on a sheet of its own: a page with the picture and no colours on it would be a
 * screenshot, not a colour document.
 */
export interface MyRender extends RenderOptions {
  id: string;
  /** The room it was made from, so the shelf can name it and link back to it. */
  projectId: string;
  projectName: string;
  roomType?: string | null;
  /** Always "READY" on this endpoint — the shelf shows finished pictures only. */
  status: RenderStatus;
  /** Presigned fresh on every read, like every other image URL in the product. */
  imageUrl?: string | null;
  /** The colour-board combination it was made from, when that page still exists. */
  comboId?: string | null;
  comboTitle?: string | null;
  boardIndex?: number | null;
  /** The shades that combination was printed in. Empty when the board page has since
   *  been deleted — the image still downloads, it just has no shade table to print. */
  shades: ProjectComboShade[];
  createdAt?: string;
  completedAt?: string | null;
}

export interface RegionColorUpdate {
  regionId: number;
  shadeCode?: string | null;
  hexCode?: string | null;
}

/** A time-limited public share link for a project (backend ShareResponse). */
export interface ShareLink {
  shareUrl: string;
  shareToken: string;
  expiresAt?: string | null;
}

/** A catalogue shade matched to an AI-suggested colour (backend MatchedShade). */
export interface AiMatchedShade {
  id: number;
  shadeCode: string;
  name: string;
  hexCode: string;
  brand?: string | null;
  shadeFamily?: string | null;
  aiDescription?: string | null;
  deltaE?: number;
}

/** One AI palette: primary + accent + trim, each matched to a real shade (backend ColorCombo). */
export interface AiColorCombo {
  name: string;
  rationale?: string | null;
  primaryHex: string;
  primaryShade?: AiMatchedShade | null;
  accentHex?: string | null;
  accentShade?: AiMatchedShade | null;
  trimHex?: string | null;
  trimShade?: AiMatchedShade | null;
}

/** Claude colour recommendations for a project (backend RecommendationResponse). */
export interface AiRecommendationResponse {
  projectId: string;
  imageType?: string | null;
  combinations: AiColorCombo[];
}

/** A customer's project entitlement (allowance + day-validity), managed by their retailer. */
export interface CustomerEntitlement {
  customerId: string;
  customerName: string;
  /** Absent for an account provisioned from an access code — its stored address is
   *  synthesised from the code, so there is nothing real to show. */
  customerEmail?: string | null;
  retailerOrgId?: string | null;
  accessExpiresAt?: string | null;
  expired: boolean;
  projectAllowance: number;
  projectsCreated: number;
  projectsRemaining: number;
  updatedAt?: string;
}

/**
 * One recorded act of a shop giving projects away (backend ProjectGrantResponse).
 *
 * Every granted project reserves an image credit against the shop's plan, so grants are
 * recorded rather than just applied — that is what makes them reversible.
 */
export interface ProjectGrant {
  id: string;
  /** Exactly one is set: the grant went to a customer, or onto a code. */
  customerUserId?: string | null;
  accessCodeId?: string | null;
  projects: number;
  createdAt?: string | null;
  revokedAt?: string | null;
  /**
   * Whether "take back" would succeed right now. False once the customer has used the
   * projects, and false after the billing period that funded the grant has renewed —
   * releasing those images into a new period would mint quota the old one paid for.
   */
  revocable: boolean;
}

/** Minimal organization shape (backend OrgResponse). */
export interface OrgResponse {
  id: string;
  name: string;
  slug: string;
  type: "DISTRIBUTOR" | "RETAILER";
  ownerUserId?: string;
  ownerName?: string;
}

// --- Customer support ---
export type SupportSender = "USER" | "AI" | "AGENT" | "SYSTEM";
export type SupportConversationStatus = "OPEN" | "NEEDS_HUMAN" | "RESOLVED";
export type SupportChannel = "IN_APP";

export interface SupportMessage {
  id: string;
  sender: SupportSender;
  body: string;
  createdAt?: string | null;
}

export interface SupportConversation {
  id: string;
  channel: SupportChannel;
  status: SupportConversationStatus;
  subject?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  messages: SupportMessage[];
}

export interface SupportConversationSummary {
  id: string;
  channel: SupportChannel;
  status: SupportConversationStatus;
  subject?: string | null;
  requesterName?: string | null;
  requesterEmail?: string | null;
  requesterRole?: string | null;
  lastMessage?: string | null;
  updatedAt?: string | null;
}

// --- Paint product catalogue (shopkeeper-managed) ---
export type ProductCategory = "INTERIOR" | "EXTERIOR";
export type QualityTier = "ECONOMY" | "PREMIUM" | "LUXURY";

export interface PaintBrand {
  id: number;
  name: string;
  slug: string;
}

export interface PaintLine {
  id: number;
  name: string;
  category: ProductCategory;
  qualityTier: QualityTier;
  defaultFinish?: string | null;
}

export interface ShopProduct {
  id: string;
  lineId: number;
  brandName?: string | null;
  lineName?: string | null;
  category?: ProductCategory | null;
  price?: number | null;
  priceUnit?: string | null;
  packSize?: string | null;
  coverage?: string | null;
  finish?: string | null;
  qualityTier?: QualityTier | null;
  brightness?: number | null;
  imageUrl?: string | null;
  features?: string | null;
  description?: string | null;
  createdAt?: string | null;
}

/** A customer access code a retailer issues (backend AccessCodeResponse). */
export interface AccessCode {
  id: string;
  code: string;
  organizationId: string;
  organizationName?: string;
  validDays: number;
  expiresAt?: string | null;
  used: boolean;
  expired: boolean;
  usedAt?: string | null;
  createdAt?: string | null;
  /** The customer this code was issued to (retailer-entered). */
  customerName?: string | null;
  /** Projects the customer may create with this code. */
  projectQuota?: number;
  /** Rooms actually created against this code so far. */
  projectsUsed?: number;
  /** What is left of `projectQuota` after `projectsUsed`. */
  projectsRemaining?: number;
  /** Paint companies unlocked for this customer. Empty/absent = all brands. */
  allowedBrands?: string[];
  /** Individual product ids unlocked, in addition to whole companies. */
  allowedProductIds?: string[];
  /** Cancelled by the shop before anyone redeemed it — its held quota is already back. */
  revoked?: boolean;
  revokedAt?: string | null;
  /** Still cancellable/editable: nobody has redeemed it and it hasn't been cancelled. */
  editable?: boolean;
  /** Resolved individual products (present on the issue response, not the list). */
  assignedProducts?: ShopProduct[];
  /** When the shop last pushed this code's expiry out, and how often they have. Each
   *  extension resets the window to a fresh 10 days, so a code never carries more
   *  than 10 days ahead however many times it is renewed. */
  extendedAt?: string | null;
  extensionCount?: number;
  /** Whether the shop may still top this code up (add projects, add 10 days). Unlike
   *  `editable` this survives redemption — topping up a code the customer is actively
   *  using is the whole point. False once the code is cancelled. */
  topUpAllowed?: boolean;
}

/**
 * What one extra project costs THIS account on both rails, and what it buys
 * (backend ProjectPurchaseOptionsResponse).
 *
 * The price falls with the buyer's plan — 80 points / ₹199 with none, down to
 * 40 points / ₹45 on Business — so it is always read from here rather than held as a
 * constant in the UI, where it would quietly go wrong for everyone but one tier.
 */
export interface ProjectPurchaseOptions {
  /** Whether a PAID plan is covering this account — what sets the rate below. */
  subscribed: boolean;
  /** The tier the price was read off; "FREE" when no paid plan is covering the account. */
  pricingPlan: "FREE" | "STARTER" | "PROFESSIONAL" | "BUSINESS" | "ENTERPRISE";
  /** What one project costs, in points. */
  projectPricePoints: number;
  /** What one project costs in money, in paise (GST included). Dearer than the points
   *  price on every tier — that gap is what makes topping up worth doing. */
  projectPricePaise: number;
  /** The bundle: how many projects it grants, and what it costs in paise. Quoted beside
   *  the single price, never instead of it — the saving is only legible next to the
   *  thing it discounts. Optional so an older backend reads as "no bundle offered". */
  bundleCredits?: number;
  bundlePricePaise?: number;
  /** What another window on a lapsed project costs — points, and money in paise.
   *  Flat on both rails, unlike a new project: a reopen buys more time on work already
   *  paid for once, so it does not get cheaper with the tier. */
  reopenPricePoints: number;
  reopenPricePaise: number;
  /** Spendable balance, so the caller can say whether it is enough. */
  pointsBalance: number;
  /**
   * Whether this account can spend points AT ALL — not whether it holds enough. Points
   * are a shop currency and the backend refuses every non-retailer, so a CUSTOMER reads
   * false here whatever the balance says. When it is false, money is the only rail and
   * the points button must not be offered: it can only come back a 403.
   *
   * Optional so an older backend (which sends no such field) reads as undefined rather
   * than as a hard "no", and the UI falls back to offering both rails as it did before.
   */
  pointsEligible?: boolean;
  /** Days of access a purchase (or a reopen) opens. */
  validDays: number;
  /** Standalone credits already paid for and not yet created — what a shop BETWEEN plans
   *  holds. On a live plan an extra goes into the plan's own allowance instead. */
  availableCredits: number;
}

/** Razorpay order details for buying one extra project with money. */
export interface ProjectOrder {
  orderId: string;
  pricingPlan: string;
  /** What it costs, in paise — derived server-side from the buyer's plan. */
  amount: number;
  currency: string;
  razorpayKeyId: string;
}

/** The outcome of paying to reopen a lapsed project (backend ProjectReopenResponse). */
export interface ProjectReopenResult {
  projectId: string;
  accessExpiresAt?: string | null;
  /** True while a live subscription is holding the window — the paid days are banked. */
  paused: boolean;
  /** What the reopen cost. Exactly one of these is non-zero — points when it was paid
   *  from the reward balance, paise when it was paid by card. */
  pointsSpent: number;
  amountPaise?: number;
  daysAdded: number;
}

/**
 * Result of redeeming a retailer code with no login — the backend auto-provisions a
 * passwordless CUSTOMER account and returns a full session (backend RedeemAccountResponse).
 */
/** One shop's unlocked paint, inside {@link AssignedProducts}. */
export interface AssignedShop {
  /** Stable id — what a collapsed/expanded section is remembered against. */
  shopId: string;
  shopName: string;
  /** Whole companies unlocked. Empty/absent = no company restriction (all brands). */
  allowedBrands?: string[];
  /** Individually unlocked products, resolved to full listings. */
  products: ShopProduct[];
}

/**
 * The paint a customer may browse, grouped by the shop that unlocked it (backend
 * AssignedProductsResponse).
 *
 * A LIST of shops, because a customer may hold codes from several — the shop near work
 * and the shop near home are both real unlocks that were separately paid for. This used
 * to describe exactly one, so redeeming a second code looked like it had replaced the
 * first: same page, different shop name, the first shop's paint simply gone.
 */
export interface AssignedProducts {
  shops: AssignedShop[];
}

// --- Retailer-curated shade combinations ("shop picks") ---

export type ComboScope = "INTERIOR" | "EXTERIOR";

/** One slot of a combo — denormalised so it renders even if the catalogue changes. */
export interface ComboShade {
  code: string;
  name: string;
  hex: string;
}

/** A shop's suggested three-shade combination (backend RetailerComboResponse).
 *  Shades are in the studio's palette role order: main wall, accent wall, trim. */
export interface RetailerCombo {
  id: string;
  organizationId: string;
  organizationName?: string;
  name: string;
  scope: ComboScope;
  shades: ComboShade[];
  createdAt?: string | null;
}

// --- In-store kiosk (public store links + shop reward points) ---

/** A retailer's public kiosk link (backend StoreLinkResponse). */
export interface StoreLink {
  id: string;
  slug: string;
  organizationId: string;
  organizationName?: string;
  /** What a walk-in pays. One flat platform price — the shop does not set it. */
  pricePaise: number;
  currency: string;
  /**
   * The window on the code a walk-in buys — a platform default, not a per-link
   * choice. Still served because links created under the old form carry the number
   * their shop picked, and a code sold under one keeps the window it was sold with.
   */
  validDays: number;
  /** False while the shop has the kiosk paused. A deleted link is not returned at all. */
  active: boolean;
  createdAt?: string | null;
  /** Points the shop earns per sale — its reward, in place of a share of the price. */
  bonusPoints?: number;
}

/** What an anonymous kiosk visitor sees for a store link (backend StorePublicInfoResponse). */
export interface StorePublicInfo {
  slug: string;
  shopName: string;
  pricePaise: number;
  currency: string;
  validDays: number;
  active: boolean;
  paymentsConfigured: boolean;
}

/** A Razorpay order for one kiosk image upload (backend StoreOrderResponse). */
export interface StoreOrder {
  orderId: string;
  amount: number;
  currency: string;
  razorpayKeyId: string;
  shopName: string;
}

/** Result of a verified kiosk payment: pickup code + live guest session. */
export interface StoreCheckoutResult {
  code: string;
  shopName: string;
  validDays: number;
  expiresAt: string;
  amountPaise: number;
  /**
   * A live session on the account the purchase landed on. The walk-in is signed in
   * with this and starts work immediately — the sign-up is deferred, not skipped.
   */
  session: AuthResponse | null;
  /** Where the receipt went, echoed back so a typo is visible while they're still there. */
  accountEmail?: string | null;
  /**
   * True when the purchase attached to an account the customer already had, so there
   * is nothing to offer to merge.
   */
  existingAccount: boolean;
}

/** What moved when a kiosk account was folded into a real one. */
export interface GuestMergeResult {
  mergedFromUserId: string;
  projectsMoved: number;
  imagesMoved: number;
  projectAllowanceMoved: number;
  aiCreditsMoved: number;
  shopName?: string | null;
}

/**
 * The shop's kiosk statement (backend WalletSummaryResponse): what the link sold and the
 * reward points those sales earned.
 *
 * Points are spending power inside HueVista (1 point = 1 paise), spent through the
 * billing wallet endpoints. They are never paid out as cash — there is no payout balance
 * or redemption history here, and there must not be: the kiosk price is collected for
 * HueVista's own service, so converting points to a bank transfer would make every sale
 * a collection on the shop's behalf.
 */
export interface WalletSummary {
  organizationId: string;
  currency: string;
  /** Spendable now, from the owner's point ledger. Below the lifetime figure once
   *  batches have been spent or have expired. */
  pointsBalance: number;
  /** Every point this kiosk has ever earned, refunded sales excluded. */
  lifetimePointsEarned: number;
  /** What one sale earns the shop right now. */
  pointsPerSale: number;
  /** What a walk-in pays right now, in paise. */
  kioskPricePaise: number;
  recentPayments: Array<{
    id: string;
    amountPaise: number;
    bonusPoints: number;
    reversed: boolean;
    code?: string | null;
    createdAt?: string | null;
  }>;
}

/**
 * A shop's reward-point standing (backend RewardPointsSummaryResponse).
 *
 * Carries no rupee figure on purpose: points buy at their own prices, and a "worth ₹X"
 * would invite treating them as cash, which is the one thing they are not.
 */
export interface RewardPointsSummary {
  /** Spendable now — live batches less any refund shortfall still being earned back. */
  balance: number;
  pointsPerSale: number;
  /** What buying costs: rupees per point, and the bounds on one purchase. */
  rupeesPerPoint: number;
  minPurchase: number;
  maxPurchase: number;
  /** How long a batch lasts from the day it arrives — earned or bought alike. */
  validityDays: number;
  /** How many days before expiry the warning email goes out. */
  expiryWarningDays: number;
  /** What each purchase costs, in points. projectPrice is the CALLER'S rate — it falls
   *  with their plan (80 with none, down to 40 on Business), so it is not a constant. */
  projectPrice: number;
  reopenPrice: number;
  /** The next batch to expire. Null when the shop holds none. */
  nextExpiringPoints?: number | null;
  nextExpiryAt?: string | null;
  /** Every live batch, soonest expiry first. */
  lots: Array<{ id: string; pointsRemaining: number; expiresAt: string }>;
  recentActivity: Array<{
    id: string;
    points: number;
    type:
      | "KIOSK_EARNED"
      | "PURCHASED"
      | "KIOSK_REVERSED"
      | "EXPIRED"
      | "SPENT_ON_IMAGE"
      | "SPENT_ON_AUTO_MASK"
      | "SPENT_ON_PROJECT"
      | "SPENT_ON_PROJECT_REOPEN";
    createdAt: string;
  }>;
}

/** Current subscription summary (backend SubscriptionResponse). */
/**
 * What a shop shows, from GET/PUT /api/organizations/{id}/visible-brands.
 *
 * Two different limits meet here and only one of them is the shop's. `brands` is the
 * pool its DISTRIBUTOR granted it — the shop cannot add to that list, so anything absent
 * from it is not a choice the shop can make. `restricted` is the shop's own switch over
 * that pool: false means "show everything I carry", and every option then reads as
 * shown, so the page renders correctly without knowing that no stored rows means
 * everything rather than nothing.
 */
export interface ShopBrandVisibility {
  /** True when the shop has narrowed its catalogue itself. */
  restricted: boolean;
  brands: ShopBrandOption[];
}

export interface ShopBrandOption {
  id: number;
  name: string;
  slug: string;
  /** Whether this company is currently shown to anyone working under the shop. */
  shown: boolean;
  /**
   * How many shades this company has in the catalogue. Zero means assigned but not
   * yet loaded — the reason a shop can be granted eight companies and find colours
   * for only six. Absent from an older backend, which reads as "unknown", not zero.
   */
  shadeCount?: number;
}

export interface SubscriptionSummary {
  id: string;
  plan: PlanName;
  planDisplayName: string;
  status: "CREATED" | "ACTIVE" | "HALTED" | "CANCELLED" | "COMPLETED" | "EXPIRED";
  trial: boolean;
  cancelAtPeriodEnd?: boolean;
  /** When this plan's period begins. In the FUTURE for a plan bought to replace one
   *  that is still winding down: the gateway is told to start billing the day the
   *  current period ends, so nobody pays for two overlapping months. Such a plan does
   *  not entitle yet — the one it replaces is still in force. */
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  /** How many of the plan this subscription is billed for — the multiplier behind
   *  projectsLimit. */
  quantity?: number;
  // The project quota. ONE project covers the whole automatic pipeline — the AI photo
  // clean-up AND the AI wall detection — so it is charged once, not once per step.
  // Remaining is the allowance less what is spent and what is held behind unredeemed
  // access codes.
  projectsUsed: number;
  projectsLimit: number;
  projectsRemaining: number;
  /** Projects held for access codes customers haven't redeemed yet. Already paid for,
   *  and excluded from projectsRemaining because they are spoken for. */
  reservedProjects?: number;
  /** Extra projects bought at the plan's rate, still unused. Never expire. */
  purchasedProjectCredits?: number;
  /** Projects carried over from a plan this one replaced. Spendable now, but they
   *  expire when this cycle renews — unlike the purchased ones. */
  carriedProjectCredits?: number;
  /** What one extra project costs on this plan: points, and money in paise. */
  extraProjectPoints?: number;
  extraProjectPricePaise?: number;
  pdfDownloadsUsed?: number;
  pdfDownloadsLimit?: number;
  pdfDownloadsRemaining?: number;
  pdfImageLimit?: number;
  /** Whether this plan includes colour matching (the Colour finder). False on the free
   *  tier, true on every paid one. Served rather than derived from `plan`, so the client
   *  keeps no copy of which tiers include what. */
  colorMatching?: boolean;
  /**
   * This account is exempt from billing altogether — an administrator. There is no
   * subscription behind these numbers, no period, and nothing to renew or cancel.
   *
   * Not the same as `trial`, which is a real row on a real clock. Anything that offers
   * to upgrade, renew or cancel must check this first: the endpoint used to answer an
   * admin with a 404, every caller read that as "unpaid", and the console showed the
   * person who runs the platform a prompt to subscribe to it.
   */
  unbilled?: boolean;
  // Present on a freshly CREATED subscription: the Razorpay hosted checkout URL the
  // buyer is sent to in order to pay and activate the plan.
  paymentUrl?: string | null;
  razorpaySubscriptionId?: string | null;
  // Present on a freshly CREATED subscription: the Razorpay key used to open the
  // in-app Checkout for `razorpaySubscriptionId`.
  razorpayKeyId?: string | null;
}

/**
 * Every plan a retailer can be sold — which, since Enterprise was withdrawn, is every
 * plan the backend serves from /api/billing/plans.
 *
 * ENTERPRISE survives in `SubscriptionSummary["plan"]` and in `pricingPlan` above
 * because a row granted before it was withdrawn still names it and must still render;
 * it is simply not something new money can be taken for.
 */
export type PurchasablePlan = "STARTER" | "PROFESSIONAL" | "BUSINESS";

/** Every tier a subscription row can name, buyable or not. */
export type PlanName = "FREE" | PurchasablePlan | "ENTERPRISE";

/** One plan option from GET /api/billing/plans (pricing + quota limits).
 *  Prices are BASE prices; GST (currently 0%) is added on top (priceWithTax*). */
export interface PlanOption {
  plan: PlanName;
  displayName: string;
  /** Whether checkout can sell this tier. False for FREE, which is granted with the
   *  account and renewed monthly — a card for it must never grow a buy button whose
   *  only possible answer is "there's nothing to pay". */
  purchasable?: boolean;
  /** Position on the tier ladder, served by the backend so an upgrade can be told
   *  from a downgrade without keeping a hand-maintained copy of the Plan enum order
   *  here — one that goes quietly wrong the day a tier is added or reordered. */
  rank?: number;
  priceInPaise: number;
  priceInRupees: number;
  taxPercent: number;
  priceWithTaxInPaise: number;
  priceWithTaxInRupees: number;
  /** Complete projects per cycle — each covers the AI clean-up AND the AI wall
   *  detection, so there is one number here where there used to be two. */
  monthlyProjectLimit: number | "unlimited";
  pdfImageLimit: number;
  monthlyPdfLimit: number | "unlimited";
  /** What one extra project costs ON THIS TIER once the monthly quota is spent —
   *  cheaper the bigger the plan, on both rails. */
  extraProjectPoints: number;
  extraProjectPriceInPaise: number;
  extraProjectPriceWithTaxInPaise: number;
  /** Whether the tier includes colour matching (the Colour finder) — the one capability
   *  gated on the tier rather than on a quota. */
  colorMatching?: boolean;
}

// ─── Mask reports ──────────────────────────────────────────────────────────
// "The AI got this wrong", raised from the studio after a run and worked by the
// admin. Mirrors the backend's MaskReportIssue / MaskReportStatus / MaskReportResponse.

/**
 * What the reporter says went wrong. The two named values are the two halves of
 * the pipeline a user can actually SEE — the photo clean-up and the wall
 * detection — so the ticked box tells the admin which stage to open first.
 */
export type MaskReportIssue =
  | "MASK_NOT_GENERATED_PROPERLY"
  | "IMAGE_NOT_CLEANED_PROPERLY"
  | "OTHER";

export type MaskReportStatus = "NEW" | "IN_REVIEW" | "RESOLVED";

/**
 * One report.
 *
 * The reporter's copy back from POST carries only the first block (id, issues,
 * note, status, createdAt); everything below it is filled in on the admin queue's
 * view and is absent on the receipt.
 */
export interface MaskReport {
  id: string;
  issues: MaskReportIssue[];
  note?: string | null;
  status: MaskReportStatus;
  createdAt?: string;
  /** The PIPELINE filed this one, not a person: the photo was cleaned and wall
   *  detection then returned nothing, so the room was handed over for hand-marked
   *  walls. Nobody complains about a room that works, which is exactly why the run
   *  has to report itself — and why the queue must show which reports came that way. */
  autoRaised?: boolean;

  projectId?: string;
  projectName?: string;
  /** Null on a guest report — no account exists; the shop is the contact. */
  reporterName?: string | null;
  reporterEmail?: string | null;
  reporterRole?: string | null;
  /** Set on guest reports: the shop whose code the walk-in was working under. */
  shopName?: string | null;

  /** What the reported RUN produced, captured when the report was raised — a
   *  re-run overwrites all of these on the project itself. */
  projectStatus?: string | null;
  maskMode?: string | null;
  regionCount?: number | null;
  hadCleanedImage?: boolean | null;
  /** "CLEAN" / "MASK" when the reported run FAILED outright — which half gave up.
   *  Null when the run believed it had succeeded, which is the harder bug: the
   *  pipeline passed every check it makes and the walls are still wrong. */
  failureStage?: string | null;
  /** What the failed run told the reporter, verbatim. Null when it didn't fail. */
  failureReason?: string | null;

  adminNote?: string | null;
  resolvedByName?: string | null;
  resolvedAt?: string | null;
  updatedAt?: string;
}

/**
 * One room in the admin's platform-wide list (backend AdminProjectRow).
 *
 * Deliberately not a ProjectSummary. That type describes a room to somebody who owns or
 * issued it, and its `source` says "mine" or "my customer's" — categories that mean
 * nothing to an admin, who owns none of them. What an admin needs is identification, so
 * a room somebody reported can be found among everyone else's.
 *
 * Owner and shop are both optional and both are shown: a room belongs to a registered
 * user, to a walk-in's access code alone, or (after a walk-in signs up) to both.
 */
export interface AdminProjectRow {
  id: string;
  name: string;
  status: ProjectStatus;
  /** "AUTO" / "MANUAL"; absent means the default AUTO. */
  maskMode?: string | null;
  regionCount: number;
  /** False means the clean-up produced nothing and the masks sit on the original photo. */
  hasCleanedImage: boolean;
  createdAt?: string;
  updatedAt?: string;

  /** The registered owner, when there is one. Absent for a walk-in's room. */
  ownerId?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  ownerRole?: string | null;
  /** The shop whose code the room was created under, when it was. */
  shopName?: string | null;
  accessCode?: string | null;
  /** The name the shop typed when it issued that code. */
  customerName?: string | null;
}

/** Colour-board PDF allowance (backend PdfAllowanceResponse) — resolved against
 *  whichever plan pays for the caller (own plan, or the issuing shop's). */
export interface PdfAllowance {
  imagesPerPdf: number;
  monthlyLimit: number;
  used: number;
  remaining: number;
  unlimited: boolean;
}

/** Razorpay order details returned by the backend to open Checkout for a points purchase. */
export interface PointsOrder {
  orderId: string;
  /** Points this order buys. */
  points: number;
  /** What it costs, in paise — priced server-side from the count. */
  amount: number;
  currency: string;
  razorpayKeyId: string;
}

/**
 * The AI image wallet (backend AiCreditSummaryResponse).
 *
 * The second balance in the product, and the only one a CUSTOMER can hold. One credit is
 * one photorealistic AI image. It exists because a project a shop gives a customer
 * includes no image of its own — the shop bought the room, not the model call at the end
 * of it — and a customer account can hold no points and buy no plan, so this is the only
 * way for them to get the picture.
 *
 * Carries the list price beside the price charged so the launch offer can be shown
 * honestly rather than with a number hard-coded here that goes stale the day it ends.
 */
export interface AiCreditSummary {
  /** Spendable credits right now. */
  balance: number;
  /** False for an account that owns no projects (painter, distributor) and so has
   *  nothing to spend credits on. Hide the wallet rather than offering a 403. */
  eligible: boolean;
  /** What one credit costs today, in paise, after any launch discount. */
  pricePaise: number;
  /** What one costs before the discount. Equal to pricePaise once the offer ends. */
  listPricePaise: number;
  /** The launch discount as a whole percentage. 0 when the offer is over. */
  discountPercent: number;
  minPurchase: number;
  maxPurchase: number;
  /** Credits the plainest AI image costs — the BASIC tier, and the floor the others are
   *  quoted against. */
  renderCost: number;
  /**
   * What each quality of image costs, straight from the server.
   *
   * A list rather than three named fields because the tiers are configuration: a screen
   * that iterates this shows whatever is actually sold, and one that hard-codes "Pro is 2"
   * starts lying the day that changes. Optional so an older backend reads as "one price
   * for one image", which is what it had.
   */
  renderTiers?: Array<{ quality: RenderQuality; credits: number }>;
  /** When the soonest batch of credits lapses, and how many go with it. Null and 0 for a
   *  wallet holding nothing dated — a shop's credits never expire. */
  soonestExpiryAt?: string | null;
  expiringCredits?: number;
  currency: string;
  recentActivity: Array<{
    id: string;
    /** Signed: positive is bought or handed back, negative is spent. */
    credits: number;
    type: "PURCHASED" | "SPENT_ON_RENDER" | "RENDER_REFUNDED" | "GRANTED" | "EXPIRED";
    balanceAfter: number;
    note?: string | null;
    createdAt: string;
  }>;
}

/**
 * How good an AI image to make — which model makes it, and what it costs in credits.
 *
 * Three tiers because "one photorealistic image" was never one thing: the models behind
 * them differ by close to an order of magnitude in what they cost to run. BASIC is a whole
 * picture on its own rather than a deliberately poor one; MAX is the one that gets printed.
 */
export type RenderQuality = "BASIC" | "PRO" | "MAX";

/**
 * The customer's counter (backend CartCatalogueResponse): what is for sale, what it costs,
 * what an offer would take off, and what the account already holds.
 *
 * Everything the cart screen needs in one call — the alternative would let prices, offers
 * and balances disagree with each other for a page load, on a screen with a Pay button.
 *
 * Prices here are FINAL: what is quoted is what Razorpay is asked for. The cart multiplies
 * them by its quantities to draw the running total, and the server prices the order again
 * from the same numbers when it is opened, so the client's arithmetic is a courtesy to the
 * buyer and never the authority.
 */
export interface CartCatalogue {
  /** False for a shop (which buys at its plan's rate) and for accounts that own no
   *  projects. The cart hides itself rather than offering buttons that come back 403. */
  eligible: boolean;
  /** One project, on its own, in paise. */
  projectPricePaise: number;
  /** One AI image credit, on its own, in paise. */
  creditPricePaise: number;
  /** The combo, and what is in it. Cheaper than its parts bought separately. */
  comboPricePaise: number;
  comboProjects: number;
  comboCredits: number;
  /** Days everything on this counter is good for — a year, on every line. */
  validDays: number;
  /** The most of any one line a single order may hold. */
  maxQuantity: number;
  /** The offers, weakest first, so the cart can show the next one to reach for. */
  offers: Array<{ code: string; minSubtotalPaise: number; percentOff: number }>;
  /** Projects already paid for and not yet started. */
  availableProjects: number;
  /** Spendable AI image credits. */
  creditBalance: number;
  /** When the soonest batch of credits lapses, and how many go with it. */
  creditsExpireAt?: string | null;
  creditsExpiring?: number;
  currency: string;
}

/**
 * The Razorpay order for a basket, with the bill that produced it (backend
 * CartOrderResponse).
 *
 * The breakdown travels back rather than only the amount, so what the cart showed and what
 * Checkout is opened for are the same arithmetic — a cart that displayed one total and
 * charged another would be right about the money and wrong about the only thing the buyer
 * can check.
 */
export interface CartOrder {
  orderId: string;
  subtotalPaise: number;
  discountCode?: string | null;
  discountPercent: number;
  discountPaise: number;
  amountPaise: number;
  /** What this order hands over once paid — combos already unpacked. */
  projectsGranted: number;
  creditsGranted: number;
  validDays: number;
  currency: string;
  razorpayKeyId: string;
}

/** Razorpay order details for an AI image credit top-up. */
export interface AiCreditOrder {
  orderId: string;
  /** Credits this order buys. */
  credits: number;
  /** What it costs, in paise — priced server-side from the count. */
  amount: number;
  /** What it would have cost at the undiscounted list price. */
  listAmount: number;
  discountPercent: number;
  currency: string;
  razorpayKeyId: string;
}
