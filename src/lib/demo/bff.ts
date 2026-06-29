/**
 * DEMO_MODE handler for the BFF boundary (/bff/api/*). The BFF route calls this
 * instead of proxying to the backend; it answers every client `api.*` call from
 * the in-memory store so the offline app is fully interactive. Writes mutate the
 * store, so the next read reflects them.
 */
import { NextResponse, type NextRequest } from "next/server";
import type {
  AccessCode,
  CustomerEntitlement,
  PaintBrand,
  PaintLine,
  ProductCategory,
  ProjectCreditOrder,
  ProjectDetail,
  QualityTier,
  RegionColorUpdate,
  RegionDetail,
  ShareLink,
  ShopProduct,
  SupportConversation,
  SupportMessage,
  UploadedImage,
  VerificationStatus,
} from "../types";
import { demoUserFromToken } from "./accounts";
import { DEMO_UPLOAD_IMAGE_URL, demoLinesFor, toSummary } from "./data";
import { getStore, nextId, nextSeq, retailerOrg } from "./store";

function json(data: unknown, status = 200): NextResponse {
  if (data === undefined) return new NextResponse(null, { status: status === 200 ? 204 : status });
  return NextResponse.json(data as object, { status });
}

function nowIso(): string {
  return new Date().toISOString();
}

async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) return {};
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

const verificationStatus = (channel: "EMAIL" | "PHONE", destination: string): VerificationStatus => ({
  channel,
  destination,
  expiresInSeconds: 600,
  cooldownSeconds: 30,
});

/** New projects come back fully SEGMENTED with three blank regions; imageUrl is
 *  blank so the visualizer keeps the user's just-uploaded photo on the canvas
 *  (loading a demo URL there would replace it). Walls are marked with the
 *  client-side Mask Studio, which recolours live without a backend. */
function freshProject(name: string | undefined, roomType: string | undefined, imageId: string): ProjectDetail {
  const id = nextId("prj");
  const project: ProjectDetail = {
    id,
    name: name?.trim() || "Untitled project",
    roomType: roomType ?? null,
    notes: null,
    status: "SEGMENTED",
    imageId,
    imageUrl: DEMO_UPLOAD_IMAGE_URL,
    cleanedImageUrl: null,
    failureReason: null,
    hasShareLink: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    regions: [
      { id: nextSeq(), label: "Main wall", category: "MAIN_WALL", maskUrl: null, appliedShadeCode: null, appliedHexCode: null, displayOrder: 0 },
      { id: nextSeq(), label: "Accent wall", category: "ACCENT_WALL", maskUrl: null, appliedShadeCode: null, appliedHexCode: null, displayOrder: 1 },
      { id: nextSeq(), label: "Trim", category: "TRIM", maskUrl: null, appliedShadeCode: null, appliedHexCode: null, displayOrder: 2 },
    ],
  };
  getStore().projects.unshift(project);
  return project;
}

/** During creation we return a blank imageUrl so the live upload stays on canvas. */
function liveResponse(p: ProjectDetail): ProjectDetail {
  return { ...p, imageUrl: "" };
}

function aiReply(text: string): SupportMessage {
  return { id: nextId("m"), sender: "AI", body: text, createdAt: nowIso() };
}

/**
 * @param joined backend path, e.g. "api/projects/prj_x/status" (no /bff prefix)
 */
export async function demoBff(req: NextRequest, joined: string, token: string | null): Promise<NextResponse> {
  const method = req.method.toUpperCase();
  const store = getStore();
  const user = demoUserFromToken(token);
  // Guest endpoints share the same fixtures (single demo tenant).
  const path = joined.replace(/^api\/guest\//, "api/").replace(/\/+$/, "");
  const seg = path.split("/");

  // ---------- Images ----------
  if (path === "api/images" && method === "GET") return json([] as UploadedImage[]);
  if (path === "api/images/upload" && method === "POST") {
    const img: UploadedImage = {
      imageId: nextId("img"),
      imageUrl: DEMO_UPLOAD_IMAGE_URL,
      originalFilename: "photo.jpg",
      imageType: "INDOOR",
      fileSize: 1_280_000,
      uploadedAt: nowIso(),
    };
    return json(img);
  }
  if (seg[0] === "api" && seg[1] === "images" && seg.length === 3 && method === "GET") {
    return json({ imageId: seg[2], imageUrl: DEMO_UPLOAD_IMAGE_URL, originalFilename: "photo.jpg", imageType: "INDOOR", fileSize: 1_280_000, uploadedAt: nowIso() } as UploadedImage);
  }

  // ---------- Auth (via BFF) + verification OTP ----------
  if (path === "api/auth/profile" && method === "GET") return json(user);
  if (path === "api/auth/verify/email/send" && method === "POST") {
    return json(verificationStatus("EMAIL", maskEmail(user.email)));
  }
  if (path === "api/auth/verify/email/confirm" && method === "POST") {
    return json({ ...user, emailVerified: true });
  }
  if (path === "api/auth/verify/phone/send" && method === "POST") {
    const body = await readJson(req);
    const phone = String(body.phoneNumber ?? user.phoneNumber ?? "+91 90000 00000");
    return json(verificationStatus("PHONE", maskPhone(phone)));
  }
  if (path === "api/auth/verify/phone/confirm" && method === "POST") {
    return json({ ...user, phoneVerified: true });
  }

  // ---------- Projects ----------
  if (path === "api/projects" && method === "GET") {
    return json(store.projects.map(toSummary));
  }
  if (path === "api/projects" && method === "POST") {
    const body = await readJson(req);
    const p = freshProject(body.name as string | undefined, body.roomType as string | undefined, (body.imageId as string) ?? nextId("img"));
    return json(liveResponse(p));
  }
  if (seg[0] === "api" && seg[1] === "projects" && seg.length >= 3) {
    const id = seg[2];
    const project = store.projects.find((p) => p.id === id) ?? store.projects[0];
    if (!project) return json({ message: "No project." }, 404);
    const tail = seg.slice(3).join("/");

    if (tail === "segment" && method === "POST") {
      project.status = "SEGMENTED";
      project.updatedAt = nowIso();
      return json(liveResponse(project));
    }
    if (tail === "status" && method === "GET") {
      return json(liveResponse({ ...project, status: "SEGMENTED" }));
    }
    if (tail === "share" && method === "POST") {
      const tokenStr = nextId("shr");
      if (project) { project.hasShareLink = true; project.shareExpiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString(); }
      const link: ShareLink = { shareUrl: `/share/${tokenStr}`, shareToken: tokenStr, expiresAt: project?.shareExpiresAt ?? null };
      return json(link);
    }
    if (tail === "regions" && method === "PUT") {
      const updates = (await readJson(req)) as unknown as RegionColorUpdate[];
      if (project && Array.isArray(updates)) {
        for (const u of updates) {
          const r = project.regions.find((x) => x.id === u.regionId);
          if (r) { r.appliedShadeCode = u.shadeCode ?? null; r.appliedHexCode = u.hexCode ?? null; }
        }
        project.updatedAt = nowIso();
      }
      return json(project);
    }
    if (tail === "regions/custom-mask" && method === "POST") {
      const body = await readJson(req);
      const region: RegionDetail = {
        id: nextSeq(),
        label: (body.label as string) || "Wall",
        category: ((body.category as RegionDetail["category"]) ?? "MANUAL"),
        maskUrl: null,
        maskData: null,
        appliedShadeCode: null,
        appliedHexCode: null,
        displayOrder: project ? project.regions.length : 0,
        manual: true, // hand-drawn — deletable, survives reload
      };
      if (project) project.regions.push(region);
      return json(region);
    }
    // Delete a hand-drawn wall (only manual regions; AI walls are protected).
    if (seg[3] === "regions" && seg.length === 5 && method === "DELETE") {
      const regionId = Number(seg[4]);
      if (project) {
        const r = project.regions.find((x) => x.id === regionId);
        if (!r) return json({ message: "Region not found." }, 404);
        if (!r.manual) return json({ message: "Only hand-drawn walls can be deleted." }, 400);
        project.regions = project.regions.filter((x) => x.id !== regionId);
        project.updatedAt = nowIso();
      }
      return json(undefined); // 204 No Content
    }
    if (seg.length === 3 && method === "GET") {
      // Open existing project (never 404 — fall back so /atelier?project=x works).
      return json(project);
    }
  }

  // ---------- Billing ----------
  if (path === "api/billing/subscriptions/current" && method === "GET") {
    if (user.role === "CUSTOMER") return json({ message: "No subscription." }, 404);
    return json(store.subscription);
  }
  if (path === "api/me/entitlement" && method === "GET") {
    return user.role === "CUSTOMER" ? json(store.entitlement) : json(undefined);
  }
  if (path === "api/billing/project-credit/order" && method === "POST") {
    const order: ProjectCreditOrder = { orderId: nextId("order"), amount: 9900, currency: "INR", razorpayKeyId: "rzp_test_demo" };
    return json(order);
  }
  if (path === "api/billing/project-credit/verify" && method === "POST") {
    store.entitlement.projectAllowance += 1;
    store.entitlement.projectsRemaining += 1;
    return json(store.entitlement);
  }

  // ---------- Paint catalogue (shop-managed) ----------
  if (path === "api/paint/brands" && method === "GET") return json(store.brands);
  if (path === "api/paint/brands" && method === "POST") {
    const body = await readJson(req);
    const name = String(body.name ?? "New brand").trim();
    const brand: PaintBrand = { id: nextSeq(), name, slug: slugify(name) };
    store.brands.push(brand);
    return json(brand);
  }
  if (seg[0] === "api" && seg[1] === "paint" && seg[2] === "brands" && seg[4] === "lines") {
    const brandId = Number(seg[3]);
    if (method === "GET") {
      const category = (req.nextUrl.searchParams.get("category") as ProductCategory) ?? "INTERIOR";
      const seeded = demoLinesFor(brandId, category);
      const added = (store.lines[`${brandId}:${category}`] ?? []).filter((l) => !seeded.includes(l));
      return json([...seeded, ...added]);
    }
    if (method === "POST") {
      const body = await readJson(req);
      const category = (body.category as ProductCategory) ?? "INTERIOR";
      const line: PaintLine = {
        id: nextSeq(),
        name: String(body.name ?? "New line"),
        category,
        qualityTier: (body.qualityTier as QualityTier) ?? "PREMIUM",
        defaultFinish: (body.defaultFinish as string) ?? null,
      };
      const key = `${brandId}:${category}`;
      store.lines[key] = [...(store.lines[key] ?? []), line];
      return json(line);
    }
  }

  // ---------- Organizations / products / codes / customers ----------
  if (path === "api/organizations/mine" && method === "GET") return json(store.orgs);
  if (path === "api/organizations" && method === "POST") {
    const body = await readJson(req);
    const org = { id: nextId("org"), name: String(body.name ?? "My shop"), slug: String(body.slug ?? slugify(String(body.name ?? "shop"))), type: (body.type as "RETAILER" | "DISTRIBUTOR") ?? "RETAILER", ownerUserId: user.id, ownerName: user.name };
    store.orgs.push(org);
    return json(org);
  }
  if (seg[0] === "api" && seg[1] === "organizations" && seg.length >= 4) {
    const tail = seg.slice(3).join("/");
    if (tail === "products" && method === "GET") return json(store.products);
    if (tail === "products" && method === "POST") {
      const body = await readJson(req);
      const line = Object.values(store.lines).flat().find((l) => l.id === Number(body.lineId));
      const brand = store.brands.find((b) => store.lines[`${b.id}:INTERIOR`]?.some((l) => l.id === Number(body.lineId)) || store.lines[`${b.id}:EXTERIOR`]?.some((l) => l.id === Number(body.lineId)));
      const product: ShopProduct = {
        id: nextId("prod"),
        lineId: Number(body.lineId),
        brandName: brand?.name ?? null,
        lineName: line?.name ?? null,
        category: line?.category ?? null,
        price: body.price != null ? Number(body.price) : null,
        priceUnit: (body.priceUnit as string) ?? null,
        packSize: (body.packSize as string) ?? null,
        coverage: (body.coverage as string) ?? null,
        finish: (body.finish as string) ?? null,
        qualityTier: (body.qualityTier as QualityTier) ?? null,
        brightness: body.brightness != null ? Number(body.brightness) : null,
        imageUrl: (body.imageUrl as string) ?? null,
        features: (body.features as string) ?? null,
        description: (body.description as string) ?? null,
        createdAt: nowIso(),
      };
      store.products.unshift(product);
      return json(product);
    }
    if (seg[3] === "products" && seg.length === 5 && method === "DELETE") {
      store.products = store.products.filter((p) => p.id !== seg[4]);
      return json(undefined);
    }
    if (tail === "access-codes" && method === "GET") return json(store.accessCodes);
    if (tail === "access-codes" && method === "POST") {
      const body = await readJson(req);
      const validDays = Number(body.validDays ?? 7);
      const code: AccessCode = {
        id: nextId("ac"),
        code: `MEHTA${Math.floor(1000 + (nextSeq() % 9000))}`,
        organizationId: seg[2] ?? "org_demo",
        organizationName: retailerOrg()?.name ?? "Mehta Paints",
        validDays,
        expiresAt: new Date(Date.now() + validDays * 86_400_000).toISOString(),
        used: false,
        expired: false,
        allowedBrands: Array.isArray(body.allowedBrands) ? (body.allowedBrands as string[]) : undefined,
        createdAt: nowIso(),
      };
      store.accessCodes.unshift(code);
      return json(code);
    }
    if (tail === "customers" && method === "GET") return json(store.customers);
    if (seg[3] === "customers" && seg[5] === "grant-project" && method === "POST") {
      const c = store.customers.find((x) => x.customerId === seg[4]);
      if (c) { c.projectAllowance += 1; c.projectsRemaining += 1; c.updatedAt = nowIso(); }
      return json(c ?? store.customers[0]);
    }
  }

  // ---------- Access codes (customer self-redeem) ----------
  if (path === "api/access-codes/redeem" && method === "POST") {
    const body = await readJson(req);
    const want = String(body.code ?? "").trim().toUpperCase();
    const match = store.accessCodes.find((c) => c.code.toUpperCase() === want);
    if (!match) return json({ message: "That code wasn't found." }, 404);
    if (match.used) return json({ message: "That code has already been used." }, 409);
    return json({ ...match, used: true, usedAt: nowIso() });
  }

  // ---------- Support ----------
  if (path === "api/support/conversations" && method === "GET") {
    return json(store.conversations.map(summariseConvo));
  }
  if (path === "api/support/conversations" && method === "POST") {
    const body = await readJson(req);
    const convo: SupportConversation = {
      id: nextId("conv"),
      channel: "IN_APP",
      status: "OPEN",
      subject: (body.subject as string) ?? "Support",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      messages: [
        { id: nextId("m"), sender: "USER", body: String(body.message ?? ""), createdAt: nowIso() },
        aiReply("Thanks for reaching out! I'm the HueVista assistant — how can I help with your project today?"),
      ],
    };
    store.conversations.unshift(convo);
    return json(convo);
  }
  if (seg[0] === "api" && seg[1] === "support" && (seg[2] === "conversations" || seg[2] === "inbox") && seg.length >= 4) {
    const id = seg[3];
    const convo = store.conversations.find((c) => c.id === id) ?? store.conversations[0];
    if (!convo) return json({ message: "No conversation." }, 404);
    const tail = seg.slice(4).join("/");
    if (!tail && method === "GET") return json(convo);
    if (tail === "messages" && method === "POST") {
      const body = await readJson(req);
      convo.messages.push({ id: nextId("m"), sender: "USER", body: String(body.body ?? ""), createdAt: nowIso() });
      convo.messages.push(aiReply("Got it — I've noted that. A teammate from the shop can take over if you'd like; just tap \"Talk to a person\"."));
      convo.updatedAt = nowIso();
      return json(convo);
    }
    if (tail === "request-human" && method === "POST") {
      convo.status = "NEEDS_HUMAN";
      convo.messages.push({ id: nextId("m"), sender: "SYSTEM", body: "Connected to the HueVista team.", createdAt: nowIso() });
      convo.updatedAt = nowIso();
      return json(convo);
    }
    if (tail === "reply" && method === "POST") {
      const body = await readJson(req);
      convo.messages.push({ id: nextId("m"), sender: "AGENT", body: String(body.body ?? ""), createdAt: nowIso() });
      convo.updatedAt = nowIso();
      return json(convo);
    }
    if (tail === "resolve" && method === "POST") {
      convo.status = "RESOLVED";
      convo.updatedAt = nowIso();
      return json(convo);
    }
  }
  if (path === "api/support/inbox" && method === "GET") return json(store.inbox);

  return json({ message: `Demo: no fixture for ${method} ${joined}` }, 404);
}

// --- helpers ---
function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "shop";
}
function maskEmail(email: string): string {
  const [u, d] = email.split("@");
  return `${u?.[0] ?? ""}***@${d ?? "example.in"}`;
}
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `******${digits.slice(-3)}`;
}
function summariseConvo(c: SupportConversation) {
  const last = c.messages[c.messages.length - 1];
  return {
    id: c.id,
    channel: c.channel,
    status: c.status,
    subject: c.subject ?? null,
    lastMessage: last?.body ?? null,
    updatedAt: c.updatedAt ?? null,
  };
}
