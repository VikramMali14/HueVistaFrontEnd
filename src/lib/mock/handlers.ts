/**
 * Mock implementations of every backend endpoint the frontend calls through the
 * /bff proxy. Pure in-memory request handling — see ./index.ts for the overview
 * and ./store.ts for the seeded data.
 */

import { NextRequest, NextResponse } from "next/server";
import { config } from "../config";
import type { AccessCode, CustomerEntitlement, PaintLine, ProductCategory, ShopProduct } from "../types";
import { MOCK_GUEST_TOKEN, MOCK_OTP, userIdFromMockToken } from "./index";
import {
  findUserById,
  nextId,
  nextNum,
  store,
  subscriptionFor,
  toConversation,
  toConversationSummary,
  toProfile,
  toProjectDetail,
  toProjectSummary,
  toRegionDetail,
  type MockProject,
  type MockUser,
} from "./store";

const GUEST_OWNER = "mock-guest";

function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status });
}

function err(status: number, message: string, code?: string): NextResponse {
  return NextResponse.json({ status, message, code }, { status });
}

function binary(bytes: Buffer, contentType: string): NextResponse {
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=3600" },
  });
}

function maskDestination(value: string, email: boolean): string {
  if (email) {
    const [local = "", domain = ""] = value.split("@");
    return `${local.slice(0, 1)}***@${domain}`;
  }
  return `******${value.replace(/\D/g, "").slice(-3)}`;
}

async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    return ((await req.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function decodeBase64Image(raw: string): Buffer {
  const data = raw.includes(",") ? raw.slice(raw.indexOf(",") + 1) : raw;
  return Buffer.from(data, "base64");
}

/** Strip retailer-only shade codes from a project, as the backend's guest projection does. */
function maskShadeCodes<T extends { regions: Array<{ appliedShadeCode?: string | null }> }>(detail: T): T {
  return { ...detail, regions: detail.regions.map((r) => ({ ...r, appliedShadeCode: null })) };
}

function cannedAiReply(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("code")) {
    return "Access codes are issued from your Customer Portal — each one gives a customer one project for the validity window you choose. Anything else I can help with?";
  }
  if (m.includes("price") || m.includes("plan") || m.includes("cost")) {
    return "Plans start with a free 14-day Professional trial (25 AI previews a month). You can compare every tier on the Pricing page. Want me to loop in a person?";
  }
  return "Thanks for the details! In this mock environment I'm a canned response, but in production the AI assistant answers from your account context. Use \"Talk to a human\" to test the escalation flow.";
}

interface Ctx {
  req: NextRequest;
  user: MockUser | null; // null when the caller is the anonymous guest
  ownerId: string; // user id or GUEST_OWNER
}

// ---------------------------------------------------------------------------
// Project + image flows (shared by user and guest paths).
// ---------------------------------------------------------------------------

async function uploadImage(ctx: Ctx): Promise<NextResponse> {
  const form = await ctx.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return err(400, "No file in upload.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const id = nextId("img");
  const meta = {
    imageId: id,
    imageUrl: `/api/images/files/mock/${id}`,
    originalFilename: file.name || "upload",
    imageType: "INDOOR" as const,
    fileSize: bytes.length,
    uploadedAt: new Date().toISOString(),
  };
  store().images.set(id, { meta, bytes, contentType: file.type || "image/jpeg", ownerId: ctx.ownerId });
  return json(meta);
}

function ownProject(ctx: Ctx, id: string): MockProject | null {
  const p = store().projects.get(id);
  return p && p.ownerId === ctx.ownerId ? p : null;
}

async function createProject(ctx: Ctx): Promise<NextResponse> {
  const body = await readJson(ctx.req);
  const imageId = String(body.imageId ?? "");
  const image = store().images.get(imageId);
  if (!image) return err(404, "Image not found.");
  if (ctx.ownerId === GUEST_OWNER) {
    const existing = [...store().projects.values()].filter((p) => p.ownerId === GUEST_OWNER);
    if (existing.length >= 1) return err(402, "Your shop code includes one project. Ask the shop for another.");
  }
  const now = new Date().toISOString();
  const project: MockProject = {
    id: nextId("proj"),
    ownerId: ctx.ownerId,
    name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : "Untitled project",
    roomType: typeof body.roomType === "string" ? body.roomType : null,
    notes: typeof body.notes === "string" ? body.notes : null,
    status: "CREATED",
    imageId,
    regions: [],
    segmentStartedAt: null,
    shareToken: null,
    shareExpiresAt: null,
    createdAt: now,
    updatedAt: now,
  };
  store().projects.set(project.id, project);
  if (ctx.user) {
    const ent = store().entitlements.get(ctx.user.id);
    if (ent) {
      ent.projectsCreated += 1;
      ent.projectsRemaining = Math.max(0, ent.projectAllowance - ent.projectsCreated);
      ent.updatedAt = now;
    }
  }
  return json(toProjectDetail(project));
}

async function updateRegions(ctx: Ctx, project: MockProject): Promise<NextResponse> {
  const updates = (await readJson(ctx.req)) as unknown;
  const list = Array.isArray(updates) ? updates : [];
  for (const u of list as Array<{ regionId?: number; shadeCode?: string | null; hexCode?: string | null }>) {
    const region = project.regions.find((r) => r.id === Number(u.regionId));
    if (!region) continue;
    region.appliedShadeCode = u.shadeCode ?? null;
    region.appliedHexCode = u.hexCode ?? null;
  }
  project.updatedAt = new Date().toISOString();
  return json(toProjectDetail(project));
}

async function createCustomMask(ctx: Ctx, project: MockProject): Promise<NextResponse> {
  const body = await readJson(ctx.req);
  const maskBase64 = typeof body.maskBase64 === "string" ? body.maskBase64 : "";
  if (!maskBase64) return err(400, "maskBase64 is required.");
  const category = typeof body.category === "string" ? body.category : "MANUAL";
  const region = {
    id: nextNum(),
    label: typeof body.label === "string" && body.label ? body.label : "Custom wall",
    category: (["MAIN_WALL", "ACCENT_WALL", "OTHER_WALL", "TRIM", "MANUAL"].includes(category)
      ? category
      : "MANUAL") as MockProject["regions"][number]["category"],
    appliedShadeCode: null,
    appliedHexCode: null,
    displayOrder: project.regions.length,
    maskBytes: decodeBase64Image(maskBase64),
  };
  project.regions.push(region);
  project.updatedAt = new Date().toISOString();
  return json(toRegionDetail(project.id, region));
}

// ---------------------------------------------------------------------------
// The router. `path` is the joined backend path, e.g. "api/projects/p1/status".
// ---------------------------------------------------------------------------

export async function handleMockBff(req: NextRequest, path: string): Promise<NextResponse> {
  const method = req.method.toUpperCase();

  // Image bytes are served before the auth check — the public share page embeds
  // them for anonymous visitors (matches the backend's presigned-URL behaviour).
  const fileMatch = path.match(/^api\/images\/files\/mock\/([^/]+)$/);
  if (fileMatch && method === "GET") {
    const image = store().images.get(fileMatch[1]!);
    if (!image) return err(404, "Image not found.");
    return binary(image.bytes, image.contentType);
  }

  const isGuestPath = path === "api/guest" || path.startsWith("api/guest/");

  let user: MockUser | null = null;
  let ownerId: string;
  if (isGuestPath) {
    const guestToken = req.cookies.get(config.guestCookie)?.value;
    if (guestToken !== MOCK_GUEST_TOKEN) return err(401, "Not authenticated");
    ownerId = GUEST_OWNER;
    path = path.replace(/^api\/guest\//, "api/"); // guest routes mirror the user ones
  } else {
    const token = req.cookies.get(config.accessCookie)?.value ?? "";
    // The dev-bypass token (DEV_BYPASS_AUTH=1) acts as the retailer in mock mode.
    const userId = token === "dev-bypass-token" ? "mock-retailer" : userIdFromMockToken(token);
    user = userId ? (findUserById(userId) ?? null) : null;
    if (!user) return err(401, "Not authenticated");
    ownerId = user.id;
  }
  const ctx: Ctx = { req, user, ownerId };

  const m = (re: RegExp) => path.match(re);
  let match: RegExpMatchArray | null;

  // --- Profile + OTP verification (static code 123456) ---
  if (path === "api/auth/profile" && method === "GET") {
    return user ? json(toProfile(user)) : err(403, "Guests have no profile.");
  }
  if (path === "api/auth/me" && method === "GET") return json({ userId: ownerId });
  if ((match = m(/^api\/auth\/verify\/(email|phone)\/send$/)) && method === "POST") {
    if (!user) return err(403, "Guests cannot verify.");
    const channel = match[1] === "email" ? "EMAIL" : "PHONE";
    if (channel === "PHONE") {
      const body = await readJson(req);
      if (typeof body.phoneNumber === "string" && body.phoneNumber.trim()) {
        user.phoneNumber = body.phoneNumber.trim();
      }
      if (!user.phoneNumber) return err(400, "Add a phone number first.");
    }
    return json({
      channel,
      destination:
        channel === "EMAIL" ? maskDestination(user.email, true) : maskDestination(user.phoneNumber ?? "", false),
      expiresInSeconds: 300,
      cooldownSeconds: 30,
    });
  }
  if ((match = m(/^api\/auth\/verify\/(email|phone)\/confirm$/)) && method === "POST") {
    if (!user) return err(403, "Guests cannot verify.");
    const body = await readJson(req);
    if (String(body.code ?? "") !== MOCK_OTP) return err(400, `Wrong code. (Mock mode: the code is always ${MOCK_OTP}.)`);
    if (match[1] === "email") user.emailVerified = true;
    else user.phoneVerified = true;
    return json(toProfile(user));
  }

  // --- Images ---
  if (path === "api/images/upload" && method === "POST") return uploadImage(ctx);
  if (path === "api/images" && method === "GET") {
    return json([...store().images.values()].filter((i) => i.ownerId === ownerId).map((i) => i.meta));
  }
  if ((match = m(/^api\/images\/([^/]+)$/)) && method === "GET") {
    const image = store().images.get(match[1]!);
    if (!image || image.ownerId !== ownerId) return err(404, "Image not found.");
    return json(image.meta);
  }

  // --- Projects ---
  if (path === "api/projects" && method === "GET") {
    const list = [...store().projects.values()]
      .filter((p) => p.ownerId === ownerId)
      .sort((a, b) => (b.updatedAt < a.updatedAt ? -1 : 1))
      .map(toProjectSummary);
    return json(list);
  }
  if (path === "api/projects" && method === "POST") return createProject(ctx);
  if ((match = m(/^api\/projects\/([^/]+)\/regions\/(\d+)\/mask$/)) && method === "GET") {
    const project = store().projects.get(match[1]!);
    const region = project?.regions.find((r) => r.id === Number(match![2]));
    if (!region) return err(404, "Mask not found.");
    return binary(region.maskBytes, "image/png");
  }
  if ((match = m(/^api\/projects\/([^/]+)\/segment$/)) && method === "POST") {
    const project = ownProject(ctx, match[1]!);
    if (!project) return err(404, "Project not found.");
    project.status = "SEGMENTING";
    project.segmentStartedAt = Date.now();
    return json(toProjectDetail(project));
  }
  if ((match = m(/^api\/projects\/([^/]+)\/status$/)) && method === "GET") {
    const project = ownProject(ctx, match[1]!);
    if (!project) return err(404, "Project not found.");
    return json(toProjectDetail(project));
  }
  if ((match = m(/^api\/projects\/([^/]+)\/share$/)) && method === "POST") {
    const project = ownProject(ctx, match[1]!);
    if (!project) return err(404, "Project not found.");
    const days = Math.max(1, Number(req.nextUrl.searchParams.get("days") ?? "7"));
    project.shareToken = project.shareToken ?? `mock-share-${store().seq++}`;
    project.shareExpiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
    return json({
      shareUrl: `${req.nextUrl.origin}/share/${project.shareToken}`,
      shareToken: project.shareToken,
      expiresAt: project.shareExpiresAt,
    });
  }
  if ((match = m(/^api\/projects\/([^/]+)\/regions$/)) && method === "PUT") {
    const project = ownProject(ctx, match[1]!);
    if (!project) return err(404, "Project not found.");
    return updateRegions(ctx, project);
  }
  if ((match = m(/^api\/projects\/([^/]+)\/regions\/custom-mask$/)) && method === "POST") {
    const project = ownProject(ctx, match[1]!);
    if (!project) return err(404, "Project not found.");
    return createCustomMask(ctx, project);
  }
  if ((match = m(/^api\/projects\/([^/]+)$/)) && method === "GET") {
    const project = ownProject(ctx, match[1]!);
    if (!project) return err(404, "Project not found.");
    const detail = toProjectDetail(project);
    return json(ownerId === GUEST_OWNER ? maskShadeCodes(detail) : detail);
  }

  // --- Billing ---
  if (path === "api/billing/subscriptions/current" && method === "GET") {
    const sub = user ? subscriptionFor(user) : null;
    return sub ? json(sub) : err(404, "No subscription.");
  }
  if (path === "api/billing/project-credit/order" && method === "POST") {
    return json({ orderId: nextId("order_mock"), amount: 9900, currency: "INR", razorpayKeyId: "rzp_test_mock" });
  }
  if (path === "api/billing/project-credit/verify" && method === "POST") {
    if (!user) return err(403, "Guests cannot buy credits.");
    const ent = store().entitlements.get(user.id);
    if (!ent) return err(404, "No entitlement.");
    ent.projectAllowance += 1;
    ent.projectsRemaining += 1;
    ent.updatedAt = new Date().toISOString();
    return json(ent);
  }

  // --- Customer entitlement ---
  if (path === "api/me/entitlement" && method === "GET") {
    return json(user ? (store().entitlements.get(user.id) ?? null) : null);
  }

  // --- Paint catalogue (brands / lines) ---
  if (path === "api/paint/brands" && method === "GET") return json(store().brands);
  if (path === "api/paint/brands" && method === "POST") {
    const body = await readJson(req);
    const name = String(body.name ?? "").trim();
    if (!name) return err(400, "Brand name is required.");
    const brand = { id: nextNum(), name, slug: name.toLowerCase().replace(/\s+/g, "-") };
    store().brands.push(brand);
    store().lines.set(brand.id, []);
    return json(brand);
  }
  if ((match = m(/^api\/paint\/brands\/(\d+)\/lines$/))) {
    const brandId = Number(match[1]);
    const lines = store().lines.get(brandId) ?? [];
    if (method === "GET") {
      const category = req.nextUrl.searchParams.get("category");
      return json(category ? lines.filter((l) => l.category === category) : lines);
    }
    if (method === "POST") {
      const body = await readJson(req);
      const line: PaintLine = {
        id: nextNum(),
        name: String(body.name ?? "New line"),
        category: (body.category === "EXTERIOR" ? "EXTERIOR" : "INTERIOR") as ProductCategory,
        qualityTier: (["ECONOMY", "PREMIUM", "LUXURY"].includes(String(body.qualityTier))
          ? body.qualityTier
          : "PREMIUM") as PaintLine["qualityTier"],
        defaultFinish: typeof body.defaultFinish === "string" ? body.defaultFinish : null,
      };
      lines.push(line);
      store().lines.set(brandId, lines);
      return json(line);
    }
  }

  // --- Organizations, shop products, access codes, customers ---
  if (path === "api/organizations/mine" && method === "GET") {
    return json([...store().orgs.values()].filter((o) => o.ownerUserId === ownerId || user?.role === "ADMIN"));
  }
  if (path === "api/organizations" && method === "POST") {
    const body = await readJson(req);
    const org = {
      id: nextId("org"),
      name: String(body.name ?? "My shop"),
      slug: String(body.slug ?? "my-shop"),
      type: (body.type === "DISTRIBUTOR" ? "DISTRIBUTOR" : "RETAILER") as "RETAILER" | "DISTRIBUTOR",
      ownerUserId: ownerId,
      ownerName: user?.name,
    };
    store().orgs.set(org.id, org);
    return json(org);
  }
  if ((match = m(/^api\/organizations\/([^/]+)\/products$/))) {
    const orgId = match[1]!;
    const products = store().products.get(orgId) ?? [];
    if (method === "GET") return json(products);
    if (method === "POST") {
      const body = await readJson(req);
      const lineId = Number(body.lineId);
      let lineName: string | null = null;
      let brandName: string | null = null;
      let category: ProductCategory | null = null;
      for (const [brandId, lines] of store().lines) {
        const line = lines.find((l) => l.id === lineId);
        if (line) {
          lineName = line.name;
          category = line.category;
          brandName = store().brands.find((b) => b.id === brandId)?.name ?? null;
          break;
        }
      }
      const product: ShopProduct = {
        id: nextId("prod"),
        lineId,
        brandName,
        lineName,
        category,
        price: typeof body.price === "number" ? body.price : null,
        priceUnit: typeof body.priceUnit === "string" ? body.priceUnit : null,
        packSize: typeof body.packSize === "string" ? body.packSize : null,
        coverage: typeof body.coverage === "string" ? body.coverage : null,
        finish: typeof body.finish === "string" ? body.finish : null,
        qualityTier: (["ECONOMY", "PREMIUM", "LUXURY"].includes(String(body.qualityTier))
          ? body.qualityTier
          : null) as ShopProduct["qualityTier"],
        brightness: typeof body.brightness === "number" ? body.brightness : null,
        imageUrl: typeof body.imageUrl === "string" ? body.imageUrl : null,
        features: typeof body.features === "string" ? body.features : null,
        description: typeof body.description === "string" ? body.description : null,
        createdAt: new Date().toISOString(),
      };
      products.push(product);
      store().products.set(orgId, products);
      return json(product);
    }
  }
  if ((match = m(/^api\/organizations\/([^/]+)\/products\/([^/]+)$/)) && method === "DELETE") {
    const products = store().products.get(match[1]!) ?? [];
    store().products.set(match[1]!, products.filter((p) => p.id !== match![2]));
    return new NextResponse(null, { status: 204 });
  }
  if ((match = m(/^api\/organizations\/([^/]+)\/access-codes$/))) {
    const orgId = match[1]!;
    if (method === "GET") return json(store().accessCodes.filter((c) => c.organizationId === orgId));
    if (method === "POST") {
      const body = await readJson(req);
      const validDays = Math.max(1, Number(body.validDays ?? 7));
      const code: AccessCode = {
        id: nextId("code"),
        code: `HV-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
        organizationId: orgId,
        organizationName: store().orgs.get(orgId)?.name,
        validDays,
        expiresAt: new Date(Date.now() + validDays * 86_400_000).toISOString(),
        used: false,
        expired: false,
        usedAt: null,
        createdAt: new Date().toISOString(),
      };
      store().accessCodes.unshift(code);
      return json(code);
    }
  }
  if ((match = m(/^api\/organizations\/([^/]+)\/customers$/)) && method === "GET") {
    const orgId = match[1]!;
    return json([...store().entitlements.values()].filter((e) => e.retailerOrgId === orgId));
  }
  if ((match = m(/^api\/organizations\/([^/]+)\/customers\/([^/]+)\/grant-project$/)) && method === "POST") {
    const ent = store().entitlements.get(match[2]!);
    if (!ent) return err(404, "Customer not found.");
    ent.projectAllowance += 1;
    ent.projectsRemaining += 1;
    ent.updatedAt = new Date().toISOString();
    return json(ent);
  }

  // --- Access-code redemption by a signed-in account ---
  if (path === "api/access-codes/redeem" && method === "POST") {
    if (!user) return err(403, "Sign in first.");
    const body = await readJson(req);
    const value = String(body.code ?? "").trim().toUpperCase();
    const code = store().accessCodes.find((c) => c.code.toUpperCase() === value);
    if (!code) return err(404, "Code not found.");
    if (code.used) return err(409, "Code already used.");
    code.used = true;
    code.usedAt = new Date().toISOString();
    user.role = "CUSTOMER";
    if (!store().entitlements.has(user.id)) {
      const ent: CustomerEntitlement = {
        customerId: user.id,
        customerName: user.name,
        customerEmail: user.email,
        retailerOrgId: code.organizationId,
        accessExpiresAt: code.expiresAt,
        expired: false,
        projectAllowance: 1,
        projectsCreated: 0,
        projectsRemaining: 1,
        updatedAt: new Date().toISOString(),
      };
      store().entitlements.set(user.id, ent);
    }
    return json(code);
  }

  // --- Support (user-side) ---
  if (path === "api/support/conversations" && method === "POST") {
    if (!user) return err(403, "Sign in first.");
    const body = await readJson(req);
    const message = String(body.message ?? "").trim();
    if (!message) return err(400, "Say something first.");
    const now = new Date().toISOString();
    const thread = {
      id: nextId("sup"),
      ownerId: user.id,
      channel: "IN_APP" as const,
      status: "OPEN" as const,
      subject: typeof body.subject === "string" ? body.subject : null,
      createdAt: now,
      updatedAt: now,
      messages: [
        { id: nextId("m"), sender: "USER" as const, body: message, createdAt: now },
        { id: nextId("m"), sender: "AI" as const, body: cannedAiReply(message), createdAt: now },
      ],
    };
    store().support.set(thread.id, thread);
    return json(toConversation(thread));
  }
  if (path === "api/support/conversations" && method === "GET") {
    return json(
      [...store().support.values()].filter((t) => t.ownerId === ownerId).map(toConversationSummary),
    );
  }
  if ((match = m(/^api\/support\/conversations\/([^/]+)\/messages$/)) && method === "POST") {
    const thread = store().support.get(match[1]!);
    if (!thread || thread.ownerId !== ownerId) return err(404, "Conversation not found.");
    const body = await readJson(req);
    const text = String(body.body ?? "").trim();
    const now = new Date().toISOString();
    thread.messages.push({ id: nextId("m"), sender: "USER", body: text, createdAt: now });
    if (thread.status === "OPEN") {
      thread.messages.push({ id: nextId("m"), sender: "AI", body: cannedAiReply(text), createdAt: now });
    }
    thread.updatedAt = now;
    return json(toConversation(thread));
  }
  if ((match = m(/^api\/support\/conversations\/([^/]+)\/request-human$/)) && method === "POST") {
    const thread = store().support.get(match[1]!);
    if (!thread || thread.ownerId !== ownerId) return err(404, "Conversation not found.");
    const now = new Date().toISOString();
    thread.status = "NEEDS_HUMAN";
    thread.messages.push({ id: nextId("m"), sender: "SYSTEM", body: "Conversation escalated to human support.", createdAt: now });
    thread.updatedAt = now;
    return json(toConversation(thread));
  }
  if ((match = m(/^api\/support\/conversations\/([^/]+)$/)) && method === "GET") {
    const thread = store().support.get(match[1]!);
    if (!thread || thread.ownerId !== ownerId) return err(404, "Conversation not found.");
    return json(toConversation(thread));
  }

  // --- Support inbox (ADMIN) ---
  if (path.startsWith("api/support/inbox")) {
    if (user?.role !== "ADMIN") return err(403, "Staff only.");
    if (path === "api/support/inbox" && method === "GET") {
      return json(
        [...store().support.values()]
          .filter((t) => t.status === "NEEDS_HUMAN")
          .map(toConversationSummary),
      );
    }
    if ((match = m(/^api\/support\/inbox\/([^/]+)\/reply$/)) && method === "POST") {
      const thread = store().support.get(match[1]!);
      if (!thread) return err(404, "Conversation not found.");
      const body = await readJson(req);
      const now = new Date().toISOString();
      thread.messages.push({ id: nextId("m"), sender: "AGENT", body: String(body.body ?? ""), createdAt: now });
      thread.updatedAt = now;
      return json(toConversation(thread));
    }
    if ((match = m(/^api\/support\/inbox\/([^/]+)\/resolve$/)) && method === "POST") {
      const thread = store().support.get(match[1]!);
      if (!thread) return err(404, "Conversation not found.");
      thread.status = "RESOLVED";
      thread.updatedAt = new Date().toISOString();
      return json(toConversation(thread));
    }
    if ((match = m(/^api\/support\/inbox\/([^/]+)$/)) && method === "GET") {
      const thread = store().support.get(match[1]!);
      if (!thread) return err(404, "Conversation not found.");
      return json(toConversation(thread));
    }
  }

  return err(404, `Mock mode: no handler for ${method} /${path}.`);
}
