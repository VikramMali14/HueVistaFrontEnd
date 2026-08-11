/**
 * Mutable in-memory demo store. Seeded once (deep-cloned from ./data) and kept on
 * `globalThis` so it survives Next dev HMR/module re-eval within a running server.
 * State is per-server-process and resets on restart — exactly right for a demo.
 *
 * Demo writes (create a project, add a product, issue a code…) mutate this store
 * so the very next read reflects them, making the offline app feel live.
 */
import type {
  AccessCode,
  CustomerEntitlement,
  OrgResponse,
  PaintBrand,
  PaintLine,
  ProjectDetail,
  RetailerCombo,
  ShopProduct,
  StoreLink,
  SubscriptionSummary,
  SupportConversation,
  SupportConversationSummary,
  WalletSummary,
} from "../types";
import type { ShadeCodeScheme } from "../shade-codes";
import {
  DEMO_ACCESS_CODES,
  DEMO_BRANDS,
  DEMO_COMBOS,
  DEMO_CUSTOMERS,
  DEMO_ENTITLEMENT,
  DEMO_INBOX,
  DEMO_LINES,
  DEMO_ORG,
  DEMO_PROJECT_DETAILS,
  DEMO_PROJECT_ORDER,
  DEMO_SHOP_PRODUCTS,
  DEMO_STORE_LINKS,
  DEMO_SUBSCRIPTION,
  DEMO_SUPPORT_CONVERSATIONS,
  DEMO_WALLET,
} from "./data";

export interface DemoStore {
  projects: ProjectDetail[];
  brands: PaintBrand[];
  lines: Record<string, PaintLine[]>;
  products: ShopProduct[];
  orgs: OrgResponse[];
  accessCodes: AccessCode[];
  combos: RetailerCombo[];
  customers: CustomerEntitlement[];
  conversations: SupportConversation[];
  inbox: SupportConversationSummary[];
  subscription: SubscriptionSummary;
  entitlement: CustomerEntitlement;
  /** Projects paid for and not yet created — the demo's ProjectCredit ledger. */
  projectCredits: number;
  storeLinks: StoreLink[];
  wallet: WalletSummary;
  /** The shop's shade-code scheme (customer codes derive from this one pattern). */
  codeScheme: ShadeCodeScheme;
  /**
   * Which paint companies the shop shows, as brand ids — null while it shows every
   * company it carries. Null rather than "all the ids" so the demo reproduces the same
   * three-state shape the backend has: unset, an explicit list, and an explicit empty
   * list meaning none.
   */
  visibleBrandIds: number[] | null;
  /** Monotonic counter for generated numeric ids (regions, etc.). */
  seq: number;
}

function clone<T>(value: T): T {
  // structuredClone is available on Node >=18; JSON fallback is plenty here.
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function seed(): DemoStore {
  return {
    projects: DEMO_PROJECT_ORDER.map((id) => clone(DEMO_PROJECT_DETAILS[id]!)),
    brands: clone(DEMO_BRANDS),
    lines: clone(DEMO_LINES),
    products: clone(DEMO_SHOP_PRODUCTS),
    orgs: [clone(DEMO_ORG)],
    accessCodes: clone(DEMO_ACCESS_CODES),
    combos: clone(DEMO_COMBOS),
    customers: clone(DEMO_CUSTOMERS),
    conversations: clone(DEMO_SUPPORT_CONVERSATIONS),
    inbox: clone(DEMO_INBOX),
    subscription: clone(DEMO_SUBSCRIPTION),
    entitlement: clone(DEMO_ENTITLEMENT),
    projectCredits: 0,
    storeLinks: clone(DEMO_STORE_LINKS),
    wallet: clone(DEMO_WALLET),
    // Mehta Paints reads shade L124 as MPL1K24 at the counter.
    codeScheme: { prefix: "MP", infix: "K", suffix: "" },
    visibleBrandIds: null,
    seq: 1000,
  };
}

const KEY = "__hvDemoStore";
type Holder = typeof globalThis & { [KEY]?: DemoStore };

export function getStore(): DemoStore {
  const g = globalThis as Holder;
  if (!g[KEY]) g[KEY] = seed();
  return g[KEY]!;
}

/** Next monotonic integer id. */
export function nextSeq(): number {
  const s = getStore();
  s.seq += 1;
  return s.seq;
}

/** Short unique string id with a readable prefix. */
export function nextId(prefix: string): string {
  return `${prefix}_${nextSeq()}`;
}

export function retailerOrg(): OrgResponse | undefined {
  const s = getStore();
  return s.orgs.find((o) => o.type === "RETAILER") ?? s.orgs[0];
}
