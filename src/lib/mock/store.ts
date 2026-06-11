/**
 * In-memory state for mock mode. Seeded once per server process (kept on
 * globalThis so Next.js dev-mode hot reloads don't wipe it) and mutated by the
 * mock BFF handlers, so created projects, colour changes, issued codes, support
 * threads etc. all persist for the lifetime of the dev server.
 */

import type {
  AccessCode,
  AuthUser,
  CustomerEntitlement,
  OrgResponse,
  PaintBrand,
  PaintLine,
  ProjectDetail,
  ProjectStatus,
  ProjectSummary,
  RegionCategory,
  RegionDetail,
  ShopProduct,
  SubscriptionSummary,
  SupportConversation,
  SupportConversationStatus,
  SupportMessage,
  UploadedImage,
  UserProfile,
} from "../types";
import { MOCK_USERS, MOCK_PASSWORD } from "./index";
import { sampleRoomAssets, genericMasks } from "./scene";

export interface MockUser extends AuthUser {
  password: string;
  createdAt: string;
}

export interface MockImage {
  meta: UploadedImage;
  bytes: Buffer;
  contentType: string;
  ownerId: string;
}

export interface MockRegion {
  id: number;
  label: string;
  category: RegionCategory;
  appliedShadeCode: string | null;
  appliedHexCode: string | null;
  displayOrder: number;
  maskBytes: Buffer;
}

export interface MockProject {
  id: string;
  ownerId: string;
  name: string;
  roomType: string | null;
  notes: string | null;
  status: ProjectStatus;
  imageId: string;
  regions: MockRegion[];
  /** Set when /segment is called; status flips to SEGMENTED ~2.5 s later. */
  segmentStartedAt: number | null;
  shareToken: string | null;
  shareExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface MockSupportThread {
  id: string;
  ownerId: string;
  channel: "IN_APP";
  status: SupportConversationStatus;
  subject: string | null;
  messages: SupportMessage[];
  createdAt: string;
  updatedAt: string;
}

interface MockStore {
  users: Map<string, MockUser>;
  images: Map<string, MockImage>;
  projects: Map<string, MockProject>;
  orgs: Map<string, OrgResponse>;
  accessCodes: AccessCode[];
  entitlements: Map<string, CustomerEntitlement>; // by customerId
  brands: PaintBrand[];
  lines: Map<number, PaintLine[]>; // by brandId
  products: Map<string, ShopProduct[]>; // by orgId
  support: Map<string, MockSupportThread>;
  seq: number;
}

const daysFromNow = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

function seed(): MockStore {
  const room = sampleRoomAssets();

  const users = new Map<string, MockUser>(
    MOCK_USERS.map((u) => [u.id, { ...u, createdAt: daysAgo(30) }]),
  );

  const images = new Map<string, MockImage>();
  const sampleImage = (id: string, ownerId: string, filename: string, uploadedAt: string): MockImage => ({
    meta: {
      imageId: id,
      imageUrl: `/api/images/files/mock/${id}`,
      originalFilename: filename,
      imageType: "INDOOR",
      fileSize: room.image.length,
      uploadedAt,
    },
    bytes: room.image,
    contentType: "image/png",
    ownerId,
  });
  images.set("img-living", sampleImage("img-living", "mock-retailer", "living-room.png", daysAgo(6)));
  images.set("img-bedroom", sampleImage("img-bedroom", "mock-retailer", "bedroom.png", daysAgo(2)));
  images.set("img-customer", sampleImage("img-customer", "mock-customer", "my-hall.png", daysAgo(1)));

  let regionSeq = 1;
  const roomRegions = (painted: boolean): MockRegion[] => [
    {
      id: regionSeq++,
      label: "Main wall",
      category: "MAIN_WALL",
      appliedShadeCode: painted ? "AP-2104" : null,
      appliedHexCode: painted ? "#dac1a3" : null,
      displayOrder: 0,
      maskBytes: room.masks.main,
    },
    {
      id: regionSeq++,
      label: "Accent wall",
      category: "ACCENT_WALL",
      appliedShadeCode: painted ? "AP-7720" : null,
      appliedHexCode: painted ? "#5b6c5b" : null,
      displayOrder: 1,
      maskBytes: room.masks.accent,
    },
    {
      id: regionSeq++,
      label: "Trim",
      category: "TRIM",
      appliedShadeCode: painted ? "AP-N101" : null,
      appliedHexCode: painted ? "#f3eee4" : null,
      displayOrder: 2,
      maskBytes: room.masks.trim,
    },
  ];

  const projects = new Map<string, MockProject>();
  projects.set("proj-living", {
    id: "proj-living",
    ownerId: "mock-retailer",
    name: "Sunlit living room",
    roomType: "Living room",
    notes: "Demo project — sage accent against champagne walls.",
    status: "SEGMENTED",
    imageId: "img-living",
    regions: roomRegions(true),
    segmentStartedAt: null,
    shareToken: "demo-share-token",
    shareExpiresAt: daysFromNow(7),
    createdAt: daysAgo(6),
    updatedAt: daysAgo(1),
  });
  projects.set("proj-bedroom", {
    id: "proj-bedroom",
    ownerId: "mock-retailer",
    name: "Bedroom refresh",
    roomType: "Bedroom",
    notes: null,
    status: "SEGMENTED",
    imageId: "img-bedroom",
    regions: roomRegions(false),
    segmentStartedAt: null,
    shareToken: null,
    shareExpiresAt: null,
    createdAt: daysAgo(2),
    updatedAt: daysAgo(2),
  });
  projects.set("proj-customer", {
    id: "proj-customer",
    ownerId: "mock-customer",
    name: "My hall",
    roomType: "Living room",
    notes: null,
    status: "SEGMENTED",
    imageId: "img-customer",
    regions: roomRegions(true),
    segmentStartedAt: null,
    shareToken: null,
    shareExpiresAt: null,
    createdAt: daysAgo(1),
    updatedAt: daysAgo(1),
  });

  const orgs = new Map<string, OrgResponse>();
  orgs.set("org-mehta", {
    id: "org-mehta",
    name: "Mehta Paints & Hardware",
    slug: "mehta-paints",
    type: "RETAILER",
    ownerUserId: "mock-retailer",
    ownerName: "Priya Mehta",
  });

  const accessCodes: AccessCode[] = [
    {
      id: "code-1",
      code: "HV-7KQ2M",
      organizationId: "org-mehta",
      organizationName: "Mehta Paints & Hardware",
      validDays: 7,
      expiresAt: daysFromNow(5),
      used: true,
      expired: false,
      usedAt: daysAgo(1),
      createdAt: daysAgo(2),
    },
    {
      id: "code-2",
      code: "HV-3XB9T",
      organizationId: "org-mehta",
      organizationName: "Mehta Paints & Hardware",
      validDays: 14,
      expiresAt: daysFromNow(13),
      used: false,
      expired: false,
      usedAt: null,
      createdAt: daysAgo(1),
    },
  ];

  const entitlements = new Map<string, CustomerEntitlement>();
  entitlements.set("mock-customer", {
    customerId: "mock-customer",
    customerName: "Arjun Rao",
    customerEmail: "customer@huevista.test",
    retailerOrgId: "org-mehta",
    accessExpiresAt: daysFromNow(5),
    expired: false,
    projectAllowance: 2,
    projectsCreated: 1,
    projectsRemaining: 1,
    updatedAt: daysAgo(1),
  });
  entitlements.set("cust-walkin", {
    customerId: "cust-walkin",
    customerName: "Meera Iyer",
    customerEmail: "meera@example.com",
    retailerOrgId: "org-mehta",
    accessExpiresAt: daysFromNow(2),
    expired: false,
    projectAllowance: 1,
    projectsCreated: 1,
    projectsRemaining: 0,
    updatedAt: daysAgo(2),
  });

  const brands: PaintBrand[] = [
    { id: 1, name: "Asian Paints", slug: "asian-paints" },
    { id: 2, name: "Berger", slug: "berger" },
    { id: 3, name: "Nerolac", slug: "nerolac" },
    { id: 4, name: "Dulux", slug: "dulux" },
  ];
  const lines = new Map<number, PaintLine[]>([
    [1, [
      { id: 11, name: "Royale Luxury Emulsion", category: "INTERIOR", qualityTier: "LUXURY", defaultFinish: "Royale" },
      { id: 12, name: "Tractor Emulsion", category: "INTERIOR", qualityTier: "ECONOMY", defaultFinish: "Matt" },
      { id: 13, name: "Apex Ultima", category: "EXTERIOR", qualityTier: "PREMIUM", defaultFinish: "Satin" },
    ]],
    [2, [
      { id: 21, name: "Silk Glamor", category: "INTERIOR", qualityTier: "LUXURY", defaultFinish: "Satin" },
      { id: 22, name: "WeatherCoat Long Life", category: "EXTERIOR", qualityTier: "PREMIUM", defaultFinish: "Matt" },
    ]],
    [3, [
      { id: 31, name: "Impressions HD", category: "INTERIOR", qualityTier: "PREMIUM", defaultFinish: "Matt" },
      { id: 32, name: "Excel Total", category: "EXTERIOR", qualityTier: "PREMIUM", defaultFinish: "Matt" },
    ]],
    [4, [
      { id: 41, name: "Velvet Touch", category: "INTERIOR", qualityTier: "LUXURY", defaultFinish: "Velvet" },
      { id: 42, name: "Weathershield Max", category: "EXTERIOR", qualityTier: "PREMIUM", defaultFinish: "Matt" },
    ]],
  ]);

  const products = new Map<string, ShopProduct[]>([
    ["org-mehta", [
      {
        id: "prod-1",
        lineId: 11,
        brandName: "Asian Paints",
        lineName: "Royale Luxury Emulsion",
        category: "INTERIOR",
        price: 620,
        priceUnit: "per litre",
        packSize: "1L / 4L / 10L",
        coverage: "120–140 sq ft per litre",
        finish: "Royale",
        qualityTier: "LUXURY",
        brightness: 4,
        imageUrl: null,
        features: "Teflon surface protector, washable",
        description: "Flagship interior emulsion with a smooth, rich finish.",
        createdAt: daysAgo(10),
      },
      {
        id: "prod-2",
        lineId: 21,
        brandName: "Berger",
        lineName: "Silk Glamor",
        category: "INTERIOR",
        price: 540,
        priceUnit: "per litre",
        packSize: "1L / 4L",
        coverage: "110–130 sq ft per litre",
        finish: "Satin",
        qualityTier: "LUXURY",
        brightness: 5,
        imageUrl: null,
        features: "High sheen, stain resistant",
        description: "Luxury sheen emulsion for feature walls.",
        createdAt: daysAgo(8),
      },
    ]],
  ]);

  const support = new Map<string, MockSupportThread>();
  support.set("sup-1", {
    id: "sup-1",
    ownerId: "mock-retailer",
    channel: "IN_APP",
    status: "OPEN",
    subject: "How do access codes work?",
    createdAt: daysAgo(3),
    updatedAt: daysAgo(3),
    messages: [
      { id: "m-1", sender: "USER", body: "How long does a customer access code stay valid?", createdAt: daysAgo(3) },
      { id: "m-2", sender: "AI", body: "Each code is valid for the number of days you pick when issuing it (7, 14 or 30). The customer's projects stay readable after expiry, but they can't create new ones until you grant more access.", createdAt: daysAgo(3) },
    ],
  });
  support.set("sup-2", {
    id: "sup-2",
    ownerId: "mock-customer",
    channel: "IN_APP",
    status: "NEEDS_HUMAN",
    subject: "Wrong shade delivered",
    createdAt: daysAgo(1),
    updatedAt: daysAgo(1),
    messages: [
      { id: "m-3", sender: "USER", body: "The can I received doesn't match the preview I approved. Can someone check my order?", createdAt: daysAgo(1) },
      { id: "m-4", sender: "AI", body: "I'm sorry about that — order issues need a person. I've flagged this conversation for our support team.", createdAt: daysAgo(1) },
      { id: "m-5", sender: "SYSTEM", body: "Conversation escalated to human support.", createdAt: daysAgo(1) },
    ],
  });

  return {
    users,
    images,
    projects,
    orgs,
    accessCodes,
    entitlements,
    brands,
    lines,
    products,
    support,
    seq: 1000,
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __hvMockStore: MockStore | undefined;
}

export function store(): MockStore {
  if (!globalThis.__hvMockStore) globalThis.__hvMockStore = seed();
  return globalThis.__hvMockStore;
}

export function nextId(prefix: string): string {
  return `${prefix}-${store().seq++}`;
}

export function nextNum(): number {
  return store().seq++;
}

// ---------------------------------------------------------------------------
// Lookups and projections shared by the handlers.
// ---------------------------------------------------------------------------

export function findUserByEmail(email: string): MockUser | undefined {
  for (const u of store().users.values()) if (u.email === email.toLowerCase()) return u;
  return undefined;
}

export function findUserById(id: string): MockUser | undefined {
  return store().users.get(id);
}

export function registerUser(input: { name: string; email: string; password?: string; role?: AuthUser["role"] }): MockUser {
  const user: MockUser = {
    id: nextId("mock-user"),
    name: input.name,
    email: input.email.toLowerCase(),
    provider: "LOCAL",
    role: input.role ?? "RETAILER",
    emailVerified: false,
    phoneNumber: null,
    phoneVerified: false,
    password: input.password ?? MOCK_PASSWORD,
    createdAt: new Date().toISOString(),
  };
  store().users.set(user.id, user);
  return user;
}

export function toProfile(u: MockUser): UserProfile {
  const { password: _password, createdAt, ...rest } = u;
  return { ...rest, createdAt, updatedAt: createdAt };
}

export function toRegionDetail(projectId: string, r: MockRegion): RegionDetail {
  return {
    id: r.id,
    label: r.label,
    category: r.category,
    maskUrl: `/api/projects/${projectId}/regions/${r.id}/mask`,
    appliedShadeCode: r.appliedShadeCode,
    appliedHexCode: r.appliedHexCode,
    displayOrder: r.displayOrder,
  };
}

/** Lazily flip SEGMENTING → SEGMENTED ~2.5 s after segment was requested, so the studio's polling UX plays out. */
export function settleSegmentation(p: MockProject) {
  if (p.status === "SEGMENTING" && p.segmentStartedAt && Date.now() - p.segmentStartedAt > 2500) {
    const masks = genericMasks();
    let order = 0;
    p.regions = [
      { id: nextNum(), label: "Main wall", category: "MAIN_WALL", appliedShadeCode: null, appliedHexCode: null, displayOrder: order++, maskBytes: masks.main },
      { id: nextNum(), label: "Accent wall", category: "ACCENT_WALL", appliedShadeCode: null, appliedHexCode: null, displayOrder: order++, maskBytes: masks.accent },
      { id: nextNum(), label: "Trim", category: "TRIM", appliedShadeCode: null, appliedHexCode: null, displayOrder: order++, maskBytes: masks.trim },
    ];
    p.status = "SEGMENTED";
    p.segmentStartedAt = null;
    p.updatedAt = new Date().toISOString();
  }
}

export function toProjectDetail(p: MockProject): ProjectDetail {
  settleSegmentation(p);
  const image = store().images.get(p.imageId);
  return {
    id: p.id,
    name: p.name,
    roomType: p.roomType,
    notes: p.notes,
    status: p.status,
    imageId: p.imageId,
    imageUrl: image?.meta.imageUrl ?? "",
    cleanedImageUrl: image?.meta.imageUrl ?? null,
    failureReason: null,
    regions: p.regions.map((r) => toRegionDetail(p.id, r)),
    hasShareLink: Boolean(p.shareToken),
    shareExpiresAt: p.shareExpiresAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export function toProjectSummary(p: MockProject): ProjectSummary {
  settleSegmentation(p);
  const image = store().images.get(p.imageId);
  return {
    id: p.id,
    name: p.name,
    status: p.status,
    imageId: p.imageId,
    imageUrl: image?.meta.imageUrl ?? "",
    regionCount: p.regions.length,
    hasShareLink: Boolean(p.shareToken),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export function findProjectByShareToken(token: string): MockProject | undefined {
  for (const p of store().projects.values()) if (p.shareToken === token) return p;
  return undefined;
}

export function subscriptionFor(user: MockUser): SubscriptionSummary | null {
  if (user.role !== "RETAILER" && user.role !== "ADMIN") return null;
  return {
    id: `sub-${user.id}`,
    plan: "PROFESSIONAL",
    planDisplayName: "Professional",
    status: "ACTIVE",
    trial: true,
    currentPeriodEnd: daysFromNow(9),
    aiGenerationsUsed: 7,
    aiGenerationsLimit: 25,
    aiGenerationsRemaining: 18,
  };
}

export function toConversation(t: MockSupportThread): SupportConversation {
  return {
    id: t.id,
    channel: t.channel,
    status: t.status,
    subject: t.subject,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    messages: t.messages,
  };
}

export function toConversationSummary(t: MockSupportThread) {
  const owner = findUserById(t.ownerId);
  const last = t.messages[t.messages.length - 1];
  return {
    id: t.id,
    channel: t.channel,
    status: t.status,
    subject: t.subject,
    requesterName: owner?.name ?? null,
    requesterEmail: owner?.email ?? null,
    requesterRole: owner?.role ?? null,
    lastMessage: last?.body ?? null,
    updatedAt: t.updatedAt,
  };
}

export type { MockSupportThread };
