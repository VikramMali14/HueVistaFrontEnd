// Must match the backend UserRole enum exactly (auth/model/UserRole.java).
export type UserRole = "ADMIN" | "DISTRIBUTOR" | "RETAILER" | "PAINTER" | "CUSTOMER";
export type AuthProvider = "LOCAL" | "GOOGLE";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  picture?: string | null;
  provider: AuthProvider;
  role: UserRole;
  emailVerified?: boolean;
  phoneNumber?: string | null;
  phoneVerified?: boolean;
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
 * Well-known paint companies, used as a fallback when the live catalogue is
 * unreachable (demo mode / bundled sample shades). The real brand list is dynamic —
 * derived from the shades the backend returns — so a newly uploaded company
 * (e.g. "Birla Opus") appears without a code change.
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
  /** When the customer sent the project to the issuing shop; null until then. */
  sentToShopAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  status: ProjectStatus;
  imageId: string;
  imageUrl: string;
  regionCount: number;
  hasShareLink?: boolean;
  createdAt?: string;
  updatedAt?: string;
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
  customerEmail: string;
  retailerOrgId?: string | null;
  accessExpiresAt?: string | null;
  expired: boolean;
  projectAllowance: number;
  projectsCreated: number;
  projectsRemaining: number;
  updatedAt?: string;
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
  /** Paint companies unlocked for this guest. Empty/absent = all brands. */
  allowedBrands?: string[];
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

// --- In-store kiosk (public store links + retailer wallet) ---

/** A retailer's public kiosk link (backend StoreLinkResponse). */
export interface StoreLink {
  id: string;
  slug: string;
  organizationId: string;
  organizationName?: string;
  pricePaise: number;
  currency: string;
  validDays: number;
  active: boolean;
  createdAt?: string | null;
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

/** A wallet payout request (backend WalletRedemptionResponse). */
export interface WalletRedemption {
  id: string;
  organizationId: string;
  organizationName?: string;
  amountPaise: number;
  upiId: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  adminNote?: string | null;
  createdAt?: string | null;
  decidedAt?: string | null;
}

/** The retailer's kiosk wallet (backend WalletSummaryResponse). */
export interface WalletSummary {
  organizationId: string;
  currency: string;
  balancePaise: number;
  lifetimeEarnedPaise: number;
  pendingRedemptionPaise: number;
  redeemedPaise: number;
  platformFeePaise: number;
  recentPayments: Array<{
    id: string;
    amountPaise: number;
    retailerSharePaise: number;
    code?: string | null;
    createdAt?: string | null;
  }>;
  redemptions: WalletRedemption[];
}

/** Current subscription summary (backend SubscriptionResponse). */
export interface SubscriptionSummary {
  id: string;
  plan: "STARTER" | "PROFESSIONAL" | "BUSINESS" | "ENTERPRISE";
  planDisplayName: string;
  status: "CREATED" | "ACTIVE" | "HALTED" | "CANCELLED" | "COMPLETED" | "EXPIRED";
  trial: boolean;
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: string | null;
  // Image quota — the AI photo clean-up is compulsory, so EVERY image consumes
  // one. (Field names keep the historical "aiGenerations" naming.) Remaining
  // includes any purchased pay-per-image overage credits.
  aiGenerationsUsed: number;
  aiGenerationsLimit: number;
  aiGenerationsRemaining: number;
  // AI auto-mask (wall-detection) quota — spent only when the shop picks the
  // automatic mask after clean-up. Limit 0 = plan is manual-masking only.
  autoMasksUsed?: number;
  autoMasksLimit?: number;
  autoMasksRemaining?: number;
  /** Unused pay-per-image overage credits (₹50 + GST each); never expire. */
  purchasedImageCredits?: number;
  /** Unused pay-per-use AI auto-mask credits (₹25 + GST each, wallet-paid). */
  purchasedAutoMaskCredits?: number;
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

/** Plans a retailer can purchase directly (Enterprise is custom-priced — contact sales). */
export type PurchasablePlan = "STARTER" | "PROFESSIONAL" | "BUSINESS";

/** One plan option from GET /api/billing/plans (pricing + quota limits).
 *  Prices are BASE prices; 18% GST is added on top (priceWithTax*). */
export interface PlanOption {
  plan: "STARTER" | "PROFESSIONAL" | "BUSINESS" | "ENTERPRISE";
  displayName: string;
  priceInPaise: number;
  priceInRupees: number;
  taxPercent: number;
  priceWithTaxInPaise: number;
  priceWithTaxInRupees: number;
  /** Images processed per cycle (clean-up is compulsory on every image).
   *  Kept as monthlyAiLimit too for API compatibility. */
  monthlyAiLimit: number | "unlimited";
  monthlyImageLimit: number | "unlimited";
  /** AI wall-detection runs per cycle; 0 = manual masking only (Starter). */
  monthlyAutoMaskLimit: number | "unlimited";
  pdfImageLimit: number;
  monthlyPdfLimit: number | "unlimited";
  /** One extra image once the monthly quota is spent: ₹50 base / ₹59 with GST. */
  imageOveragePriceInPaise: number;
  imageOveragePriceWithTaxInPaise: number;
  /** One extra AI auto-mask run: ₹25 base / ₹29.50 with GST (wallet-paid). */
  autoMaskOveragePriceInPaise: number;
  autoMaskOveragePriceWithTaxInPaise: number;
}

/** One movement on the prepaid billing wallet (positive = top-up, negative = purchase). */
export interface BillingWalletTransaction {
  id: string;
  type: "TOPUP" | "EXTRA_IMAGE" | "EXTRA_AUTO_MASK";
  amountPaise: number;
  createdAt: string;
}

/** The prepaid billing wallet (GET /api/billing/wallet): money added by Razorpay
 *  top-up, spent on pay-per-use overage once monthly allowances run out. */
export interface BillingWalletSummary {
  balancePaise: number;
  currency: string;
  imageCreditPricePaise: number;
  autoMaskCreditPricePaise: number;
  transactions: BillingWalletTransaction[];
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

/** Razorpay order details returned by the backend to open Checkout for a one-time project purchase. */
export interface ProjectCreditOrder {
  orderId: string;
  amount: number; // in paise
  currency: string;
  razorpayKeyId: string;
}
