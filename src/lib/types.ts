// Must match the backend UserRole enum exactly (auth/model/UserRole.java).
export type UserRole = "ADMIN" | "DISTRIBUTOR" | "RETAILER" | "PAINTER" | "CUSTOMER";
export type AuthProvider = "LOCAL" | "GOOGLE";
export type UiVariant = "premium" | "classic";
export type UiTheme = "dark" | "light";
export type UiLocale = "en" | "hi";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  picture?: string | null;
  provider: AuthProvider;
  role: UserRole;
  /** Backend-controlled UI flavour. premium = HueVista couture look; classic = enterprise/retailer look. */
  uiVariant?: UiVariant;
  /** Optional per-user persisted theme preference. Falls back to dark. */
  uiTheme?: UiTheme;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  user: AuthUser;
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
}

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

export interface PaintShade {
  code: string;
  name: string;
  hex: string;
  family: ColorFamily;
  lrv: number;
  brand: "Asian Paints" | "Berger" | "Nerolac" | "Dulux";
  finishes: ReadonlyArray<"Matt" | "Satin" | "Royale" | "Velvet">;
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
}

export interface ProjectDetail {
  id: string;
  name: string;
  status: ProjectStatus;
  imageId: string;
  imageUrl: string;
  cleanedImageUrl?: string | null;
  failureReason?: string | null;
  regions: RegionDetail[];
  hasShareLink?: boolean;
  shareExpiresAt?: string | null;
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

/** Razorpay order details returned by the backend to open Checkout for a one-time project purchase. */
export interface ProjectCreditOrder {
  orderId: string;
  amount: number; // in paise
  currency: string;
  razorpayKeyId: string;
}
