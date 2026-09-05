/**
 * Static demo fixtures (the seed data for DEMO_MODE). Realistic Indian
 * paint-retailer values. The mutable in-memory store (./store) is seeded from
 * deep clones of these so demo writes never corrupt the seed.
 *
 * DATES ARE RELATIVE, and have to be. Every timestamp here was once absolute,
 * pinned to "today is 2026-06-24", on the theory that a fixed date reads sensibly
 * whenever the demo is run. It reads sensibly for about a fortnight. Run it in
 * September and the trial ended two months ago, the access code a visitor is told
 * to redeem expired in July, and the one story this demo exists to tell — issue a
 * code, watch it count down, watch it lapse — is over before it starts.
 *
 * So anything the UI measures against the clock is a number of days from NOW, via
 * {@link daysFromNow}, and the demo is the same age on every run. Most offsets below
 * are the original June-2026 dates re-expressed against that day, so the fixture
 * world keeps the shape it was authored with; the few that encode a STATE rather
 * than a moment (a live trial, a lapsed code) are chosen, and say so.
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
  PlanOption,
  SupportConversationSummary,
  WalletSummary,
} from "../types";

/**
 * An ISO timestamp `days` from the moment the demo is read — negative for the past,
 * fractional for the same day. The fraction matters: a wallet's five sales and a
 * ledger's five movements are ordered by these, and rounding them all to "today"
 * turns a readable history into five identical rows.
 */
function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

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
  // Chosen, not derived: a week left, so the trial banner is a live countdown
  // rather than a date that has been in the past since July.
  currentPeriodEnd: daysFromNow(7),
  projectsUsed: 12,
  projectsLimit: 45,
  projectsRemaining: 33,
  // The board allowance, which Professional carries 40 of. Absent, the plan page fell
  // back to `?? 0` on both halves and printed "0 of 0 used" — a figure that looks like
  // a quota rather than like the missing field it was.
  pdfDownloadsUsed: 6,
  pdfDownloadsLimit: 40,
  pdfDownloadsRemaining: 34,
  // What an extra room costs this tier on the rupee rail. Absent, the plan page's
  // "or ₹…" fell back to `?? 0` and offered the shop a free project.
  extraProjectPricePaise: 9_900,
};

/** The CUSTOMER account's project entitlement (api/me/entitlement). */
export const DEMO_ENTITLEMENT: CustomerEntitlement = {
  customerId: "usr_anjali",
  customerName: "Anjali Nair",
  customerEmail: "anjali@example.in",
  retailerOrgId: "org_demo",
  accessExpiresAt: daysFromNow(92),
  expired: false,
  projectAllowance: 2,
  projectsCreated: 1,
  projectsRemaining: 1,
  updatedAt: daysFromNow(0.46),
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
  { id: "prod_01", lineId: 11, brandName: "Sample palette", lineName: "Royale Luxury Emulsion", category: "INTERIOR", price: 6200, priceUnit: "20 L", packSize: "20 L", coverage: "140-160 sq ft/L", finish: "Royale", qualityTier: "LUXURY", brightness: 5, imageUrl: null, features: "Stain resistant, low VOC, Teflon surface protection", description: "Premium silky-matt interior emulsion for living spaces.", createdAt: daysFromNow(-22.58) },
  { id: "prod_02", lineId: 12, brandName: "Sample palette", lineName: "Apcolite Premium Emulsion", category: "INTERIOR", price: 3400, priceUnit: "20 L", packSize: "20 L", coverage: "130-150 sq ft/L", finish: "Satin", qualityTier: "PREMIUM", brightness: 4, imageUrl: null, features: "Washable, smooth finish", description: "Everyday premium interior emulsion.", createdAt: daysFromNow(-21.58) },
  { id: "prod_03", lineId: 23, brandName: "Berger", lineName: "WeatherCoat Anti Dustt", category: "EXTERIOR", price: 4100, priceUnit: "20 L", packSize: "20 L", coverage: "90-110 sq ft/L", finish: "Matt", qualityTier: "PREMIUM", brightness: 4, imageUrl: null, features: "Dust-guard, anti-algae, 7-yr warranty", description: "Exterior emulsion that keeps walls cleaner for longer.", createdAt: daysFromNow(-20.58) },
  { id: "prod_04", lineId: 41, brandName: "Dulux", lineName: "Velvet Touch", category: "INTERIOR", price: 5800, priceUnit: "20 L", packSize: "20 L", coverage: "135-155 sq ft/L", finish: "Velvet", qualityTier: "LUXURY", brightness: 5, imageUrl: null, features: "Rich velvet sheen, anti-bacterial", description: "Luxury interior emulsion with a soft velvet finish.", createdAt: daysFromNow(-19.58) },
];

export const DEMO_CUSTOMERS: CustomerEntitlement[] = [
  { customerId: "cust_anjali", customerName: "Anjali Nair", customerEmail: "anjali@example.in", retailerOrgId: "org_demo", accessExpiresAt: daysFromNow(92), expired: false, projectAllowance: 2, projectsCreated: 1, projectsRemaining: 1, updatedAt: daysFromNow(-3.58) },
  // Chosen, same reason as the codes: one live window, one closed, each one's date
  // agreeing with its `expired` flag.
  { customerId: "cust_verma", customerName: "Sunil Verma", customerEmail: "sunil.verma@gmail.com", retailerOrgId: "org_demo", accessExpiresAt: daysFromNow(5), expired: false, projectAllowance: 1, projectsCreated: 1, projectsRemaining: 0, updatedAt: daysFromNow(-12) },
  { customerId: "cust_das", customerName: "Priya Das", customerEmail: "priya.das@outlook.com", retailerOrgId: "org_demo", accessExpiresAt: daysFromNow(-40), expired: true, projectAllowance: 1, projectsCreated: 1, projectsRemaining: 0, updatedAt: daysFromNow(-55) },
];

export const DEMO_ACCESS_CODES: AccessCode[] = [
  // Chosen: one code per state the portal filters by, with every date agreeing with
  // its flag. That agreement is the point — these rows used to put the contradiction
  // on screen, "expires 1 Jul" beside the word ACTIVE, read in September. All three
  // carry the 10 days the portal's own copy promises, rather than 7/14/3.
  { id: "ac_01", code: "MEHTA7K2", organizationId: "org_demo", organizationName: "Mehta Paints", validDays: 10, expiresAt: daysFromNow(6), used: false, expired: false, allowedBrands: ["Sample palette", "Berger"], createdAt: daysFromNow(-4) },
  { id: "ac_02", code: "MEHTA9QP", organizationId: "org_demo", organizationName: "Mehta Paints", validDays: 10, expiresAt: daysFromNow(3), used: true, expired: false, usedAt: daysFromNow(-5), createdAt: daysFromNow(-7) },
  { id: "ac_03", code: "MEHTA3XR", organizationId: "org_demo", organizationName: "Mehta Paints", validDays: 10, expiresAt: daysFromNow(-12), used: false, expired: true, createdAt: daysFromNow(-22) },
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
    createdAt: daysFromNow(-5.58),
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
    createdAt: daysFromNow(-11.35),
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
    createdAt: daysFromNow(-18.62),
  },
];

// --- In-store kiosk: the shop's public store link + its earnings wallet ---
// The slug matches DEMO_ORG so the URL the portal advertises (/store/<slug>)
// actually renders in demo mode.
export const DEMO_STORE_LINKS: StoreLink[] = [
  { id: "sl_01", slug: "mehta-paints-7a3b", organizationId: "org_demo", organizationName: "Mehta Paints", pricePaise: 9_900, bonusPoints: 30, currency: "INR", validDays: 7, active: true, createdAt: daysFromNow(-13.58) },
];

/** Numbers are coherent with the backend's derivation: balance = earned − pending − redeemed.
 *  Each ₹199 kiosk sale is HueVista's in full and earns the shop 30 points. */
/**
 * The tier ladder, as GET /api/billing/plans serves it.
 *
 * Figures track the public /pricing page. The demo's job here is to show the real
 * shape of the decision — what each tier costs, how many rooms and boards it carries,
 * what an extra room costs once they run out — and a ladder invented in this file that
 * disagreed with the marketing page would be demoing a product nobody sells.
 */
export const DEMO_PLANS: PlanOption[] = [
  {
    plan: "FREE", displayName: "Free", purchasable: false, rank: 0,
    priceInPaise: 0, priceInRupees: 0, taxPercent: 0, priceWithTaxInPaise: 0, priceWithTaxInRupees: 0,
    monthlyProjectLimit: 3, pdfImageLimit: 4, monthlyPdfLimit: 2,
    extraProjectPoints: 80, extraProjectPriceInPaise: 14_900, extraProjectPriceWithTaxInPaise: 14_900,
    colorMatching: false,
  },
  {
    plan: "STARTER", displayName: "Starter", purchasable: true, rank: 1,
    priceInPaise: 99_900, priceInRupees: 999, taxPercent: 0, priceWithTaxInPaise: 99_900, priceWithTaxInRupees: 999,
    monthlyProjectLimit: 15, pdfImageLimit: 6, monthlyPdfLimit: 15,
    extraProjectPoints: 60, extraProjectPriceInPaise: 11_900, extraProjectPriceWithTaxInPaise: 11_900,
    colorMatching: true,
  },
  {
    plan: "PROFESSIONAL", displayName: "Professional", purchasable: true, rank: 2,
    priceInPaise: 249_900, priceInRupees: 2499, taxPercent: 0, priceWithTaxInPaise: 249_900, priceWithTaxInRupees: 2499,
    monthlyProjectLimit: 45, pdfImageLimit: 8, monthlyPdfLimit: 40,
    extraProjectPoints: 50, extraProjectPriceInPaise: 9_900, extraProjectPriceWithTaxInPaise: 9_900,
    colorMatching: true,
  },
  {
    plan: "BUSINESS", displayName: "Business", purchasable: true, rank: 3,
    priceInPaise: 499_900, priceInRupees: 4999, taxPercent: 0, priceWithTaxInPaise: 499_900, priceWithTaxInRupees: 4999,
    monthlyProjectLimit: 120, pdfImageLimit: 12, monthlyPdfLimit: 120,
    extraProjectPoints: 40, extraProjectPriceInPaise: 7_900, extraProjectPriceWithTaxInPaise: 7_900,
    colorMatching: true,
  },
];

export const DEMO_WALLET: WalletSummary = {
  organizationId: "org_demo",
  currency: "INR",
  pointsBalance: 90,          // 3 sales' worth still unspent
  lifetimePointsEarned: 120,  // 4 non-refunded sales x 30 points
  pointsPerSale: 30,
  kioskPricePaise: 9_900,
  recentPayments: [
    { id: "sp_05", amountPaise: 9_900, bonusPoints: 30, reversed: false, code: "MEHTA9105", createdAt: daysFromNow(-0.26) },
    { id: "sp_04", amountPaise: 9_900, bonusPoints: 30, reversed: false, code: "MEHTA9104", createdAt: daysFromNow(-1.49) },
    { id: "sp_03", amountPaise: 9_900, bonusPoints: 30, reversed: false, code: "MEHTA9103", createdAt: daysFromNow(-3.33) },
    { id: "sp_02", amountPaise: 9_900, bonusPoints: 30, reversed: true, code: "MEHTA9102", createdAt: daysFromNow(-6.52) },
    { id: "sp_01", amountPaise: 9_900, bonusPoints: 30, reversed: false, code: "MEHTA9101", createdAt: daysFromNow(-9.46) },
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
  soonestExpiryAt: daysFromNow(363),
  expiringCredits: 4,
  currency: "INR",
  recentActivity: [
    { id: "aic_05", credits: -1, type: "SPENT_ON_RENDER", balanceAfter: 4, note: "Sharma residence — hall", createdAt: daysFromNow(-0.25) },
    { id: "aic_04", credits: -1, type: "SPENT_ON_RENDER", balanceAfter: 5, note: "Iyer flat — master bedroom", createdAt: daysFromNow(-2.6) },
    { id: "aic_03", credits: 1, type: "RENDER_REFUNDED", balanceAfter: 6, note: null, createdAt: daysFromNow(-3.41) },
    { id: "aic_02", credits: -1, type: "SPENT_ON_RENDER", balanceAfter: 5, note: "Brew & Co café — facade", createdAt: daysFromNow(-4.53) },
    { id: "aic_01", credits: 6, type: "PURCHASED", balanceAfter: 6, note: null, createdAt: daysFromNow(-5.58) },
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
  creditsExpireAt: daysFromNow(363),
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
    createdAt: daysFromNow(-0.25),
    completedAt: daysFromNow(-0.25),
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
    createdAt: daysFromNow(-2.6),
    completedAt: daysFromNow(-2.6),
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
    createdAt: daysFromNow(-4.53),
    completedAt: daysFromNow(-4.53),
  },
];

// --- Support: the customer's own thread + the staff inbox (ADMIN) ---
export const DEMO_SUPPORT_CONVERSATIONS: SupportConversation[] = [
  {
    id: "conv_demo_01",
    channel: "IN_APP",
    status: "OPEN",
    subject: "How do I recolour a room?",
    createdAt: daysFromNow(0.47),
    updatedAt: daysFromNow(0.47),
    messages: [
      { id: "m1", sender: "USER", body: "How do I recolour a room?", createdAt: daysFromNow(0.47) },
      { id: "m2", sender: "AI", body: "Hi! Open the Studio, upload a photo of the room and we detect the walls automatically — then tap any catalogue shade to paint a wall. Want me to walk you through it?", createdAt: daysFromNow(0.47) },
    ],
  },
  {
    id: "conv_demo_02",
    channel: "IN_APP",
    status: "NEEDS_HUMAN",
    subject: "Exterior paint quote",
    createdAt: daysFromNow(0.44),
    updatedAt: daysFromNow(0.44),
    messages: [
      { id: "m3", sender: "USER", body: "What is the price of WeatherCoat for a 1200 sq ft house?", createdAt: daysFromNow(0.44) },
      { id: "m4", sender: "AI", body: "WeatherCoat Anti Dustt is ₹4,100 for a 20 L pack (≈90-110 sq ft/L). For 1200 sq ft with two coats you'd need roughly 25-30 L. Let me connect you to the shop for an exact quote.", createdAt: daysFromNow(0.44) },
      { id: "m5", sender: "SYSTEM", body: "Connected to the HueVista team.", createdAt: daysFromNow(0.44) },
    ],
  },
];

export const DEMO_INBOX: SupportConversationSummary[] = [
  { id: "conv_demo_02", channel: "IN_APP", status: "NEEDS_HUMAN", subject: "Exterior paint quote", requesterName: "Sunil Verma", requesterEmail: "sunil.verma@gmail.com", requesterRole: "CUSTOMER", lastMessage: "Connected to the HueVista team.", updatedAt: daysFromNow(0.44) },
  { id: "conv_demo_01", channel: "IN_APP", status: "OPEN", subject: "How do I recolour a room?", requesterName: "Anjali Nair", requesterEmail: "anjali@example.in", requesterRole: "CUSTOMER", lastMessage: "Want me to walk you through it?", updatedAt: daysFromNow(0.47) },
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
    shareExpiresAt: daysFromNow(5),
    createdAt: daysFromNow(-1.58),
    updatedAt: daysFromNow(-1.57),
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
    createdAt: daysFromNow(-3.31),
    updatedAt: daysFromNow(-3.31),
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
    createdAt: daysFromNow(-5.62),
    updatedAt: daysFromNow(-5.62),
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
    createdAt: daysFromNow(-8.5),
    updatedAt: daysFromNow(-8.5),
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
