/**
 * DEMO_MODE handler for the BFF boundary (/bff/api/*). The BFF route calls this
 * instead of proxying to the backend; it answers every client `api.*` call from
 * the in-memory store so the offline app is fully interactive. Writes mutate the
 * store, so the next read reflects them.
 */
import { NextResponse, type NextRequest } from "next/server";
import type {
  AccessCode,
  ComboScope,
  ComboShade,
  PaintBrand,
  PaintLine,
  ProductCategory,
  MyRender,
  ProjectCombo,
  ProjectDetail,
  ProjectRender,
  QualityTier,
  RenderOptions,
  RenderQuality,
  RegionColorUpdate,
  RegionDetail,
  ShareLink,
  ShopProduct,
  StoreLink,
  SubscriptionSummary,
  SupportConversation,
  SupportMessage,
  UploadedImage,
  VerificationStatus,
} from "../types";
import { SHADES } from "../shades";
import { isUnlimited } from "../plan-quota";
import { demoUserFromToken } from "./accounts";
import { DEMO_PLANS, DEMO_UPLOAD_IMAGE_URL, demoLinesFor, toSummary } from "./data";
import { getStore, nextId, nextSeq, nextUuid, retailerOrg } from "./store";

function json(data: unknown, status = 200): NextResponse {
  if (data === undefined) return new NextResponse(null, { status: status === 200 ? 204 : status });
  return NextResponse.json(data as object, { status });
}

function nowIso(): string {
  return new Date().toISOString();
}

/** An ISO timestamp `days` from now — negative for the past. See ./data on why the
 *  demo dates every fixture relative to the moment it is run. */
function inDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
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

// Point prices the demo quotes. Mirrors the server defaults — flat, and the same
// whatever the plan is doing.
// The no-plan rate, on both rails. The demo BFF doesn't model the per-tier discount —
// it exists to exercise the screens, not the pricing table.
const POINTS_PROJECT = 80;
const PROJECT_PRICE_PAISE = 19900;
const POINTS_REOPEN = 9;
const REOPEN_PRICE_PAISE = 900;
const PROJECT_VALID_DAYS = 30;
/** A shop-issued code is always good for 10 days, and an extension resets it to 10. */
const ACCESS_CODE_VALID_DAYS = 10;

/**
 * @param role who is asking — points are a shop currency, so only a RETAILER is offered
 *   that rail. Mirrors the backend, which refuses every other role outright.
 */
function projectPurchaseOptions(role: string): import("../types").ProjectPurchaseOptions {
  const store = getStore();
  const subscribed = store.subscription.status === "ACTIVE" && !store.subscription.trial;
  return {
    subscribed,
    pricingPlan: subscribed ? store.subscription.plan : "FREE",
    projectPricePoints: POINTS_PROJECT,
    projectPricePaise: PROJECT_PRICE_PAISE,
    reopenPricePoints: POINTS_REOPEN,
    reopenPricePaise: REOPEN_PRICE_PAISE,
    pointsBalance: store.wallet.pointsBalance,
    pointsEligible: role === "RETAILER",
    validDays: PROJECT_VALID_DAYS,
    availableCredits: store.projectCredits,
  };
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
function freshProject(
  name: string | undefined,
  roomType: string | undefined,
  imageId: string,
  ownerId: string,
  accessCodeId?: string | null,
): ProjectDetail {
  // A UUID, not a prj_N — /studio validates ?project= against one before it will
  // open a room, so a readable id here is a room the dashboard lists and cannot open.
  const id = nextUuid();
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
  const store = getStore();
  store.projects.unshift(project);
  // Owned by whoever asked for it, so it shows on their dashboard and nobody else's.
  store.projectOwners[id] = { ownerId, accessCodeId: accessCodeId ?? null };
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
  // Email only. The demo mirrors what the app offers, and the app stopped
  // offering SMS codes when it became clear nothing could send one.
  if (path === "api/auth/profile" && method === "GET") return json(user);
  if (path === "api/auth/verify/email/send" && method === "POST") {
    return json(verificationStatus("EMAIL", maskEmail(user.email ?? "")));
  }
  if (path === "api/auth/verify/email/confirm" && method === "POST") {
    return json({ ...user, emailVerified: true });
  }

  // ---------- Projects ----------
  if (path === "api/projects" && method === "GET") {
    return json(visibleProjects(user).map((p) => summaryFor(p, user)));
  }
  if (path === "api/projects" && method === "POST") {
    const body = await readJson(req);
    const p = freshProject(
      body.name as string | undefined,
      body.roomType as string | undefined,
      (body.imageId as string) ?? nextId("img"),
      user.id,
      // A customer's room is made on the code their shop issued, which is what puts it
      // on the shop's "Customer rooms" shelf without making it the shop's to edit.
      user.role === "CUSTOMER" ? (store.accessCodes.find((c) => c.used)?.id ?? null) : null,
    );
    /**
     * Spend the allowance the room costs.
     *
     * The counter used to sit still: a demo could create twenty rooms and the plan
     * chip read "12 of 45" throughout, so the dashboard contradicted itself within one
     * screen ("Projects saved 5" beside "12 of 45 used") and the whole running-out
     * story — the nudge, the extra-project purchase, the read-only fallback — could
     * not be reached at all. A CUSTOMER spends their shop entitlement instead, which
     * is the same rule the backend applies.
     */
    if (user.role === "CUSTOMER") {
      store.entitlement.projectsCreated += 1;
      store.entitlement.projectsRemaining = Math.max(0, store.entitlement.projectsRemaining - 1);
    } else {
      store.subscription.projectsUsed += 1;
      store.subscription.projectsRemaining = Math.max(0, (store.subscription.projectsRemaining ?? 0) - 1);
    }
    return json(liveResponse(p));
  }
  if (seg[0] === "api" && seg[1] === "projects" && seg.length >= 3) {
    const id = seg[2];
    // Scoped, and the never-404 fallback with it: it used to reach for
    // store.projects[0], which handed a customer the shop's first room whenever an id
    // did not match. Falling back within the caller's OWN shelf keeps the demo
    // forgiving about a stale link without showing anyone somebody else's room.
    const mine = visibleProjects(user);
    const project = mine.find((p) => p.id === id) ?? mine[0];
    if (!project) return json({ message: "No project." }, 404);
    const tail = seg.slice(3).join("/");

    if (!tail && method === "PATCH") {
      // Partial update (rename etc.) — only provided fields change.
      const body = await readJson(req);
      if (typeof body.name === "string" && body.name.trim()) project.name = body.name.trim();
      if (typeof body.roomType === "string") project.roomType = body.roomType.trim() || null;
      if (typeof body.notes === "string") project.notes = body.notes.trim() || null;
      project.updatedAt = nowIso();
      return json(liveResponse(project));
    }
    if (tail === "segment" && method === "POST") {
      project.status = "SEGMENTED";
      project.updatedAt = nowIso();
      return json(liveResponse(project));
    }
    if (tail === "send-to-shop" && method === "POST") {
      // Guest "I'm done" — idempotent stamp, like the backend.
      if (!project.sentToShopAt) project.sentToShopAt = nowIso();
      return json(liveResponse(project));
    }
    if (tail === "recommendations" && method === "POST") {
      // Canned Claude palettes so the AI panel is demoable offline.
      const shade = (id: number, code: string, name: string, hex: string) =>
        ({ id, shadeCode: code, name, hexCode: hex, brand: "Sample palette", deltaE: 1.2 });
      return json({
        projectId: project.id,
        imageType: "INDOOR",
        combinations: [
          { name: "Morning Chai", rationale: "Warm neutrals that keep the room bright while the trim grounds it.",
            primaryHex: "#d9c7ae", primaryShade: shade(101, "HV-8477", "Morning Fog", "#d9c7ae"),
            accentHex: "#a9714b", accentShade: shade(102, "HV-8542", "Terracotta Ray", "#a9714b"),
            trimHex: "#4a3527", trimShade: shade(103, "HV-8318", "Deep Walnut", "#4a3527") },
          { name: "Monsoon Sky", rationale: "A cool, calming pairing that flatters the daylight in the photo.",
            primaryHex: "#c9d4d9", primaryShade: shade(104, "HV-9123", "Silver Drizzle", "#c9d4d9"),
            accentHex: "#476a7a", accentShade: shade(105, "HV-9188", "Harbour Blue", "#476a7a"),
            trimHex: "#f2efe8", trimShade: shade(106, "HV-9001", "Ivory Lace", "#f2efe8") },
          { name: "Haldi Glow", rationale: "A confident accent wall with soft companions for the other surfaces.",
            primaryHex: "#efe6d4", primaryShade: shade(107, "HV-7719", "Cream Silk", "#efe6d4"),
            accentHex: "#d99a2b", accentShade: shade(108, "HV-7788", "Turmeric Gold", "#d99a2b"),
            trimHex: "#6d5a3f", trimShade: shade(109, "HV-7645", "Aged Brass", "#6d5a3f") },
        ],
      });
    }
    /**
     * The colour boards this room handed over — the fixed set an AI image may be made
     * from. Derived rather than stored, because the demo has no board-building step:
     * whatever colours are on the walls right now ARE the board the customer took away.
     */
    if (tail === "combos" && method === "GET") {
      return json(projectCombos(project));
    }
    /**
     * Close the room. The studio's last step, and the gate in front of the render page:
     * an open room is reached from the studio it is open in.
     */
    if (tail === "close" && method === "POST") {
      if (!project.closedAt) project.closedAt = nowIso();
      project.updatedAt = nowIso();
      return json(project);
    }
    // ---------- AI renders ----------
    if (tail === "renders" && method === "GET") {
      return json(settleRenders(project.id));
    }
    /**
     * Ask for one AI image of this room.
     *
     * The real backend accepts immediately as QUEUED, debits a credit, and the studio
     * polls until READY or FAILED. The demo keeps that shape rather than answering READY
     * on the spot — the waiting screen, the poll loop and the credit arithmetic are a
     * third of what this flow IS, and a fixture that skips to the answer demos none of
     * it. {@link settleRenders} is what finishes the job, on the next poll.
     *
     * The picture itself is the room's own photograph. A demo cannot make a real one and
     * should not pretend to: what it can show honestly is every step around it.
     */
    if (tail === "renders" && method === "POST") {
      /**
       * Only the owner may photograph a room.
       *
       * The picker already leaves a customer's room out of a shop's list, but the
       * render page is reachable by URL — and without this the shop could open one
       * directly, press the button, and spend a credit on an image that then lands on
       * the CUSTOMER's shelf (the image belongs to the room's owner) and never on the
       * shop's. Paid for, and gone. The shop reads a customer's images in the portal.
       */
      if (!ownsProject(project.id, user.id)) {
        return json({ message: "That room belongs to your customer — its images are theirs to make." }, 403);
      }
      const body = (await readJson(req)) as Record<string, unknown>;
      const quality = (body.quality as RenderQuality) ?? "PREMIUM";
      const cost = store.aiCredits.renderTiers?.find((t) => t.quality === quality)?.credits
        ?? store.aiCredits.renderCost;
      if (store.aiCredits.balance < cost) {
        // The same 402 the backend answers with, so the buy-credits path is demoable.
        return json({ message: `Not enough AI credits (${store.aiCredits.balance} left, ${cost} needed).` }, 402);
      }
      store.aiCredits.balance -= cost;
      store.aiCredits.recentActivity.unshift({
        id: nextId("aic"),
        credits: -cost,
        type: "SPENT_ON_RENDER",
        balanceAfter: store.aiCredits.balance,
        note: project.name,
        createdAt: nowIso(),
      });
      const combo = projectCombos(project).find((c) => c.id === body.comboId) ?? projectCombos(project)[0];
      const render: DemoRender = {
        id: nextId("rnd"),
        projectId: project.id,
        projectName: project.name,
        roomType: project.roomType ?? null,
        status: "QUEUED",
        imageUrl: null,
        comboId: combo?.id ?? null,
        comboTitle: combo?.title ?? null,
        boardIndex: combo?.boardIndex ?? 1,
        timeOfDay: (body.timeOfDay as MyRender["timeOfDay"]) ?? "DAY",
        borderMode: (body.borderMode as MyRender["borderMode"]) ?? "KEEP_ORIGINAL",
        lighting: (body.lighting as MyRender["lighting"]) ?? "NATURAL",
        furnishing: (body.furnishing as MyRender["furnishing"]) ?? "KEEP",
        style: (body.style as MyRender["style"]) ?? "MODERN",
        quality,
        note: typeof body.note === "string" ? body.note : undefined,
        shades: combo?.shades ?? [],
        createdAt: nowIso(),
        completedAt: null,
        readyAt: Date.now() + RENDER_TAKES_MS,
      };
      store.pendingRenders.unshift(render);
      return json(toProjectRender(render), 202);
    }
    if (seg[3] === "renders" && seg.length === 5 && method === "GET") {
      const one = settleRenders(project.id).find((r) => r.id === seg[4]);
      return one ? json(one) : json({ message: "No such render." }, 404);
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
      return json(undefined); // 204 — matches the real backend's featherweight autosave
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
      // Open existing project (never 404 — fall back so /studio?project=x works).
      return json(project);
    }
  }

  // ---------- Billing ----------
  if (path === "api/billing/subscriptions/current" && method === "GET") {
    if (user.role === "CUSTOMER") return json({ message: "No subscription." }, 404);
    return json(store.subscription);
  }
  if (path === "api/billing/subscriptions" && method === "POST") {
    const body = await readJson(req);
    const plan = (String(body.plan ?? "PROFESSIONAL") as SubscriptionSummary["plan"]);
    const limits: Record<string, number> = { STARTER: 15, PROFESSIONAL: 45, BUSINESS: 100, ENTERPRISE: 2147483647 };
    const names: Record<string, string> = { STARTER: "Starter", PROFESSIONAL: "Professional", BUSINESS: "Business", ENTERPRISE: "Enterprise" };
    // A freshly-created (unpaid) subscription: hand back the ids the in-app Checkout needs.
    return json({
      id: nextId("sub"),
      plan,
      planDisplayName: names[plan] ?? plan,
      status: "CREATED",
      trial: false,
      currentPeriodEnd: null,
      projectsUsed: 0,
      projectsLimit: limits[plan] ?? 45,
      projectsRemaining: limits[plan] ?? 45,
      razorpaySubscriptionId: nextId("rzpsub"),
      razorpayKeyId: "rzp_test_demo",
    } satisfies SubscriptionSummary);
  }
  if (path === "api/billing/subscriptions/verify" && method === "POST") {
    // Simulate a verified payment: promote the retailer's subscription to a paid ACTIVE plan.
    store.subscription = {
      ...store.subscription,
      status: "ACTIVE",
      trial: false,
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    };
    return json(store.subscription);
  }
  if (path === "api/me/entitlement" && method === "GET") {
    return user.role === "CUSTOMER" ? json(store.entitlement) : json(undefined);
  }
  if (path === "api/me/assigned-products" && method === "GET") {
    if (user.role !== "CUSTOMER") return json(undefined, 404);
    return json({ shopName: "Mehta Paints", allowedBrands: ["Sample palette", "Berger"], products: [] });
  }
  // The shop's suggested combinations for whoever is visualising. Single demo
  // tenant: every role (and guests, via the api/guest rewrite above) sees the
  // Mehta Paints combos — mirroring the backend's principal resolution.
  if (path === "api/me/retailer-combos" && method === "GET") {
    return json(store.combos);
  }
  // The shop's shade-code scheme — same single-tenant resolution as the combos.
  if (path === "api/me/shade-code-scheme" && method === "GET") {
    return json(store.codeScheme);
  }
  // Points are the only balance: buy them, spend them. No per-item checkout.
  if (path === "api/billing/points/project-options" && method === "GET") {
    return json(projectPurchaseOptions(user.role));
  }
  // ── The customer's counter ──────────────────────────────────────────────
  //
  // Three reads with no writes behind them. Everything on these two screens that
  // spends money opens Razorpay Checkout, which the demo has no answer for and
  // should not pretend to — so the counter shows its prices and its offers, and
  // the Pay button is where the demo honestly stops.
  if (path === "api/billing/cart" && method === "GET") {
    // A shop buys at its plan's rate from /plan; the backend answers the same way,
    // and the whole panel hides itself rather than quoting a customer price to it.
    if (user.role !== "CUSTOMER") return json({ ...store.cart, eligible: false });
    return json({
      ...store.cart,
      // The two balances the cart footer quotes have to be the ones the panels above
      // it show, or the demo reproduces the exact bug the wiring on that page fixed.
      availableProjects: store.projectCredits,
      creditBalance: store.aiCredits.balance,
    });
  }
  /**
   * The tier ladder /plan offers. Without it the page said "The plans couldn't be
   * loaded just now" under a live subscription — the one screen where the upgrade is
   * the point.
   */
  if (path === "api/billing/plans" && method === "GET") {
    return json(DEMO_PLANS);
  }
  /**
   * The colour-board PDF allowance. Missing, this read as a confident "0 of 0 used"
   * beside a Professional plan that includes 40 — a wrong number is worse than none,
   * because nothing on screen says it is a failure rather than a quota.
   */
  if (path === "api/billing/pdf-allowance" && method === "GET") {
    const limit = store.subscription.pdfDownloadsLimit ?? 0;
    const used = store.subscription.pdfDownloadsUsed ?? 0;
    return json({
      imagesPerPdf: 8,
      monthlyLimit: limit,
      used,
      remaining: Math.max(0, limit - used),
      unlimited: isUnlimited(limit),
    });
  }
  /** The shop's reward-point wallet, as the plan page and the kiosk panel read it. */
  if (path === "api/billing/points" && method === "GET") {
    if (user.role === "CUSTOMER") return json({ message: "No points wallet." }, 404);
    return json(rewardPoints());
  }
  /**
   * The paint companies THIS shop shows — the code-issuing picker's list. Its absence
   * left "Loading your companies…" on screen for the life of the page.
   */
  if (path === "api/shades/mine/brands" && method === "GET") {
    const chosen = store.visibleBrandIds;
    return json(
      store.brands
        .filter((b) => chosen === null || chosen.includes(b.id))
        .map((b) => ({
          name: b.name,
          slug: b.slug,
          shadeCount: SHADES.filter((s) => s.brand === b.name).length,
        })),
    );
  }
  if (path === "api/billing/ai-credits" && method === "GET") {
    return json(store.aiCredits);
  }
  if (path === "api/me/renders" && method === "GET") {
    // Per account, like the rooms. An image is bought with its owner's credit and
    // belongs to their shelf — a shop reads a customer's in the portal, per code,
    // which is exactly what the dashboard card comment already promised.
    const mine = new Set(visibleProjects(user).filter((p) => ownsProject(p.id, user.id)).map((p) => p.id));
    return json(store.renders.filter((r) => mine.has(r.projectId)));
  }
  /**
   * The rooms a NEW image can be started from — closed, and carrying at least one
   * colour-board combination.
   *
   * Neither half of that is tracked by a demo project on its own, so both are inferred:
   * a room is offered once it has colours on it, which is the same thing the combo
   * derivation below asks for. Without this the picker fell through to the 404 at the
   * bottom of this file and printed the words "Demo: no fixture for GET
   * api/me/renderable-projects" on the page, under a heading offering to make a picture.
   */
  if (path === "api/me/renderable-projects" && method === "GET") {
    return json(
      visibleProjects(user)
        .filter((p) => ownsProject(p.id, user.id) && projectCombos(p).length > 0)
        .map((p) => ({
          id: p.id,
          name: p.name,
          roomType: p.roomType ?? null,
          imageUrl: p.imageUrl || DEMO_UPLOAD_IMAGE_URL,
          cleanedImageUrl: p.cleanedImageUrl ?? null,
          closedAt: p.closedAt ?? p.updatedAt ?? nowIso(),
          comboCount: projectCombos(p).length,
        })),
    );
  }
  if (path === "api/billing/points/pay/project-credit" && method === "POST") {
    if (store.wallet.pointsBalance < POINTS_PROJECT) {
      return json({ message: `Not enough points (${store.wallet.pointsBalance} available, ${POINTS_PROJECT} needed).` }, 402);
    }
    store.wallet.pointsBalance -= POINTS_PROJECT;
    store.projectCredits += 1;
    store.entitlement.projectAllowance += 1;
    store.entitlement.projectsRemaining += 1;
    return json(projectPurchaseOptions(user.role));
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
    if (seg[3] === "products" && seg.length === 5 && method === "PUT") {
      const body = await readJson(req);
      const idx = store.products.findIndex((p) => p.id === seg[4]);
      const current = store.products[idx];
      if (idx === -1 || !current) return json({ message: "Product not found." }, 404);
      const line = Object.values(store.lines).flat().find((l) => l.id === Number(body.lineId));
      const brand = store.brands.find((b) => store.lines[`${b.id}:INTERIOR`]?.some((l) => l.id === Number(body.lineId)) || store.lines[`${b.id}:EXTERIOR`]?.some((l) => l.id === Number(body.lineId)));
      const updated: ShopProduct = {
        ...current,
        lineId: Number(body.lineId),
        brandName: brand?.name ?? current.brandName ?? null,
        lineName: line?.name ?? current.lineName ?? null,
        category: line?.category ?? current.category ?? null,
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
      };
      store.products[idx] = updated;
      return json(updated);
    }
    if (seg[3] === "products" && seg.length === 5 && method === "DELETE") {
      store.products = store.products.filter((p) => p.id !== seg[4]);
      return json(undefined);
    }
    // --- Suggested three-shade combinations ("shop picks") ---
    if (tail === "combos" && method === "GET") return json(store.combos);
    if (tail === "combos" && method === "POST") {
      const body = await readJson(req);
      const shades = (Array.isArray(body.shades) ? body.shades : []) as ComboShade[];
      if (shades.length !== 3) return json({ message: "A combination is exactly three shades." }, 400);
      const combo = {
        id: nextId("combo"),
        organizationId: seg[2] ?? "org_demo",
        organizationName: retailerOrg()?.name ?? "Mehta Paints",
        name: String(body.name ?? "Untitled combo").trim(),
        scope: (body.scope === "EXTERIOR" ? "EXTERIOR" : "INTERIOR") as ComboScope,
        shades: shades.map((s) => ({ code: String(s.code), name: String(s.name), hex: String(s.hex).toLowerCase() })),
        createdAt: nowIso(),
      };
      store.combos.unshift(combo);
      return json(combo, 201);
    }
    if (seg[3] === "combos" && seg.length === 5 && method === "DELETE") {
      store.combos = store.combos.filter((c) => c.id !== seg[4]);
      return json(undefined);
    }
    // --- Shade-code scheme (one pattern for customer-facing codes) ---
    if (tail === "shade-code-scheme" && method === "GET") return json(store.codeScheme);
    if (tail === "shade-code-scheme" && method === "PUT") {
      const body = await readJson(req);
      const part = (v: unknown, max: number) => String(v ?? "").trim().toUpperCase().slice(0, max);
      store.codeScheme = {
        prefix: part(body.prefix, 4),
        infix: part(body.infix, 2),
        suffix: part(body.suffix, 4),
      };
      return json(store.codeScheme);
    }
    // --- Which paint companies the shop shows (its own half of the catalogue limit) ---
    if (tail === "visible-brands" && method === "GET") {
      return json(shopBrandVisibility());
    }
    if (tail === "visible-brands" && method === "PUT") {
      const body = await readJson(req);
      // showAll clears the shop's own limit; otherwise the list IS the selection, and an
      // empty one really means none. Ids outside the demo catalogue are dropped, the way
      // the backend drops ids the distributor never granted.
      const known = new Set(store.brands.map((b) => b.id));
      store.visibleBrandIds = body.showAll
        ? null
        : (Array.isArray(body.brandIds) ? body.brandIds : [])
            .map((id: unknown) => Number(id))
            .filter((id: number) => known.has(id));
      return json(shopBrandVisibility());
    }
    /** Everything this shop has given away. Nothing seeded — a shop that has granted
     *  nothing is the ordinary case, and an empty list is the honest answer for it. */
    if (tail === "project-grants" && method === "GET") return json([]);
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
    // Topping up a code the customer already holds: more projects, or another 10 days.
    if (seg[4] === "access-codes" && seg[6] === "projects" && method === "POST") {
      const body = await readJson(req);
      const code = store.accessCodes.find((c) => c.id === seg[5]);
      if (!code) return json({ message: "Access code not found" }, 404);
      const added = Number(body.projects ?? 1);
      code.projectQuota = (code.projectQuota ?? 1) + added;
      code.projectsRemaining = (code.projectsRemaining ?? code.projectQuota) + added;
      return json(code);
    }
    if (seg[4] === "access-codes" && seg[6] === "extend" && method === "POST") {
      const code = store.accessCodes.find((c) => c.id === seg[5]);
      if (!code) return json({ message: "Access code not found" }, 404);
      code.validDays = ACCESS_CODE_VALID_DAYS;
      code.expiresAt = new Date(Date.now() + ACCESS_CODE_VALID_DAYS * 86_400_000).toISOString();
      code.expired = false;
      code.extendedAt = nowIso();
      code.extensionCount = (code.extensionCount ?? 0) + 1;
      return json(code);
    }
    if (tail === "customers" && method === "GET") return json(store.customers);
    if (seg[3] === "customers" && seg[5] === "grant-project" && method === "POST") {
      const c = store.customers.find((x) => x.customerId === seg[4]);
      if (c) { c.projectAllowance += 1; c.projectsRemaining += 1; c.updatedAt = nowIso(); }
      return json(c ?? store.customers[0]);
    }
    // --- Public store kiosk links + reward points ---
    if (tail === "store-links" && method === "GET") return json(store.storeLinks);
    if (tail === "store-links" && method === "POST") {
      const body = await readJson(req);
      const org = retailerOrg();
      const link: StoreLink = {
        id: nextId("sl"),
        slug: `${org?.slug ?? "shop"}-${nextSeq()}`,
        organizationId: seg[2] ?? "org_demo",
        organizationName: org?.name ?? "Mehta Paints",
        // Platform-set, not shop-set — the shop earns points, not a share.
        pricePaise: store.wallet.kioskPricePaise,
        bonusPoints: store.wallet.pointsPerSale,
        currency: "INR",
        validDays: Number(body.validDays ?? 7),
        active: true,
        createdAt: nowIso(),
      };
      store.storeLinks.unshift(link);
      return json(link);
    }
    if (tail === "wallet" && method === "GET") return json(store.wallet);
  }

  // Retailer pauses/resumes an existing kiosk link.
  if (seg[0] === "api" && seg[1] === "store-links" && seg.length === 3 && method === "PATCH") {
    const link = store.storeLinks.find((l) => l.id === seg[2]);
    if (!link) return json({ message: "Store link not found." }, 404);
    const body = await readJson(req);
    if (body.validDays != null) link.validDays = Number(body.validDays);
    if (typeof body.active === "boolean") link.active = body.active;
    return json(link);
  }

  // ---------- Shade catalogue brands (portal "restrict to brands" picker) ----------
  if (path === "api/shades/brands" && method === "GET") {
    const counts = new Map<string, number>();
    for (const s of SHADES) counts.set(s.brand, (counts.get(s.brand) ?? 0) + 1);
    const brands = [...counts.entries()].map(([name, shadeCount]) => ({ name, slug: slugify(name), shadeCount }));
    return json(brands);
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
  // The shop's view of a guest's room (portal "View room"). Single demo tenant:
  // any code resolves to the first seeded project.
  if (seg[0] === "api" && seg[1] === "access-codes" && seg[3] === "guest-project" && method === "GET") {
    const project = store.projects[0];
    return json(project ? liveResponse(project) : undefined);
  }
  // Every room a code produced (portal "View rooms"). Single demo tenant: the
  // seeded projects stand in for whatever the code's customer created.
  if (seg[0] === "api" && seg[1] === "access-codes" && seg[3] === "projects" && method === "GET") {
    // The rooms made on THIS code — not, as before, every room in the demo, which made
    // "View rooms" on any code open the shop's whole shelf.
    const codeId = seg[2];
    return json(
      store.projects.filter((p) => store.projectOwners[p.id]?.accessCodeId === codeId),
    );
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
/**
 * The shop's reward-point wallet, in the shape GET /api/billing/points answers with.
 *
 * Derived from the same `store.wallet` the kiosk panel reads rather than seeded twice,
 * so a sale credited in the demo moves BOTH screens — which is the whole point of the
 * kiosk being demoable at all.
 */
function rewardPoints() {
  const store = getStore();
  const balance = store.wallet.pointsBalance;
  return {
    balance,
    pointsPerSale: store.wallet.pointsPerSale,
    rupeesPerPoint: 1,
    minPurchase: 50,
    maxPurchase: 5_000,
    validityDays: 365,
    expiryWarningDays: 30,
    projectPrice: POINTS_PROJECT,
    reopenPrice: Math.round(POINTS_PROJECT / 2),
    nextExpiringPoints: balance > 0 ? balance : null,
    nextExpiryAt: balance > 0 ? inDays(300) : null,
    lots: balance > 0 ? [{ id: "lot_demo", pointsRemaining: balance, expiresAt: inDays(300) }] : [],
    recentActivity: store.wallet.recentPayments.map((p) => ({
      id: p.id,
      points: p.reversed ? -p.bonusPoints : p.bonusPoints,
      type: (p.reversed ? "KIOSK_REVERSED" : "KIOSK_EARNED") as "KIOSK_REVERSED" | "KIOSK_EARNED",
      createdAt: p.createdAt ?? nowIso(),
    })),
  };
}

// --- Who may see which room ---

/**
 * The rooms this account is allowed to open, newest-first order preserved.
 *
 * Two audiences, two rules, and they are the backend's own:
 *
 *  - A CUSTOMER sees the rooms they created. Nothing else. This is the rule that was
 *    missing entirely: the demo handed every caller `store.projects`, so Anjali's
 *    dashboard opened onto the shop's four rooms above a banner reading "1 of 2
 *    projects used" and a card telling her to verify her email before creating her
 *    FIRST project.
 *  - A RETAILER or ADMIN sees their own rooms AND the rooms their customers made on
 *    codes the shop issued — that is the whole point of the code loop, and it is what
 *    the dashboard's "My rooms / Customer rooms" filter runs on. That filter has never
 *    appeared in the demo, because nothing was ever marked as a customer's.
 *
 * Anyone else (distributor, painter) owns no rooms and is shown their own, which is
 * none — the honest answer rather than somebody else's shelf.
 */
function visibleProjects(user: { id: string; role: string }): ProjectDetail[] {
  const store = getStore();
  const shopCodeIds = new Set(store.accessCodes.map((c) => c.id));
  return store.projects.filter((p) => {
    const owner = store.projectOwners[p.id];
    // A room with no owner recorded is one this session just made; treat the caller as
    // its owner rather than hiding a room somebody is looking at.
    if (!owner) return true;
    if (owner.ownerId === user.id) return true;
    if (user.role !== "RETAILER" && user.role !== "ADMIN") return false;
    return owner.accessCodeId != null && shopCodeIds.has(owner.accessCodeId);
  });
}

/**
 * Did this account CREATE the room, as opposed to merely being allowed to see it?
 *
 * The difference matters wherever the answer is about spending rather than reading: a
 * shop can open a customer's room and read the shades off it, and cannot photograph it
 * with the shop's own AI credit or find its picture on the shop's shelf.
 */
function ownsProject(projectId: string, userId: string): boolean {
  const owner = getStore().projectOwners[projectId];
  // No record means this session made it — see visibleProjects.
  return !owner || owner.ownerId === userId;
}

/**
 * A room as it appears on THIS reader's dashboard.
 *
 * `source` is the reader's word for it, not the room's: the same café facade is "mine"
 * to Anjali and "a customer's" to the shop. A customer's room also carries who made it
 * and on which code, because a shop's grid now holds both kinds and a card that does
 * not say which is a card that gets opened by mistake.
 */
function summaryFor(p: ProjectDetail, user: { id: string }): import("../types").ProjectSummary {
  const store = getStore();
  const owner = store.projectOwners[p.id];
  const base = toSummary(p);
  if (!owner || owner.ownerId === user.id) return { ...base, source: "OWN" };
  const code = store.accessCodes.find((c) => c.id === owner.accessCodeId);
  const customer = store.customers.find((c) => c.customerId.replace(/^cust_/, "usr_") === owner.ownerId);
  return {
    ...base,
    source: "CUSTOMER",
    customerName: customer?.customerName ?? null,
    accessCode: code?.code ?? null,
    accessCodeId: owner.accessCodeId ?? null,
  };
}

// --- AI renders ---

/**
 * How long a demo render "takes".
 *
 * Long enough that the studio's QUEUED → RUNNING → READY screen is actually seen, short
 * enough that nobody walks away from the demo. The real thing normally lands inside a
 * minute and is allowed up to eight.
 */
const RENDER_TAKES_MS = 4_000;

/** A queued demo render, plus the wall-clock moment it should be declared finished. */
type DemoRender = MyRender & { readyAt: number };

/** MyRender (the /ai-images shelf shape) → ProjectRender (what the studio polls). */
function toProjectRender(r: MyRender): ProjectRender {
  const { id, comboId, status, imageUrl, createdAt, completedAt, ...opts } = r;
  return {
    ...(opts as RenderOptions),
    id,
    comboId: comboId ?? null,
    status,
    imageUrl: imageUrl ?? null,
    failureReason: null,
    createdAt,
    completedAt: completedAt ?? null,
  };
}

/**
 * Advance every pending render for a project, then answer with all of that project's.
 *
 * Time is read here rather than on a timer because there is nothing to run a timer in:
 * a demo request is the only thing that happens. So each poll asks "is it done yet",
 * which is exactly the question the studio's poll loop is already asking — the two
 * agree by construction, and an image is never finished by a clock nobody read.
 *
 * QUEUED for the first poll, RUNNING for the ones after, READY once the time is up.
 * A finished render moves onto the account's shelf, so it appears at /ai-images too.
 */
function settleRenders(projectId: string): ProjectRender[] {
  const store = getStore();
  const now = Date.now();
  for (const r of store.pendingRenders) {
    if (r.status === "READY") continue;
    if (now >= r.readyAt) {
      const project = store.projects.find((p) => p.id === r.projectId);
      r.status = "READY";
      // The room's own photograph, standing in for a picture the demo cannot make.
      r.imageUrl = project?.cleanedImageUrl || project?.imageUrl || DEMO_UPLOAD_IMAGE_URL;
      r.completedAt = nowIso();
      if (!store.renders.some((x) => x.id === r.id)) {
        // Onto the account's shelf without the demo's own bookkeeping field, so
        // /ai-images sees exactly the shape the real endpoint returns.
        const shelf: MyRender = { ...r };
        delete (shelf as Partial<DemoRender>).readyAt;
        store.renders.unshift(shelf);
      }
    } else if (r.status === "QUEUED") {
      r.status = "RUNNING";
    }
  }
  return store.pendingRenders.filter((r) => r.projectId === projectId).map(toProjectRender);
}

/**
 * The colour boards a room can be photographed in.
 *
 * The real backend stores these when the studio builds a board; the demo has no board
 * step, so the walls as they stand are the board. One combination per room, named the
 * way a board page is named, and no combination at all for a room with no colours on it
 * — which is what correctly keeps an untouched room out of the render picker.
 */
function projectCombos(project: ProjectDetail): ProjectCombo[] {
  const painted = project.regions.filter((r) => r.appliedHexCode);
  if (painted.length === 0) return [];
  return [
    {
      id: `cmb_${project.id.slice(0, 8)}`,
      boardIndex: 1,
      pageIndex: 0,
      title: "Board 1 · Option 1",
      rendered: getStore().renders.some((r) => r.projectId === project.id),
      shades: painted.map((r) => ({
        regionId: r.id,
        regionLabel: r.label,
        shadeCode: r.appliedShadeCode ?? null,
        shadeName: SHADES.find((s) => s.code === r.appliedShadeCode)?.name ?? null,
        hex: r.appliedHexCode!,
      })),
    },
  ];
}


/** The demo's answer for GET/PUT visible-brands: the catalogue, each flagged. */
function shopBrandVisibility() {
  const store = getStore();
  const chosen = store.visibleBrandIds;
  return {
    restricted: chosen !== null,
    brands: store.brands.map((b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      shown: chosen === null || chosen.includes(b.id),
    })),
  };
}
function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "shop";
}
function maskEmail(email: string): string {
  const [u, d] = email.split("@");
  return `${u?.[0] ?? ""}***@${d ?? "example.in"}`;
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
