export type UserRole = "USER" | "RETAILER" | "DISTRIBUTOR" | "ADMIN";
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

export type ImageClassification = "INDOOR" | "OUTDOOR";

export interface UploadedImage {
  id: string;
  url: string;
  thumbnailUrl?: string;
  classification: ImageClassification;
  width: number;
  height: number;
  sizeBytes: number;
  contentType: string;
  createdAt: string;
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
