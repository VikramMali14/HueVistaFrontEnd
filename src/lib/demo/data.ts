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
  AiCreditSummary,
  CartCatalogue,
  CustomerEntitlement,
  MyRender,
  OrgResponse,
  PaintBrand,
  PaintLine,
  ProductCategory,
  ProjectDetail,
  ProjectSummary,
  RetailerCombo,
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
  projectsUsed: 12,
  projectsLimit: 45,
  projectsRemaining: 33,
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
  { id: 1, name: "Sample palette", slug: "asian-paints" },
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
  { id: "prod_01", lineId: 11, brandName: "Sample palette", lineName: "Royale Luxury Emulsion", category: "INTERIOR", price: 6200, priceUnit: "20 L", packSize: "20 L", coverage: "140-160 sq ft/L", finish: "Royale", qualityTier: "LUXURY", brightness: 5, imageUrl: null, features: "Stain resistant, low VOC, Teflon surface protection", description: "Premium silky-matt interior emulsion for living spaces.", createdAt: "2026-06-01T10:00:00+05:30" },
  { id: "prod_02", lineId: 12, brandName: "Sample palette", lineName: "Apcolite Premium Emulsion", category: "INTERIOR", price: 3400, priceUnit: "20 L", packSize: "20 L", coverage: "130-150 sq ft/L", finish: "Satin", qualityTier: "PREMIUM", brightness: 4, imageUrl: null, features: "Washable, smooth finish", description: "Everyday premium interior emulsion.", createdAt: "2026-06-02T10:00:00+05:30" },
  { id: "prod_03", lineId: 23, brandName: "Berger", lineName: "WeatherCoat Anti Dustt", category: "EXTERIOR", price: 4100, priceUnit: "20 L", packSize: "20 L", coverage: "90-110 sq ft/L", finish: "Matt", qualityTier: "PREMIUM", brightness: 4, imageUrl: null, features: "Dust-guard, anti-algae, 7-yr warranty", description: "Exterior emulsion that keeps walls cleaner for longer.", createdAt: "2026-06-03T10:00:00+05:30" },
  { id: "prod_04", lineId: 41, brandName: "Dulux", lineName: "Velvet Touch", category: "INTERIOR", price: 5800, priceUnit: "20 L", packSize: "20 L", coverage: "135-155 sq ft/L", finish: "Velvet", qualityTier: "LUXURY", brightness: 5, imageUrl: null, features: "Rich velvet sheen, anti-bacterial", description: "Luxury interior emulsion with a soft velvet finish.", createdAt: "2026-06-04T10:00:00+05:30" },
];

export const DEMO_CUSTOMERS: CustomerEntitlement[] = [
  { customerId: "cust_anjali", customerName: "Anjali Nair", customerEmail: "anjali@example.in", retailerOrgId: "org_demo", accessExpiresAt: "2026-09-24T00:00:00+05:30", expired: false, projectAllowance: 2, projectsCreated: 1, projectsRemaining: 1, updatedAt: "2026-06-20T10:00:00+05:30" },
  { customerId: "cust_verma", customerName: "Sunil Verma", customerEmail: "sunil.verma@gmail.com", retailerOrgId: "org_demo", accessExpiresAt: "2026-08-10T00:00:00+05:30", expired: false, projectAllowance: 1, projectsCreated: 1, projectsRemaining: 0, updatedAt: "2026-06-12T14:30:00+05:30" },
  { customerId: "cust_das", customerName: "Priya Das", customerEmail: "priya.das@outlook.com", retailerOrgId: "org_demo", accessExpiresAt: "2026-05-01T00:00:00+05:30", expired: true, projectAllowance: 1, projectsCreated: 1, projectsRemaining: 0, updatedAt: "2026-04-20T09:00:00+05:30" },
];

export const DEMO_ACCESS_CODES: AccessCode[] = [
  { id: "ac_01", code: "MEHTA7K2", organizationId: "org_demo", organizationName: "Mehta Paints", validDays: 7, expiresAt: "2026-07-01T00:00:00+05:30", used: false, expired: false, allowedBrands: ["Sample palette", "Berger"], createdAt: "2026-06-24T09:00:00+05:30" },
  { id: "ac_02", code: "MEHTA9QP", organizationId: "org_demo", organizationName: "Mehta Paints", validDays: 14, expiresAt: "2026-07-08T00:00:00+05:30", used: true, expired: false, usedAt: "2026-06-20T13:00:00+05:30", createdAt: "2026-06-06T10:00:00+05:30" },
  { id: "ac_03", code: "MEHTA3XR", organizationId: "org_demo", organizationName: "Mehta Paints", validDays: 3, expiresAt: "2026-05-01T00:00:00+05:30", used: false, expired: true, createdAt: "2026-04-28T08:00:00+05:30" },
];

// --- The shop's suggested three-shade combinations ("shop picks") ---
// Codes/hexes match the bundled SHADES sample so applying a combo in the demo
// studio snaps to real catalogue entries. Slot order: main wall, accent, trim.
export const DEMO_COMBOS: RetailerCombo[] = [
  {
    id: "combo_01",
    organizationId: "org_demo",
    organizationName: "Mehta Paints",
    name: "Warm evening",
    scope: "INTERIOR",
    shades: [
      { code: "HV-2118", name: "Terracotta", hex: "#a47148" },
      { code: "HV-2215", name: "Champagne", hex: "#dac1a3" },
      { code: "HV-N101", name: "Bone China", hex: "#f3eee4" },
    ],
    createdAt: "2026-06-18T10:00:00+05:30",
  },
  {
    id: "combo_02",
    organizationId: "org_demo",
    organizationName: "Mehta Paints",
    name: "Sage & linen",
    scope: "INTERIOR",
    shades: [
      { code: "HV-7711", name: "Pale Sage", hex: "#a9b8a4" },
      { code: "HV-7720", name: "Olive Branch", hex: "#5b6c5b" },
      { code: "HV-N110", name: "Linen", hex: "#e7d9c4" },
    ],
    createdAt: "2026-06-12T15:30:00+05:30",
  },
  {
    id: "combo_03",
    organizationId: "org_demo",
    organizationName: "Mehta Paints",
    name: "Street-front classic",
    scope: "EXTERIOR",
    shades: [
      { code: "HV-2112", name: "Saffron Cream", hex: "#d6a78a" },
      { code: "HV-2121", name: "Tan Bark", hex: "#8a5a3a" },
      { code: "HV-N101", name: "Bone China", hex: "#f3eee4" },
    ],
    createdAt: "2026-06-05T09:00:00+05:30",
  },
];

// --- In-store kiosk: the shop's public store link + its earnings wallet ---
// The slug matches DEMO_ORG so the URL the portal advertises (/store/<slug>)
// actually renders in demo mode.
export const DEMO_STORE_LINKS: StoreLink[] = [
  { id: "sl_01", slug: "mehta-paints-7a3b", organizationId: "org_demo", organizationName: "Mehta Paints", pricePaise: 9_900, bonusPoints: 30, currency: "INR", validDays: 7, active: true, createdAt: "2026-06-10T10:00:00+05:30" },
];

/** Numbers are coherent with the backend's derivation: balance = earned − pending − redeemed.
 *  Each ₹199 kiosk sale is HueVista's in full and earns the shop 30 points. */
export const DEMO_WALLET: WalletSummary = {
  organizationId: "org_demo",
  currency: "INR",
  pointsBalance: 90,          // 3 sales' worth still unspent
  lifetimePointsEarned: 120,  // 4 non-refunded sales x 30 points
  pointsPerSale: 30,
  kioskPricePaise: 9_900,
  recentPayments: [
    { id: "sp_05", amountPaise: 9_900, bonusPoints: 30, reversed: false, code: "MEHTA9105", createdAt: "2026-06-23T17:40:00+05:30" },
    { id: "sp_04", amountPaise: 9_900, bonusPoints: 30, reversed: false, code: "MEHTA9104", createdAt: "2026-06-22T12:15:00+05:30" },
    { id: "sp_03", amountPaise: 9_900, bonusPoints: 30, reversed: false, code: "MEHTA9103", createdAt: "2026-06-20T16:05:00+05:30" },
    { id: "sp_02", amountPaise: 9_900, bonusPoints: 30, reversed: true, code: "MEHTA9102", createdAt: "2026-06-17T11:30:00+05:30" },
    { id: "sp_01", amountPaise: 9_900, bonusPoints: 30, reversed: false, code: "MEHTA9101", createdAt: "2026-06-14T13:00:00+05:30" },
  ],
};

// --- The customer's counter: what they hold, and what those credits produced ---
//
// Three fixtures that the demo had no answer for at all, so the two screens they feed —
// Projects & credits, and the AI images shelf — came back 404 and rendered as an empty
// page. Both are customer-facing screens with money on them, which makes them exactly
// the ones worth being able to look at without a backend.

/** The AI wallet, with a statement that reads like one: bought, spent, refunded. */
export const DEMO_AI_CREDITS: AiCreditSummary = {
  eligible: true,
  balance: 4,
  pricePaise: 7_000,
  listPricePaise: 7_000,
  discountPercent: 0,
  minPurchase: 1,
  maxPurchase: 20,
  renderCost: 1,
  renderTiers: [
    { quality: "PREMIUM", credits: 1 },
    { quality: "LUXURY", credits: 2 },
  ],
  soonestExpiryAt: "2027-06-22T00:00:00+05:30",
  expiringCredits: 4,
  currency: "INR",
  recentActivity: [
    { id: "aic_05", credits: -1, type: "SPENT_ON_RENDER", balanceAfter: 4, note: "Sharma residence — hall", createdAt: "2026-06-23T18:02:00+05:30" },
    { id: "aic_04", credits: -1, type: "SPENT_ON_RENDER", balanceAfter: 5, note: "Iyer flat — master bedroom", createdAt: "2026-06-21T09:40:00+05:30" },
    { id: "aic_03", credits: 1, type: "RENDER_REFUNDED", balanceAfter: 6, note: null, createdAt: "2026-06-20T14:12:00+05:30" },
    { id: "aic_02", credits: -1, type: "SPENT_ON_RENDER", balanceAfter: 5, note: "Brew & Co café — facade", createdAt: "2026-06-19T11:20:00+05:30" },
    { id: "aic_01", credits: 6, type: "PURCHASED", balanceAfter: 6, note: null, createdAt: "2026-06-18T10:05:00+05:30" },
  ],
};

/** The counter itself, at the prices application.properties ships with. */
export const DEMO_CART: CartCatalogue = {
  eligible: true,
  projectPricePaise: 14_900,
  creditPricePaise: 7_000,
  comboPricePaise: 19_900,
  comboProjects: 1,
  comboCredits: 1,
  bundleAvailable: true,
  bundlePricePaise: 43_800,
  bundleListPricePaise: 65_700,
  bundleProjects: 3,
  bundleCredits: 3,
  validDays: 365,
  maxQuantity: 20,
  offers: [
    { code: "HUE10", minSubtotalPaise: 28_900, percentOff: 10 },
    { code: "HUE20", minSubtotalPaise: 58_900, percentOff: 20 },
    { code: "HUE25", minSubtotalPaise: 98_900, percentOff: 25 },
  ],
  // The packages carry their own saving, so the percentages do not come off them.
  offersApplyToPackages: false,
  availableProjects: 2,
  creditBalance: 4,
  creditsExpireAt: "2027-06-22T00:00:00+05:30",
  creditsExpiring: 4,
  currency: "INR",
};

/** Three finished pictures, one per seeded room, each with the shades it was made from —
 *  which is what makes the shelf's detail pane, its search and its PDF demoable. */
export const DEMO_RENDERS: MyRender[] = [
  {
    id: "rnd_03",
    projectId: "9f1c4a20-5b3e-4d61-8a77-1c2e5b8f0a31",
    projectName: "Sharma residence — hall",
    roomType: "Living room",
    status: "READY",
    imageUrl: "/demo/rooms/living-hall.svg",
    comboId: "combo_01",
    comboTitle: "Board 1 · Option 1",
    boardIndex: 1,
    timeOfDay: "DAY",
    borderMode: "KEEP_ORIGINAL",
    lighting: "NATURAL",
    furnishing: "KEEP",
    style: "MODERN",
    quality: "LUXURY",
    note: "The one the client picked.",
    shades: [
      { regionId: 101, regionLabel: "Main wall", shadeCode: "7184", shadeName: "Bone China", hex: "#E8DCC8" },
      { regionId: 102, regionLabel: "Accent wall", shadeCode: "2727", shadeName: "Sage Shadow", hex: "#5B6C5B" },
      { regionId: 103, regionLabel: "Trim", shadeCode: "L150", shadeName: "Chalk White", hex: "#F3EEE4" },
    ],
    createdAt: "2026-06-23T18:02:00+05:30",
    completedAt: "2026-06-23T18:03:30+05:30",
  },
  {
    id: "rnd_02",
    projectId: "3c7d8e14-62af-4b09-9d55-7e40a1c6b283",
    projectName: "Iyer flat — master bedroom",
    roomType: "Bedroom",
    status: "READY",
    imageUrl: "/demo/rooms/bedroom.svg",
    comboId: "combo_02",
    comboTitle: "Board 1 · Option 2",
    boardIndex: 1,
    timeOfDay: "NIGHT",
    borderMode: "KEEP_ORIGINAL",
    lighting: "WARM",
    furnishing: "STAGED",
    style: "MINIMAL",
    quality: "PREMIUM",
    shades: [
      { regionId: 201, regionLabel: "Main wall", shadeCode: "4091", shadeName: "Morning Mist", hex: "#C9D2D0" },
      { regionId: 202, regionLabel: "Accent wall", shadeCode: "10BB", shadeName: "Indigo Hour", hex: "#3B4A6B" },
    ],
    createdAt: "2026-06-21T09:40:00+05:30",
    completedAt: "2026-06-21T09:41:10+05:30",
  },
  {
    id: "rnd_01",
    projectId: "b52a06f7-91d3-4c88-a1e6-0f37d95c4a10",
    projectName: "Brew & Co café — facade",
    roomType: "Exterior",
    status: "READY",
    imageUrl: "/demo/rooms/cafe-exterior.svg",
    comboId: null,
    comboTitle: null,
    boardIndex: null,
    timeOfDay: "DAY",
    borderMode: "AI_SUGGESTED",
    lighting: "NATURAL",
    furnishing: "KEEP",
    style: "TRADITIONAL",
    quality: "PREMIUM",
    shades: [
      { regionId: 301, regionLabel: "Main facade", shadeCode: "7432", shadeName: "Burnt Sienna", hex: "#A4683F" },
      { regionId: 302, regionLabel: "Trim", shadeCode: "L150", shadeName: "Chalk White", hex: "#F3EEE4" },
    ],
    createdAt: "2026-06-19T11:20:00+05:30",
    completedAt: "2026-06-19T11:21:40+05:30",
  },
];

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
    channel: "IN_APP",
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
  { id: "conv_demo_02", channel: "IN_APP", status: "NEEDS_HUMAN", subject: "Exterior paint quote", requesterName: "Sunil Verma", requesterEmail: "sunil.verma@gmail.com", requesterRole: "CUSTOMER", lastMessage: "Connected to the HueVista team.", updatedAt: "2026-06-24T10:40:00+05:30" },
  { id: "conv_demo_01", channel: "IN_APP", status: "OPEN", subject: "How do I recolour a room?", requesterName: "Anjali Nair", requesterEmail: "anjali@example.in", requesterRole: "CUSTOMER", lastMessage: "Want me to walk you through it?", updatedAt: "2026-06-24T11:10:01+05:30" },
];

// --- Projects: full details are the source of truth; summaries are derived ---
export const DEMO_PROJECT_DETAILS: Record<string, ProjectDetail> = {
  "9f1c4a20-5b3e-4d61-8a77-1c2e5b8f0a31": {
    id: "9f1c4a20-5b3e-4d61-8a77-1c2e5b8f0a31",
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
  "3c7d8e14-62af-4b09-9d55-7e40a1c6b283": {
    id: "3c7d8e14-62af-4b09-9d55-7e40a1c6b283",
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
  "b52a06f7-91d3-4c88-a1e6-0f37d95c4a10": {
    id: "b52a06f7-91d3-4c88-a1e6-0f37d95c4a10",
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
  "6e08b3d5-4417-4f2a-bc93-58a1e7602d4f": {
    id: "6e08b3d5-4417-4f2a-bc93-58a1e7602d4f",
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
/**
 * Newest first, and the ids are real UUIDs on purpose.
 *
 * They used to read "prj_sharma_hall", which was friendlier in a fixture file and broke
 * the demo the day the studio started refusing a project id that is not shaped like one
 * (a malformed id would 400 at the backend and leave the studio to invent a message).
 * Every seeded room 404'd the moment it was opened from the dashboard — the one flow the
 * demo notes tell people to try first.
 */
export const DEMO_PROJECT_ORDER = [
  "9f1c4a20-5b3e-4d61-8a77-1c2e5b8f0a31",
  "3c7d8e14-62af-4b09-9d55-7e40a1c6b283",
  "b52a06f7-91d3-4c88-a1e6-0f37d95c4a10",
  "6e08b3d5-4417-4f2a-bc93-58a1e7602d4f",
];

export function toSummary(p: ProjectDetail): ProjectSummary {
  return {
    id: p.id,
    name: p.name,
    status: p.status,
    imageId: p.imageId,
    imageUrl: p.imageUrl,
    cleanedImageUrl: p.cleanedImageUrl ?? null,
    regionCount: p.regions.length,
    hasShareLink: p.hasShareLink,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

/** A placeholder "uploaded" photo used when a demo upload returns. */
export const DEMO_UPLOAD_IMAGE_URL = "/demo/swatch.svg";
