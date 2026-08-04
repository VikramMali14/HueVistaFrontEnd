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
  /** The route this option gates, e.g. "/color-finder". */
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

/** Result of an anonymous guest redeeming a shop access code. */
export interface GuestRedeemResult {
  guestToken: string;
  code: string;
  shopName: string;
  validDays: number;
  expiresAt: string;
  /** Paint companies the shop unlocked for this guest. Empty/absent = all brands. */
  allowedBrands?: string[];
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

export interface PaintShade {
  code: string;
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

export type RegionCategory = "MAIN_WALL" | "ACCENT_WALL" | "OTHER_WALL" | "TRIM" | "MANUAL";

export interface RegionDetail {
  id: number;
  label: string;
  category: RegionCategory;
  maskData?: string | null;
  maskUrl?: string | null;
  appliedShadeCode?: string | null;
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
}

export interface ProjectDetail {
  id: string;
  name: string;
  roomType?: string | null;
  notes?: string | null;
  status: ProjectStatus;
  imageId: string;
  imageUrl: string;
  cleanedImageUrl?: string | null;
  /** The model's raw colour-coded mask (RED/GREEN/BLUE/BLACK) from the accepted
   *  generation — admin mask-viewer diagnostics. Null for projects segmented
   *  before raw-mask capture shipped or with manual-only regions. */
  rawMaskUrl?: string | null;
  failureReason?: string | null;
  /** "AUTO" / "MANUAL" — the wall-creation choice this project was segmented
   *  with; null/undefined = default AUTO. MANUAL projects arrive SEGMENTED with
   *  zero auto regions: the cleaned canvas is ready for hand-marked walls. */
  maskMode?: "AUTO" | "MANUAL" | null;
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
  /** What reopening this project costs, in points. Only meaningful while readOnly. */
  reopenPricePoints?: number;
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
  /** When this room's paid validity ends; absent when it has no window of its own. */
  accessExpiresAt?: string | null;
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
export type SupportChannel = "IN_APP" | "WHATSAPP" | "VOICE" | "EMAIL";

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
 * The price falls with the buyer's plan — 80 points / ₹99 with none, down to
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
  /** What another window on a lapsed project costs — points, and money in paise.
   *  Flat on both rails, unlike a new project: a reopen buys more time on work already
   *  paid for once, so it does not get cheaper with the tier. */
  reopenPricePoints: number;
  reopenPricePaise: number;
  /** Spendable balance, so the caller can say whether it is enough. */
  pointsBalance: number;
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
export interface RedeemAccountResult {
  accessToken: string;
  refreshToken: string;
  tokenType?: string;
  expiresIn: number;
  user: AuthUser;
  shopName: string;
  validDays: number;
  customerName: string;
}

/** What a redeemed customer was assigned by their retailer (backend AssignedProductsResponse). */
export interface AssignedProducts {
  shopName: string;
  /** Whole companies unlocked. Empty/absent = no company restriction (all brands). */
  allowedBrands?: string[];
  /** Individually unlocked products, resolved to full listings. */
  products: ShopProduct[];
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
  validDays: number;
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
  guestToken: string;
  code: string;
  shopName: string;
  validDays: number;
  expiresAt: string;
  amountPaise: number;
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
export interface SubscriptionSummary {
  id: string;
  plan: "STARTER" | "PROFESSIONAL" | "BUSINESS" | "ENTERPRISE";
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

/** One plan option from GET /api/billing/plans (pricing + quota limits).
 *  Prices are BASE prices; GST (currently 0%) is added on top (priceWithTax*). */
export interface PlanOption {
  plan: PurchasablePlan;
  displayName: string;
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
