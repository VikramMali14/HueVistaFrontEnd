/**
 * Static demo fixtures (the seed data for DEMO_MODE). Realistic Indian
 * paint-retailer values. The mutable in-memory store (./store) is seeded from
 * deep clones of these so demo writes never corrupt the seed.
 *
 * Today, for relative-date copy in the UI, is 2026-06-24 (IST). All timestamps
 * are absolute so the demo reads sensibly regardless of when it is run.
 */
import type {
  AccessCode,
  CustomerEntitlement,
  OrgResponse,
  PaintBrand,
  PaintLine,
  ProductCategory,
  ProjectDetail,
  ProjectSummary,
  ShopProduct,
  StoreLink,
  SubscriptionSummary,
  SupportConversation,
  SupportConversationSummary,
  WalletSummary,
} from "../types";

export const DEMO_ORG: OrgResponse = {
  id: "org_demo",
  name: "Mehta Paints",
  slug: "mehta-paints-7a3b",
  type: "RETAILER",
  ownerUserId: "usr_mehta",
  ownerName: "Rajesh Mehta",
};

/** RETAILER/ADMIN have an ACTIVE (trial) subscription; CUSTOMER has none (404). */
export const DEMO_SUBSCRIPTION: SubscriptionSummary = {
  id: "sub_demo_01",
  plan: "PROFESSIONAL",
  planDisplayName: "Professional",
  status: "ACTIVE",
  trial: true,
  currentPeriodEnd: "2026-07-08T00:00:00+05:30",
  aiGenerationsUsed: 12,
  aiGenerationsLimit: 50,
  aiGenerationsRemaining: 38,
};

/** The CUSTOMER account's project entitlement (api/me/entitlement). */
export const DEMO_ENTITLEMENT: CustomerEntitlement = {
  customerId: "usr_anjali",
  customerName: "Anjali Nair",
  customerEmail: "anjali@example.in",
  retailerOrgId: "org_demo",
  accessExpiresAt: "2026-09-24T00:00:00+05:30",
  expired: false,
  projectAllowance: 2,
  projectsCreated: 1,
  projectsRemaining: 1,
  updatedAt: "2026-06-24T11:05:00+05:30",
};

export const DEMO_BRANDS: PaintBrand[] = [
  { id: 1, name: "Asian Paints", slug: "asian-paints" },
  { id: 2, name: "Berger", slug: "berger" },
  { id: 3, name: "Nerolac", slug: "nerolac" },
  { id: 4, name: "Dulux", slug: "dulux" },
];

/** Lines keyed by `${brandId}:${category}`. */
export const DEMO_LINES: Record<string, PaintLine[]> = {
  "1:INTERIOR": [
    { id: 11, name: "Royale Luxury Emulsion", category: "INTERIOR", qualityTier: "LUXURY", defaultFinish: "Royale" },
    { id: 12, name: "Apcolite Premium Emulsion", category: "INTERIOR", qualityTier: "PREMIUM", defaultFinish: "Satin" },
    { id: 13, name: "Tractor Emulsion", category: "INTERIOR", qualityTier: "ECONOMY", defaultFinish: "Matt" },
  ],
  "1:EXTERIOR": [
    { id: 14, name: "Apex Ultima", category: "EXTERIOR", qualityTier: "LUXURY", defaultFinish: "Matt" },
    { id: 15, name: "Ace Exterior Emulsion", category: "EXTERIOR", qualityTier: "ECONOMY", defaultFinish: "Matt" },
  ],
  "2:INTERIOR": [
    { id: 21, name: "Silk Glamor", category: "INTERIOR", qualityTier: "LUXURY", defaultFinish: "Satin" },
    { id: 22, name: "Easy Clean", category: "INTERIOR", qualityTier: "PREMIUM", defaultFinish: "Matt" },
  ],
  "2:EXTERIOR": [
    { id: 23, name: "WeatherCoat Anti Dustt", category: "EXTERIOR", qualityTier: "PREMIUM", defaultFinish: "Matt" },
  ],
  "3:INTERIOR": [
    { id: 31, name: "Impressions HD", category: "INTERIOR", qualityTier: "LUXURY", defaultFinish: "Satin" },
    { id: 32, name: "Beauty Smooth Finish", category: "INTERIOR", qualityTier: "PREMIUM", defaultFinish: "Matt" },
  ],
  "3:EXTERIOR": [
    { id: 33, name: "Excel Total", category: "EXTERIOR", qualityTier: "LUXURY", defaultFinish: "Matt" },
  ],
  "4:INTERIOR": [
    { id: 41, name: "Velvet Touch", category: "INTERIOR", qualityTier: "LUXURY", defaultFinish: "Velvet" },
    { id: 42, name: "SuperClean", category: "INTERIOR", qualityTier: "PREMIUM", defaultFinish: "Satin" },
  ],
  "4:EXTERIOR": [
    { id: 43, name: "Weathershield Max", category: "EXTERIOR", qualityTier: "LUXURY", defaultFinish: "Matt" },
  ],
};

export function demoLinesFor(brandId: number, category: ProductCategory): PaintLine[] {
  return DEMO_LINES[`${brandId}:${category}`] ?? [];
}

export const DEMO_SHOP_PRODUCTS: ShopProduct[] = [
  { id: "prod_01", lineId: 11, brandName: "Asian Paints", lineName: "Royale Luxury Emulsion", category: "INTERIOR", price: 6200, priceUnit: "20 L", packSize: "20 L", coverage: "140-160 sq ft/L", finish: "Royale", qualityTier: "LUXURY", brightness: 5, imageUrl: null, features: "Stain resistant, low VOC, Teflon surface protection", description: "Premium silky-matt interior emulsion for living spaces.", createdAt: "2026-06-01T10:00:00+05:30" },
  { id: "prod_02", lineId: 12, brandName: "Asian Paints", lineName: "Apcolite Premium Emulsion", category: "INTERIOR", price: 3400, priceUnit: "20 L", packSize: "20 L", coverage: "130-150 sq ft/L", finish: "Satin", qualityTier: "PREMIUM", brightness: 4, imageUrl: null, features: "Washable, smooth finish", description: "Everyday premium interior emulsion.", createdAt: "2026-06-02T10:00:00+05:30" },
  { id: "prod_03", lineId: 23, brandName: "Berger", lineName: "WeatherCoat Anti Dustt", category: "EXTERIOR", price: 4100, priceUnit: "20 L", packSize: "20 L", coverage: "90-110 sq ft/L", finish: "Matt", qualityTier: "PREMIUM", brightness: 4, imageUrl: null, features: "Dust-guard, anti-algae, 7-yr warranty", description: "Exterior emulsion that keeps walls cleaner for longer.", createdAt: "2026-06-03T10:00:00+05:30" },
  { id: "prod_04", lineId: 41, brandName: "Dulux", lineName: "Velvet Touch", category: "INTERIOR", price: 5800, priceUnit: "20 L", packSize: "20 L", coverage: "135-155 sq ft/L", finish: "Velvet", qualityTier: "LUXURY", brightness: 5, imageUrl: null, features: "Rich velvet sheen, anti-bacterial", description: "Luxury interior emulsion with a soft velvet finish.", createdAt: "2026-06-04T10:00:00+05:30" },
];

export const DEMO_CUSTOMERS: CustomerEntitlement[] = [
  { customerId: "cust_anjali", customerName: "Anjali Nair", customerEmail: "anjali@example.in", retailerOrgId: "org_demo", accessExpiresAt: "2026-09-24T00:00:00+05:30", expired: false, projectAllowance: 2, projectsCreated: 1, projectsRemaining: 1, updatedAt: "2026-06-20T10:00:00+05:30" },
  { customerId: "cust_verma", customerName: "Sunil Verma", customerEmail: "sunil.verma@gmail.com", retailerOrgId: "org_demo", accessExpiresAt: "2026-08-10T00:00:00+05:30", expired: false, projectAllowance: 1, projectsCreated: 1, projectsRemaining: 0, updatedAt: "2026-06-12T14:30:00+05:30" },
  { customerId: "cust_das", customerName: "Priya Das", customerEmail: "priya.das@outlook.com", retailerOrgId: "org_demo", accessExpiresAt: "2026-05-01T00:00:00+05:30", expired: true, projectAllowance: 1, projectsCreated: 1, projectsRemaining: 0, updatedAt: "2026-04-20T09:00:00+05:30" },
];

export const DEMO_ACCESS_CODES: AccessCode[] = [
  { id: "ac_01", code: "MEHTA7", organizationId: "org_demo", organizationName: "Mehta Paints", validDays: 7, expiresAt: "2026-07-01T00:00:00+05:30", used: false, expired: false, allowedBrands: ["Asian Paints", "Berger"], createdAt: "2026-06-24T09:00:00+05:30" },
  { id: "ac_02", code: "MEHTA14", organizationId: "org_demo", organizationName: "Mehta Paints", validDays: 14, expiresAt: "2026-07-08T00:00:00+05:30", used: true, expired: false, usedAt: "2026-06-20T13:00:00+05:30", createdAt: "2026-06-06T10:00:00+05:30" },
  { id: "ac_03", code: "MEHTA3", organizationId: "org_demo", organizationName: "Mehta Paints", validDays: 3, expiresAt: "2026-05-01T00:00:00+05:30", used: false, expired: true, createdAt: "2026-04-28T08:00:00+05:30" },
];

// --- In-store kiosk: the shop's public store link + its earnings wallet ---
// The slug matches DEMO_ORG so the URL the portal advertises (/store/<slug>)
// actually renders in demo mode.
export const DEMO_STORE_LINKS: StoreLink[] = [
  { id: "sl_01", slug: "mehta-paints-7a3b", organizationId: "org_demo", organizationName: "Mehta Paints", pricePaise: 19_900, currency: "INR", validDays: 7, active: true, createdAt: "2026-06-10T10:00:00+05:30" },
];

/** Numbers are coherent with the backend's derivation: balance = earned − pending − redeemed.
 *  Each ₹199 kiosk payment carries the flat ₹50 platform fee → ₹149 retailer share. */
export const DEMO_WALLET: WalletSummary = {
  organizationId: "org_demo",
  currency: "INR",
  balancePaise: 24_500,
  lifetimeEarnedPaise: 74_500,
  pendingRedemptionPaise: 20_000,
  redeemedPaise: 30_000,
  platformFeePaise: 5_000,
  recentPayments: [
    { id: "sp_05", amountPaise: 19_900, retailerSharePaise: 14_900, code: "MEHTA9105", createdAt: "2026-06-23T17:40:00+05:30" },
    { id: "sp_04", amountPaise: 19_900, retailerSharePaise: 14_900, code: "MEHTA9104", createdAt: "2026-06-22T12:15:00+05:30" },
    { id: "sp_03", amountPaise: 19_900, retailerSharePaise: 14_900, code: "MEHTA9103", createdAt: "2026-06-20T16:05:00+05:30" },
    { id: "sp_02", amountPaise: 19_900, retailerSharePaise: 14_900, code: "MEHTA9102", createdAt: "2026-06-17T11:30:00+05:30" },
    { id: "sp_01", amountPaise: 19_900, retailerSharePaise: 14_900, code: "MEHTA9101", createdAt: "2026-06-14T13:00:00+05:30" },
  ],
  redemptions: [
    { id: "wr_02", organizationId: "org_demo", organizationName: "Mehta Paints", amountPaise: 20_000, upiId: "mehtapaints@upi", status: "PENDING", createdAt: "2026-06-22T18:00:00+05:30" },
    { id: "wr_01", organizationId: "org_demo", organizationName: "Mehta Paints", amountPaise: 30_000, upiId: "mehtapaints@upi", status: "APPROVED", adminNote: "Paid via UPI on 16 Jun.", createdAt: "2026-06-15T10:00:00+05:30", decidedAt: "2026-06-16T09:30:00+05:30" },
  ],
};

// --- Support: the customer's own thread + the staff inbox (ADMIN) ---
export const DEMO_SUPPORT_CONVERSATIONS: SupportConversation[] = [
  {
    id: "conv_demo_01",
    channel: "IN_APP",
    status: "OPEN",
    subject: "How do I recolour a room?",
    createdAt: "2026-06-24T11:10:00+05:30",
    updatedAt: "2026-06-24T11:10:01+05:30",
    messages: [
      { id: "m1", sender: "USER", body: "How do I recolour a room?", createdAt: "2026-06-24T11:10:00+05:30" },
      { id: "m2", sender: "AI", body: "Hi! Open the Studio, upload a photo of the room and we detect the walls automatically — then tap any catalogue shade to paint a wall. Want me to walk you through it?", createdAt: "2026-06-24T11:10:01+05:30" },
    ],
  },
  {
    id: "conv_demo_02",
    channel: "WHATSAPP",
    status: "NEEDS_HUMAN",
    subject: "Exterior paint quote",
    createdAt: "2026-06-24T10:38:00+05:30",
    updatedAt: "2026-06-24T10:40:00+05:30",
    messages: [
      { id: "m3", sender: "USER", body: "What is the price of WeatherCoat for a 1200 sq ft house?", createdAt: "2026-06-24T10:38:00+05:30" },
      { id: "m4", sender: "AI", body: "WeatherCoat Anti Dustt is ₹4,100 for a 20 L pack (≈90-110 sq ft/L). For 1200 sq ft with two coats you'd need roughly 25-30 L. Let me connect you to the shop for an exact quote.", createdAt: "2026-06-24T10:39:00+05:30" },
      { id: "m5", sender: "SYSTEM", body: "Connected to the HueVista team.", createdAt: "2026-06-24T10:40:00+05:30" },
    ],
  },
];

export const DEMO_INBOX: SupportConversationSummary[] = [
  { id: "conv_demo_02", channel: "WHATSAPP", status: "NEEDS_HUMAN", subject: "Exterior paint quote", requesterName: "Sunil Verma", requesterEmail: "sunil.verma@gmail.com", requesterRole: "CUSTOMER", lastMessage: "Connected to the HueVista team.", updatedAt: "2026-06-24T10:40:00+05:30" },
  { id: "conv_demo_01", channel: "IN_APP", status: "OPEN", subject: "How do I recolour a room?", requesterName: "Anjali Nair", requesterEmail: "anjali@example.in", requesterRole: "CUSTOMER", lastMessage: "Want me to walk you through it?", updatedAt: "2026-06-24T11:10:01+05:30" },
];

// --- Projects: full details are the source of truth; summaries are derived ---
export const DEMO_PROJECT_DETAILS: Record<string, ProjectDetail> = {
  prj_sharma_hall: {
    id: "prj_sharma_hall",
    name: "Sharma residence — hall",
    roomType: "Living room",
    notes: "Client wants a warm neutral with a sage accent.",
    status: "SEGMENTED",
    imageId: "img_hall_01",
    imageUrl: "/demo/rooms/living-hall.svg",
    cleanedImageUrl: "/demo/rooms/living-hall-clean.svg",
    hasShareLink: true,
    shareExpiresAt: "2026-06-29T00:00:00+05:30",
    createdAt: "2026-06-22T10:00:00+05:30",
    updatedAt: "2026-06-22T10:15:00+05:30",
    regions: [
      { id: 101, label: "Main wall", category: "MAIN_WALL", maskUrl: "/demo/masks/hall-main.svg", appliedShadeCode: "7184", appliedHexCode: "#E8DCC8", displayOrder: 0 },
      { id: 102, label: "Accent wall", category: "ACCENT_WALL", maskUrl: "/demo/masks/hall-accent.svg", appliedShadeCode: "2727", appliedHexCode: "#5B6C5B", displayOrder: 1 },
      { id: 103, label: "Trim", category: "TRIM", maskUrl: "/demo/masks/hall-trim.svg", appliedShadeCode: "L150", appliedHexCode: "#F3EEE4", displayOrder: 2 },
    ],
  },
  prj_iyer_bedroom: {
    id: "prj_iyer_bedroom",
    name: "Iyer flat — master bedroom",
    roomType: "Bedroom",
    notes: null,
    status: "SEGMENTED",
    imageId: "img_bed_02",
    imageUrl: "/demo/rooms/bedroom.svg",
    cleanedImageUrl: "/demo/rooms/bedroom-clean.svg",
    hasShareLink: false,
    createdAt: "2026-06-20T16:30:00+05:30",
    updatedAt: "2026-06-20T16:40:00+05:30",
    regions: [
      { id: 201, label: "Main wall", category: "MAIN_WALL", maskUrl: "/demo/masks/bed-main.svg", appliedShadeCode: "4091", appliedHexCode: "#C9D2D0", displayOrder: 0 },
      { id: 202, label: "Accent wall", category: "ACCENT_WALL", maskUrl: "/demo/masks/bed-accent.svg", appliedShadeCode: "10BB", appliedHexCode: "#3B4A6B", displayOrder: 1 },
    ],
  },
  prj_cafe_facade: {
    id: "prj_cafe_facade",
    name: "Brew & Co café — facade",
    roomType: "Exterior",
    notes: null,
    status: "SEGMENTED",
    imageId: "img_ext_03",
    imageUrl: "/demo/rooms/cafe-exterior.svg",
    cleanedImageUrl: "/demo/rooms/cafe-exterior-clean.svg",
    hasShareLink: false,
    createdAt: "2026-06-18T09:00:00+05:30",
    updatedAt: "2026-06-18T09:05:00+05:30",
    regions: [
      { id: 301, label: "Main facade", category: "MAIN_WALL", maskUrl: "/demo/masks/cafe-main.svg", appliedShadeCode: "7432", appliedHexCode: "#A4683F", displayOrder: 0 },
      { id: 302, label: "Trim", category: "TRIM", maskUrl: "/demo/masks/cafe-trim.svg", appliedShadeCode: "L150", appliedHexCode: "#F3EEE4", displayOrder: 1 },
    ],
  },
  prj_pending_kitchen: {
    id: "prj_pending_kitchen",
    name: "Mehta kitchen",
    roomType: "Kitchen",
    notes: null,
    status: "FAILED",
    imageId: "img_kit_04",
    imageUrl: "/demo/rooms/kitchen.svg",
    cleanedImageUrl: null,
    failureReason: "Could not detect walls — the photo was too dark. Try a brighter, straight-on shot.",
    createdAt: "2026-06-15T12:00:00+05:30",
    updatedAt: "2026-06-15T12:00:00+05:30",
    regions: [],
  },
};

/** Order shown on the dashboard (newest first by updatedAt). */
export const DEMO_PROJECT_ORDER = [
  "prj_sharma_hall",
  "prj_iyer_bedroom",
  "prj_cafe_facade",
  "prj_pending_kitchen",
];

export function toSummary(p: ProjectDetail): ProjectSummary {
  return {
    id: p.id,
    name: p.name,
    status: p.status,
    imageId: p.imageId,
    imageUrl: p.imageUrl,
    regionCount: p.regions.length,
    hasShareLink: p.hasShareLink,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

/** A placeholder "uploaded" photo used when a demo upload returns. */
export const DEMO_UPLOAD_IMAGE_URL = "/demo/swatch.svg";
