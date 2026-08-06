"use client";

import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { Mono } from "@/components/ui/eyebrow";
import {
  ALL,
  FilterBar,
  facetOptionsFrom,
  matchesQuery,
  type FacetOption,
} from "@/components/ui/filter-bar";
import {
  getRetailerBrandsAction,
  getRetailerFeaturesAction,
  listDistributorsAction,
  moveShopDistributorAction,
  setRetailerBrandsAction,
  setRetailerFeaturesAction,
} from "@/lib/auth";
import type {
  NetworkNode,
  NetworkReport,
  RetailerBrandOption,
  RetailerFeatureOption,
  UserRole,
} from "@/lib/types";
import type { DistributorOption } from "@/lib/api";

/**
 * Facet value isolating shops that carry the whole catalogue (no brand restriction).
 *
 * A sentinel, not a company. It shares the facet's value space with real brand names —
 * and with `ALL`, the empty string — so it has to be something no paint company could
 * ever be called. This used to be a literal U+0000 for exactly that reason, which bought
 * the uniqueness at too high a price: a raw NUL byte in the source made the file binary
 * to git, grep and every diff tool, and NUL is not a character HTML can carry, so
 * rendering it into an `<option value>` and reading it back off the DOM is not a round
 * trip the parser guarantees. Underscores are just as impossible as a brand name and
 * survive being written to markup.
 */
const UNRESTRICTED = "__unrestricted__";

/**
 * A shop's access as the table currently shows it.
 *
 * The `restricted` flags travel WITH the lists rather than being inferred from
 * `length === 0`, because an empty list is genuinely ambiguous: a shop with no
 * limit and a shop granted nothing both have none. Rendering those the same way is
 * exactly what made "all brands" and "no brands" indistinguishable here.
 */
interface ShopAccess {
  brands: string[];
  brandsRestricted: boolean;
  features: string[];
  featuresRestricted: boolean;
}

interface NetworkReportViewProps {
  /** Null = the report could not be loaded — shown as an error, never as "empty". */
  report: NetworkReport | null;
}

const TOTAL_LABELS: Record<string, string> = {
  distributors: "Distributors",
  retailers: "Shops",
  painters: "Painters",
  customers: "Customers",
  codesIssued: "Codes issued",
  codesRedeemed: "Codes redeemed",
};

const ROLE_LABEL: Record<string, string> = {
  DISTRIBUTOR: "Distributor",
  RETAILER: "Shop",
  PAINTER: "Painter",
  CUSTOMER: "Customer",
};

type FlatRow = { node: NetworkNode; parent: NetworkNode | null };

/**
 * A customer with both levels above them: the shop that onboarded them, and that
 * shop's distributor.
 *
 * The whole point of the customers view is reading the chain end to end, and a
 * customer's parent alone only reaches the shop — the question an admin actually
 * asks is "which distributor's shops are bringing customers in?", which needs the
 * grandparent.
 */
type CustomerRow = { node: NetworkNode; shop: NetworkNode | null; distributor: NetworkNode | null };

/** Every customer in the tree, carrying its shop and distributor. */
function collectCustomers(roots: NetworkNode[]): CustomerRow[] {
  const rows: CustomerRow[] = [];
  const walk = (node: NetworkNode, shop: NetworkNode | null, distributor: NetworkNode | null) => {
    if (node.role === "CUSTOMER") rows.push({ node, shop, distributor });
    const nextShop = node.role === "RETAILER" ? node : shop;
    const nextDistributor = node.role === "DISTRIBUTOR" ? node : distributor;
    node.children.forEach((c) => walk(c, nextShop, nextDistributor));
  };
  roots.forEach((r) => walk(r, null, null));
  return rows;
}

/**
 * The address the backend leaves behind when an account is soft-deleted
 * (AuthService#deleteAccount scrubs the PII and writes this shape).
 *
 * The report was rendering it verbatim, so a branch of the tree could be headed
 * by "Deleted user · deleted-a1b2…@deleted.huevista.invalid" — a machine id
 * presented as a person, at the top of a network that is still very much alive.
 */
const DELETED_EMAIL_DOMAIN = "@deleted.huevista.invalid";

function isDeletedAccount(node: NetworkNode): boolean {
  return Boolean(node.email?.endsWith(DELETED_EMAIL_DOMAIN));
}

/**
 * Who to credit a node to.
 *
 * Three cases the report used to render identically, as whatever string the
 * backend happened to hold:
 *
 *  - The house distributor has no owner to name. It is an organization the
 *    platform runs, not somebody's account, so naming a person there is wrong
 *    even when the row happens to have one.
 *  - A soft-deleted owner has no name or address left worth printing.
 *  - Everyone else is a real person and reads normally.
 */
function OwnerIdentity({ node, block }: { node: NetworkNode; block?: boolean }) {
  if (node.house) {
    return (
      <span className="net-owner-system" title="An organization HueVista runs itself — it carries every shop no partner distributor brought in, so it heads a branch of the tree without being anybody's account.">
        HueVista — no account owner
      </span>
    );
  }
  if (isDeletedAccount(node)) {
    return (
      <span className="net-owner-system" title="This account was deleted. The organization and its downline are intact; the person who owned it is gone and their details were scrubbed.">
        Account removed
      </span>
    );
  }
  return (
    <>
      <span>{node.name}</span>
      {node.email && (
        <>
          {block ? <br /> : " "}
          <Mono>{node.email}</Mono>
        </>
      )}
      {node.phone && (
        <>
          <br />
          <Mono>{node.phone}</Mono>
        </>
      )}
    </>
  );
}

/**
 * Just who owns it, no address — the sub-line under a company name on a
 * collapsed row. The e-mail belongs to the Contact field in the opened detail;
 * printing it here as well put the same string on screen three times per shop.
 */
function OwnerName({ node }: { node: NetworkNode }) {
  if (node.house) return <span className="net-owner-system">HueVista — no account owner</span>;
  if (isDeletedAccount(node)) return <span className="net-owner-system">Account removed</span>;
  return <>{node.name}</>;
}

/** Contact cell content, with the same three cases as {@link OwnerIdentity}. */
function ContactCell({ node }: { node: NetworkNode }) {
  if (node.house || isDeletedAccount(node)) {
    return <span className="net-owner-system">—</span>;
  }
  if (!node.email && !node.phone) return <>—</>;
  return (
    <>
      {node.email ? <Mono>{node.email}</Mono> : null}
      {node.phone ? <>{node.email ? <br /> : null}<Mono>{node.phone}</Mono></> : null}
    </>
  );
}

/** "3 / 5" with the pair's meaning in the title, or a dash when it does not apply. */
function usageLabel(node: NetworkNode): string {
  if (node.projectAllowance == null) return "—";
  return `${node.projectsUsed ?? 0} / ${node.projectAllowance}`;
}

/** True once a customer's access window has closed. */
function isLapsed(iso?: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return !Number.isNaN(d.getTime()) && d.getTime() < Date.now();
}

/** Every node of the given role across the tree, with its parent for context. */
function collectByRole(roots: NetworkNode[], role: UserRole): FlatRow[] {
  const rows: FlatRow[] = [];
  const walk = (node: NetworkNode, parent: NetworkNode | null) => {
    if (node.role === role) rows.push({ node, parent });
    node.children.forEach((c) => walk(c, node));
  };
  roots.forEach((r) => walk(r, null));
  return rows;
}

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** Which editor the shops table opened for a row. */
type EditorKind = "brands" | "pages" | "distributor";

/**
 * The role-scoped network report: headline totals, the downline tree, and flat
 * per-role tables (distributors / shops / painters / customers) — one place to
 * read the whole chain, from the distributor down to the walk-in a shop signed up.
 */
export function NetworkReportView({ report }: NetworkReportViewProps) {
  const distributors = useMemo(() => (report ? collectByRole(report.roots, "DISTRIBUTOR") : []), [report]);
  const retailers = useMemo(() => (report ? collectByRole(report.roots, "RETAILER") : []), [report]);
  const painters = useMemo(() => (report ? collectByRole(report.roots, "PAINTER") : []), [report]);
  const customers = useMemo(() => (report ? collectCustomers(report.roots) : []), [report]);

  const tabs = useMemo(() => {
    if (!report) return [];
    const t: { id: string; label: string }[] = [];
    if (report.viewerRole !== "RETAILER") t.push({ id: "tree", label: "Network tree" });
    if (report.viewerRole === "ADMIN") t.push({ id: "distributors", label: `Distributors · ${distributors.length}` });
    if (report.viewerRole !== "RETAILER") t.push({ id: "retailers", label: `Shops · ${retailers.length}` });
    t.push({ id: "painters", label: `Painters · ${painters.length}` });
    t.push({ id: "customers", label: `Customers · ${customers.length}` });
    return t;
  }, [report, distributors.length, retailers.length, painters.length, customers.length]);

  const [tab, setTab] = useState<string | null>(null);
  const activeTab = tab ?? tabs[0]?.id ?? "painters";

  // A distributor/admin grants each shop its paint brands AND the pages it may
  // open. Edits save through the shop's org id; local overrides let a row reflect
  // the new selection immediately without re-fetching the whole report.
  const canManageAccess = report?.viewerRole === "DISTRIBUTOR" || report?.viewerRole === "ADMIN";
  const [accessOverrides, setAccessOverrides] = useState<Record<string, ShopAccess>>({});
  const [editing, setEditing] = useState<{ orgId: string; name: string; kind: EditorKind } | null>(null);
  // Only an admin re-files a shop: a distributor moving one would be taking it
  // off a peer, which is that peer's to release.
  const canMoveShops = report?.viewerRole === "ADMIN";
  const accessFor = (node: NetworkNode): ShopAccess =>
    (node.orgId && accessOverrides[node.orgId]) || {
      brands: node.assignedBrands ?? [],
      brandsRestricted: node.brandsRestricted ?? false,
      features: node.assignedFeatures ?? [],
      featuresRestricted: node.featuresRestricted ?? false,
    };

  /**
   * Fold one editor's result into the row's access. Merges onto whatever the row
   * shows NOW — the previous override if the shop has already been edited this
   * session, otherwise the report's own values — so saving brands never resets the
   * pages the other editor just set (and vice versa).
   */
  const mergeAccess = (orgId: string, patch: Partial<ShopAccess>) =>
    setAccessOverrides((prev) => {
      const node = retailers.find((r) => r.node.orgId === orgId)?.node;
      const base = prev[orgId] ?? {
        brands: node?.assignedBrands ?? [],
        brandsRestricted: node?.brandsRestricted ?? false,
        features: node?.assignedFeatures ?? [],
        featuresRestricted: node?.featuresRestricted ?? false,
      };
      return { ...prev, [orgId]: { ...base, ...patch } };
    });

  if (!report) {
    return (
      <p className="field-error" role="alert">
        Could not load the network report — refresh the page, or sign in again if it keeps happening.
      </p>
    );
  }

  return (
    <div>
      {/* Headline totals */}
      <div className="net-totals">
        {Object.entries(report.totals).map(([key, value]) => (
          <div key={key} className="net-tile">
            <span className="net-tile-num">{value}</span>
            <span className="net-tile-label">{TOTAL_LABELS[key] ?? key}</span>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="Network views" className="net-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={activeTab === t.id}
            onClick={() => setTab(t.id)}
            className={`net-tab${activeTab === t.id ? " active" : ""}`}
            type="button"
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "tree" && <Tree roots={report.roots} accessFor={accessFor} />}
      {activeTab === "distributors" && <DistributorTable rows={distributors} />}
      {activeTab === "retailers" && (
        <RetailerTable
          rows={retailers}
          showDistributor={report.viewerRole === "ADMIN"}
          canManageAccess={canManageAccess}
          canMoveShops={canMoveShops}
          accessFor={accessFor}
          onEdit={(orgId, name, kind) => setEditing({ orgId, name, kind })}
        />
      )}
      {activeTab === "painters" && <PainterTable rows={painters} />}
      {activeTab === "customers" && (
        <CustomerTable rows={customers} showDistributor={report.viewerRole !== "RETAILER"} />
      )}

      {editing?.kind === "brands" && (
        <BrandEditor
          orgId={editing.orgId}
          shopName={editing.name}
          initiallyRestricted={accessOverrides[editing.orgId]?.brandsRestricted
            ?? retailers.find((r) => r.node.orgId === editing.orgId)?.node.brandsRestricted
            ?? false}
          onClose={() => setEditing(null)}
          onSaved={(orgId, names, restricted) => {
            mergeAccess(orgId, { brands: names, brandsRestricted: restricted });
            setEditing(null);
          }}
        />
      )}
      {editing?.kind === "distributor" && (
        <MoveShopEditor
          orgId={editing.orgId}
          shopName={editing.name}
          onClose={() => setEditing(null)}
        />
      )}
      {editing?.kind === "pages" && (
        <FeatureEditor
          orgId={editing.orgId}
          shopName={editing.name}
          initiallyRestricted={accessOverrides[editing.orgId]?.featuresRestricted
            ?? retailers.find((r) => r.node.orgId === editing.orgId)?.node.featuresRestricted
            ?? false}
          onClose={() => setEditing(null)}
          onSaved={(orgId, labels, restricted) => {
            mergeAccess(orgId, { features: labels, featuresRestricted: restricted });
            setEditing(null);
          }}
        />
      )}

      <style>{`
        .net-totals { display: flex; flex-wrap: wrap; gap: 14px; margin-bottom: 32px; }
        .net-tile { border: 1px solid var(--rule-strong); background: var(--surface-soft); border-radius: 8px; padding: 16px 22px; display: flex; flex-direction: column; gap: 8px; min-width: 128px; }
        .net-tile-num { font: 300 32px/1 var(--serif); color: var(--fg); font-variant-numeric: tabular-nums; }
        /* Dense data reads in the body sans, not in tracked mono-caps. The
           console had column headers, tab labels and every stat caption set in
           12px JetBrains Mono at .22em — a treatment that carries an eyebrow of
           two words and actively slows down a table you are scanning. Mono is
           kept for the things that are genuinely machine strings: ids, codes,
           e-mail addresses. */
        .net-tile-label { font: 500 12px/1 var(--sans); letter-spacing: .06em; color: var(--fg-mute); }
        .net-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px; border-bottom: 1px solid var(--rule); padding-bottom: 12px; }
        .net-tab { background: transparent; border: 1px solid transparent; border-radius: var(--radius-pill); padding: 9px 14px; cursor: pointer; color: var(--fg-mute); font: 500 13px/1 var(--sans); letter-spacing: 0; transition: color .2s, border-color .2s, background .2s; }
        .net-tab:hover { color: var(--fg); border-color: var(--rule-strong); }
        .net-tab.active { color: var(--fg); border-color: var(--rule-strong); background: var(--surface-soft); }
        .net-table-wrap { overflow-x: auto; border: 1px solid var(--rule-strong); border-radius: 8px; }
        /* No min-width: the point of the master-detail split is that the row
           fits. A min-width here would re-introduce the sideways scroll it
           exists to remove. */
        .net-table { width: 100%; border-collapse: collapse; }
        .net-table th { text-align: left; font: 600 12px/1 var(--sans); letter-spacing: .04em; color: var(--fg-mute); padding: 13px 14px; border-bottom: 1px solid var(--rule-strong); background: var(--surface-soft); white-space: nowrap; }
        .net-table td { font: 400 14px/1.45 var(--sans); color: var(--fg-soft); padding: 12px 14px; border-bottom: 1px solid var(--rule); vertical-align: top; }
        .net-table tr:last-child td { border-bottom: none; }
        .net-table .strong { font-weight: 600; color: var(--fg); }
        .net-num { font-variant-numeric: tabular-nums; }
        .net-col-num { text-align: left; }

        /* ── Master-detail rows ── */
        .net-col-expand { width: 40px; padding-right: 0 !important; }
        .net-expand {
          display: inline-flex; align-items: center; justify-content: center;
          width: 26px; height: 26px; padding: 0;
          background: transparent; border: 1px solid var(--rule-strong);
          border-radius: 6px; color: var(--fg-soft); cursor: pointer;
          transition: color .18s, border-color .18s, background .18s;
        }
        .net-expand:hover { color: var(--fg); border-color: var(--fg-mute); background: var(--surface-soft); }
        .net-expand svg { transition: transform .18s var(--ease); }
        .net-expand[aria-expanded="true"] svg { transform: rotate(90deg); }
        .net-row.is-open > td { background: var(--surface-soft); border-bottom-color: transparent; }
        /* A second line under a cell's headline — the owner under a company,
           "ours" under a distributor. */
        .net-cell-sub { display: block; margin-top: 3px; font: 400 12.5px/1.4 var(--sans); color: var(--fg-mute); }
        .net-detail-row > td { background: var(--surface-soft); padding: 0 14px 16px 54px !important; border-bottom: 1px solid var(--rule); }
        .net-detail { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 16px 28px; }
        .net-detail-field { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
        .net-detail-field.is-wide { grid-column: 1 / -1; }
        .net-detail-label { font: 600 11px/1 var(--sans); letter-spacing: .08em; text-transform: uppercase; color: var(--fg-mute); }
        .net-detail-value { font: 400 14px/1.5 var(--sans); color: var(--fg-soft); overflow-wrap: anywhere; }
        /* The house distributor and deleted owners: a statement about the
           account, not a name. Italic so it never reads as somebody's. */
        .net-owner-system { font-style: italic; color: var(--fg-mute); }
        @media (max-width: 640px) {
          .net-detail-row > td { padding-left: 14px !important; }
        }
        .net-empty { font: 400 15px/1.6 var(--sans); color: var(--fg-mute); }
        .net-node { border: 1px solid var(--rule-strong); background: var(--surface-soft); border-radius: 8px; padding: 12px 16px; display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 16px; }
        .net-branch { display: flex; flex-direction: column; gap: 10px; }
        .net-children { display: flex; flex-direction: column; gap: 10px; margin-left: 26px; padding-left: 16px; border-left: 1px solid var(--rule-strong); }
        .net-chip { font: 600 11px/1 var(--sans); letter-spacing: .07em; text-transform: uppercase; padding: 5px 8px; border-radius: 4px; border: 1px solid var(--rule-strong); color: var(--fg-mute); white-space: nowrap; }
        .net-chip.distributor { color: var(--accent-text); border-color: var(--rule-brass); }
        .net-chip.retailer { color: var(--fg-soft); }
        .net-chip.customer { color: var(--sage-text); border-color: var(--sage); }
        .net-brands { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
        .net-brand-tag { font: 500 12px/1 var(--sans); letter-spacing: 0; padding: 5px 8px; border-radius: 4px; border: 1px solid var(--rule-strong); color: var(--fg-soft); background: var(--surface); white-space: nowrap; }
        .net-brand-tag.all { color: var(--fg-mute); border-style: dashed; }
        .net-brand-edit { font: 600 12px/1 var(--sans); letter-spacing: 0; padding: 7px 12px; border-radius: var(--radius-pill); border: 1px solid var(--rule-strong); background: transparent; color: var(--accent-text); cursor: pointer; white-space: nowrap; }
        .net-brand-edit:hover { border-color: var(--accent); }
        .net-modal-scrim { position: fixed; inset: 0; z-index: 200; background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; padding: 20px; }
        .net-modal { background: var(--surface); border: 1px solid var(--rule-strong); border-radius: 12px; width: min(480px, 100%); max-height: 85vh; overflow-y: auto; padding: 24px; box-shadow: 0 24px 60px -20px rgba(0,0,0,.6); }
        .net-brand-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 18px 0; }
        @media (max-width: 480px) { .net-brand-grid { grid-template-columns: 1fr; } }
        .net-brand-check { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--rule-strong); border-radius: 6px; cursor: pointer; font: 300 15px/1.2 var(--serif); color: var(--fg-soft); }
        .net-brand-check.on { border-color: var(--accent); color: var(--fg); background: var(--surface-soft); }
        /* Dimmed, not hidden, while the "everything" switch is on — a distributor
           should still be able to read what they'd be picking from. */
        .net-brand-check.off { opacity: .45; cursor: not-allowed; }
        .net-brand-tag.none { color: var(--fg-mute); border-style: dashed; font-style: italic; }
        .net-all-toggle { display: flex; align-items: center; gap: 10px; padding: 12px 14px; margin: 16px 0 4px; border: 1px solid var(--rule-strong); border-radius: 6px; cursor: pointer; font: 400 14px/1.2 var(--sans); color: var(--fg-soft); }
        .net-all-toggle.on { border-color: var(--accent); color: var(--fg); background: var(--surface-soft); }
        .net-page-grid { display: grid; grid-template-columns: 1fr; gap: 10px; margin: 18px 0; }
        .net-page-desc { display: block; margin-top: 4px; font: 300 13px/1.4 var(--serif); color: var(--fg-mute); }
        .net-modal-actions { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; margin-top: 8px; }
      `}</style>
    </div>
  );
}

/* ── Master-detail plumbing ───────────────────────────────────────────── */

/**
 * Which rows are open, keyed by org/user id.
 *
 * The wide reports used to put every column on the row and let the wrapper
 * scroll sideways. On the admin's own console that meant an 11-column shops
 * table laid out at ~1470px inside a 1080px page: the last columns — Brands,
 * Pages, Joined — sat off the right edge with no scrollbar drawn over them, so
 * the data was not hidden by design, it was just invisible. Splitting the row
 * into "what you scan" and "what you open" is what makes it fit at all.
 */
function useExpandedRows() {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  return { expanded, toggle };
}

function ExpandButton({ open, onToggle, label }: { open: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      className="net-expand"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={open ? `Hide details for ${label}` : `Show details for ${label}`}
    >
      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="m9 6 6 6-6 6" />
      </svg>
    </button>
  );
}

/** One labelled fact inside an opened row. */
function DetailField({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "net-detail-field is-wide" : "net-detail-field"}>
      <span className="net-detail-label">{label}</span>
      <span className="net-detail-value">{children}</span>
    </div>
  );
}

/* ── Access tags ──────────────────────────────────────────────────────── */

/**
 * One shop's grant, as tags.
 *
 * The whole point is that an EMPTY list renders differently depending on
 * `restricted`: unrestricted means "everything", restricted-and-empty means
 * "nothing". Those are opposite states that both arrive as `[]`, and showing them
 * identically is what let a distributor believe they had revoked a shop's access
 * when they had in fact granted it the lot.
 */
function AccessTags({
  items,
  restricted,
  allLabel,
  noneLabel,
}: {
  items: string[];
  restricted: boolean;
  allLabel: string;
  noneLabel: string;
}) {
  if (!restricted) return <span className="net-brand-tag all">{allLabel}</span>;
  if (items.length === 0) return <span className="net-brand-tag none">{noneLabel}</span>;
  return <>{items.map((t) => <span key={t} className="net-brand-tag">{t}</span>)}</>;
}

/* ── Tree ─────────────────────────────────────────────────────────────── */

function Tree({ roots, accessFor }: { roots: NetworkNode[]; accessFor: (n: NetworkNode) => ShopAccess }) {
  if (roots.length === 0) {
    return <p className="net-empty">Nothing in the network yet — create the first account above.</p>;
  }
  return (
    <div className="net-branch">
      {roots.map((n) => <TreeNode key={n.orgId ?? n.userId ?? n.email ?? n.name} node={n} accessFor={accessFor} />)}
    </div>
  );
}

function TreeNode({ node, accessFor }: { node: NetworkNode; accessFor: (n: NetworkNode) => ShopAccess }) {
  const roleClass =
    node.role === "DISTRIBUTOR" ? "distributor"
      : node.role === "RETAILER" ? "retailer"
        : node.role === "CUSTOMER" ? "customer"
          : "painter";
  const access = node.role === "RETAILER" ? accessFor(node) : null;
  return (
    <div className="net-branch">
      <div className="net-node">
        <span className={`net-chip ${roleClass}`}>{ROLE_LABEL[node.role] ?? node.role}</span>
        {/* An org-backed node (distributor / shop) leads with the company and
            credits the owner beside it; a painter or customer IS the person, so
            their name is the heading and only the contact follows. */}
        {node.orgName ? (
          <>
            <span style={{ font: "500 16px/1.3 var(--serif)", color: "var(--fg)" }}>{node.orgName}</span>
            <span style={{ font: "300 14px/1.3 var(--serif)", color: "var(--fg-soft)" }}>
              <OwnerIdentity node={node} />
            </span>
          </>
        ) : (
          <>
            <span style={{ font: "500 16px/1.3 var(--serif)", color: "var(--fg)" }}>
              {isDeletedAccount(node) ? "Account removed" : node.name}
            </span>
            {!isDeletedAccount(node) && node.email && <Mono>{node.email}</Mono>}
          </>
        )}
        {node.house && (
          <span
            title="HueVista's own distributor — it carries every shop no partner distributor brought in, so it is a branch of the tree but not a distributor account."
            style={{ font: "500 12px/1 var(--sans)", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--accent-text)", border: "1px solid var(--rule-brass)", borderRadius: 4, padding: "3px 6px" }}
          >
            ours
          </span>
        )}
        {(node.city || node.state) && (
          <span style={{ font: "300 14px/1.3 var(--serif)", color: "var(--fg-mute)" }}>
            {[node.city, node.state].filter(Boolean).join(", ")}
          </span>
        )}
        <span style={{ marginLeft: "auto", font: "400 12px/1 var(--mono)", color: "var(--fg-mute)", whiteSpace: "nowrap" }}>
          {node.role === "DISTRIBUTOR" && (
            <>{node.retailerCount} shops · {node.painterCount} painters · {node.customerCount} customers</>
          )}
          {node.role === "RETAILER" && (
            <>{node.painterCount} painters · {node.customerCount} customers · {node.codesRedeemed}/{node.codesIssued} codes</>
          )}
          {node.role === "PAINTER" && <>joined {formatDate(node.joinedAt)}</>}
          {node.role === "CUSTOMER" && (
            <>
              {usageLabel(node)} projects
              {node.accessExpiresAt && (
                <>{" · "}{isLapsed(node.accessExpiresAt) ? "lapsed" : `until ${formatDate(node.accessExpiresAt)}`}</>
              )}
            </>
          )}
        </span>
        {node.role === "RETAILER" && access && (
          <div className="net-brands" style={{ flexBasis: "100%", marginTop: 4 }}>
            <AccessTags
              items={access.brands}
              restricted={access.brandsRestricted}
              allLabel="All brands"
              noneLabel="No brands"
            />
            <AccessTags
              items={access.features}
              restricted={access.featuresRestricted}
              allLabel="All pages"
              noneLabel="No pages"
            />
          </div>
        )}
      </div>
      {node.children.length > 0 && (
        <div className="net-children">
          {node.children.map((c) => <TreeNode key={c.orgId ?? c.userId ?? c.email ?? c.name} node={c} accessFor={accessFor} />)}
        </div>
      )}
    </div>
  );
}

/* ── Flat tables ──────────────────────────────────────────────────────── */

function DistributorTable({ rows }: { rows: FlatRow[] }) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState(ALL);
  const { expanded, toggle } = useExpandedRows();

  const stateOptions = useMemo(() => facetOptionsFrom(rows, (r) => r.node.state), [rows]);

  const filtered = useMemo(
    () =>
      rows.filter(({ node }) => {
        if (state !== ALL && node.state !== state) return false;
        return matchesQuery(query, node.orgName, node.name, node.email, node.phone, node.city, node.state);
      }),
    [rows, query, state],
  );

  if (rows.length === 0) return <p className="net-empty">No distributors yet — create one above.</p>;
  return (
    <>
      <FilterBar
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder="Search company, owner, e-mail, city"
        facets={[
          { id: "state", label: "State", options: stateOptions, value: state, onChange: setState, allLabel: "All states" },
        ]}
        shown={filtered.length}
        total={rows.length}
        noun="distributor"
      />
      {filtered.length === 0 ? (
        <p className="net-empty">No distributor matches these filters.</p>
      ) : (
    <div className="net-table-wrap">
      <table className="net-table">
        <thead>
          <tr>
            <th className="net-col-expand"><span className="sr-only">Expand</span></th>
            <th>Company</th>
            <th className="net-col-num">Shops</th>
            <th className="net-col-num">Painters</th>
            <th className="net-col-num">Customers</th>
            <th className="net-col-num">Codes used</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(({ node }) => {
            const key = node.orgId ?? node.userId ?? node.email ?? node.name;
            const isOpen = expanded.has(key);
            const title = node.orgName ?? node.name;
            return (
              <Fragment key={key}>
                <tr className={isOpen ? "net-row is-open" : "net-row"}>
                  <td className="net-col-expand">
                    <ExpandButton open={isOpen} onToggle={() => toggle(key)} label={title} />
                  </td>
                  <td className="strong">
                    {node.orgName ?? "—"}
                    <span className="net-cell-sub"><OwnerName node={node} /></span>
                  </td>
                  <td className="net-num">{node.retailerCount}</td>
                  <td className="net-num">{node.painterCount}</td>
                  <td className="net-num">{node.customerCount}</td>
                  <td className="net-num">{node.codesRedeemed} / {node.codesIssued}</td>
                </tr>
                {isOpen && (
                  <tr className="net-detail-row">
                    <td colSpan={6}>
                      <div className="net-detail">
                        <DetailField label="Owner"><OwnerName node={node} /></DetailField>
                        <DetailField label="Contact"><ContactCell node={node} /></DetailField>
                        <DetailField label="Location">
                          {[node.city, node.state].filter(Boolean).join(", ") || "—"}
                        </DetailField>
                        <DetailField label="Joined">{formatDate(node.joinedAt)}</DetailField>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
      )}
    </>
  );
}

function RetailerTable({
  rows,
  showDistributor,
  canManageAccess,
  canMoveShops,
  accessFor,
  onEdit,
}: {
  rows: FlatRow[];
  showDistributor: boolean;
  canManageAccess: boolean;
  accessFor: (n: NetworkNode) => ShopAccess;
  canMoveShops: boolean;
  onEdit: (orgId: string, name: string, kind: EditorKind) => void;
}) {
  const [query, setQuery] = useState("");
  const [company, setCompany] = useState(ALL);
  const [distributor, setDistributor] = useState(ALL);
  const [state, setState] = useState(ALL);
  const { expanded, toggle } = useExpandedRows();

  // Every shop has a distributor now — the house one where no partner brought them
  // in — so "Direct" as a stand-in for "none" is gone. A dash only shows for a row
  // whose parent the report could not resolve.
  const distributorName = (parent: NetworkNode | null) =>
    parent && parent.role === "DISTRIBUTOR" ? (parent.orgName ?? parent.name) : "—";

  /**
   * Company options come from the brands actually assigned across the network.
   * An UNRESTRICTED shop carries the whole catalogue, so it counts towards every
   * company — and gets its own entry so a distributor can isolate them.
   *
   * "Unrestricted" is the flag, not an empty list: a shop restricted to zero
   * brands also has none, and counting it as carrying everything would put it
   * under every company in this filter — the exact inverse of its real access.
   */
  const companyOptions = useMemo<FacetOption[]>(() => {
    const unrestricted = rows.filter(({ node }) => !accessFor(node).brandsRestricted).length;
    const options = facetOptionsFrom(rows, ({ node }) => accessFor(node).brands).map((o) => ({
      ...o,
      count: (o.count ?? 0) + unrestricted,
    }));
    if (unrestricted > 0) {
      options.push({ value: UNRESTRICTED, label: "All brands (unrestricted)", count: unrestricted });
    }
    return options;
  }, [rows, accessFor]);

  const distributorOptions = useMemo(
    () => facetOptionsFrom(rows, ({ parent }) => distributorName(parent)),
    [rows],
  );
  const stateOptions = useMemo(() => facetOptionsFrom(rows, ({ node }) => node.state), [rows]);

  const filtered = useMemo(
    () =>
      rows.filter(({ node, parent }) => {
        const { brands, brandsRestricted } = accessFor(node);
        if (company === UNRESTRICTED) {
          if (brandsRestricted) return false;
        } else if (company !== ALL && brandsRestricted && !brands.includes(company)) {
          return false;
        }
        if (distributor !== ALL && distributorName(parent) !== distributor) return false;
        if (state !== ALL && node.state !== state) return false;
        return matchesQuery(
          query,
          node.orgName,
          node.name,
          node.email,
          node.phone,
          node.city,
          node.state,
          brands.join(" "),
        );
      }),
    [rows, query, company, distributor, state, accessFor],
  );

  if (rows.length === 0) return <p className="net-empty">No shops in this network yet.</p>;

  const facets = [
    { id: "company", label: "Company", options: companyOptions, value: company, onChange: setCompany, allLabel: "All companies" },
    ...(showDistributor
      ? [{ id: "distributor", label: "Distributor", options: distributorOptions, value: distributor, onChange: setDistributor, allLabel: "All distributors" }]
      : []),
    { id: "state", label: "State", options: stateOptions, value: state, onChange: setState, allLabel: "All states" },
  ];

  return (
    <>
      <FilterBar
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder="Search shop, owner, e-mail, city"
        facets={facets}
        shown={filtered.length}
        total={rows.length}
        noun="shop"
      />
      {filtered.length === 0 ? (
        <p className="net-empty">No shop matches these filters.</p>
      ) : (
    <div className="net-table-wrap">
      <table className="net-table">
        <thead>
          <tr>
            <th className="net-col-expand"><span className="sr-only">Expand</span></th>
            <th>Shop</th>
            {showDistributor && <th>Distributor</th>}
            <th className="net-col-num">Painters</th>
            <th className="net-col-num">Customers</th>
            <th className="net-col-num">Codes used</th>
            <th>Access</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(({ node, parent }) => {
            const access = accessFor(node);
            const key = node.orgId ?? node.userId ?? node.email ?? node.name;
            const isOpen = expanded.has(key);
            const title = node.orgName ?? node.name;
            return (
              <Fragment key={key}>
                <tr className={isOpen ? "net-row is-open" : "net-row"}>
                  <td className="net-col-expand">
                    <ExpandButton open={isOpen} onToggle={() => toggle(key)} label={title} />
                  </td>
                  <td className="strong">
                    {node.orgName ?? "—"}
                    <span className="net-cell-sub"><OwnerName node={node} /></span>
                  </td>
                  {showDistributor && (
                    <td>
                      {parent && parent.role === "DISTRIBUTOR" ? (parent.orgName ?? parent.name) : "—"}
                      {parent?.house && <span className="net-cell-sub">ours</span>}
                    </td>
                  )}
                  <td className="net-num">{node.painterCount}</td>
                  <td className="net-num">{node.customerCount}</td>
                  <td className="net-num">{node.codesRedeemed} / {node.codesIssued}</td>
                  <td>
                    <div className="net-brands">
                      <AccessTags
                        items={access.brands}
                        restricted={access.brandsRestricted}
                        allLabel="All brands"
                        noneLabel="No brands"
                      />
                    </div>
                  </td>
                </tr>
                {isOpen && (
                  <tr className="net-detail-row">
                    {/* colSpan follows the header exactly — 6 fixed columns plus
                        the distributor one only an admin sees. */}
                    <td colSpan={showDistributor ? 7 : 6}>
                      <div className="net-detail">
                        <DetailField label="Owner"><OwnerName node={node} /></DetailField>
                        <DetailField label="Contact"><ContactCell node={node} /></DetailField>
                        <DetailField label="Location">
                          {[node.city, node.state].filter(Boolean).join(", ") || "—"}
                        </DetailField>
                        <DetailField label="Joined">{formatDate(node.joinedAt)}</DetailField>
                        <DetailField label="Paint companies" wide>
                          <div className="net-brands">
                            <AccessTags
                              items={access.brands}
                              restricted={access.brandsRestricted}
                              allLabel="All brands"
                              noneLabel="No brands"
                            />
                            {canManageAccess && node.orgId && (
                              <button
                                type="button"
                                className="net-brand-edit"
                                onClick={() => onEdit(node.orgId!, title, "brands")}
                              >
                                Assign brands
                              </button>
                            )}
                          </div>
                        </DetailField>
                        <DetailField label="Pages" wide>
                          <div className="net-brands">
                            <AccessTags
                              items={access.features}
                              restricted={access.featuresRestricted}
                              allLabel="All pages"
                              noneLabel="No pages"
                            />
                            {canManageAccess && node.orgId && (
                              <button
                                type="button"
                                className="net-brand-edit"
                                onClick={() => onEdit(node.orgId!, title, "pages")}
                              >
                                Assign pages
                              </button>
                            )}
                          </div>
                        </DetailField>
                        {canMoveShops && node.orgId && (
                          <DetailField label="Distributor" wide>
                            <button
                              type="button"
                              className="net-brand-edit"
                              onClick={() => onEdit(node.orgId!, title, "distributor")}
                            >
                              Move to another distributor
                            </button>
                          </DetailField>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
      )}
    </>
  );
}


/* ── Page editor ──────────────────────────────────────────────────────── */

/**
 * Distributor/admin editor for one shop's pages.
 *
 * The exact shape of {@link BrandEditor}, deliberately — a distributor learns one
 * control and it works for both halves of the grant. Same three states, same
 * separate "give them everything" switch, same reason for it.
 *
 * The dashboard, account settings and plan pages never appear here: they aren't
 * grantable on the backend either. A shop locked out of its own billing page could
 * never fix a lapsed subscription without an admin.
 */
function FeatureEditor({
  orgId,
  shopName,
  initiallyRestricted,
  onClose,
  onSaved,
}: {
  orgId: string;
  shopName: string;
  initiallyRestricted: boolean;
  onClose: () => void;
  onSaved: (orgId: string, labels: string[], restricted: boolean) => void;
}) {
  const [options, setOptions] = useState<RetailerFeatureOption[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [unrestricted, setUnrestricted] = useState(!initiallyRestricted);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  useEffect(() => {
    let live = true;
    getRetailerFeaturesAction(orgId).then((res) => {
      if (!live) return;
      if (res.error || !res.options) {
        setLoadError(res.error ?? "Could not load this shop's pages.");
        return;
      }
      setOptions(res.options);
      setSelected(new Set(res.options.filter((o) => o.assigned).map((o) => o.key)));
    });
    return () => {
      live = false;
    };
  }, [orgId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const save = () => {
    if (!options) return;
    setError(null);
    const keys = unrestricted ? [] : [...selected];
    startSaving(async () => {
      const res = await setRetailerFeaturesAction(orgId, keys, unrestricted);
      if (res.error || !res.options) {
        setError(res.error ?? "Could not save the page selection.");
        return;
      }
      const labels = res.options.filter((o) => o.assigned).map((o) => o.label);
      onSaved(orgId, unrestricted ? [] : labels, !unrestricted);
    });
  };

  return (
    <div
      className="net-modal-scrim"
      role="dialog"
      aria-modal="true"
      aria-label={`Assign pages for ${shopName}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="net-modal">
        <Mono brass>Assign pages</Mono>
        <h3 className="display" style={{ fontSize: "clamp(22px, 3vw, 30px)", margin: "8px 0 4px" }}>
          {shopName}
        </h3>
        <p style={{ font: "300 15px/1.5 var(--serif)", color: "var(--fg-soft)", margin: "0 0 4px" }}>
          Tick the parts of HueVista this shop can open. Their dashboard, account and plan pages
          always stay available.
        </p>

        <label className={`net-all-toggle${unrestricted ? " on" : ""}`}>
          <input
            type="checkbox"
            checked={unrestricted}
            onChange={(e) => setUnrestricted(e.target.checked)}
            style={{ accentColor: "var(--accent)" }}
          />
          Give this shop the whole product
        </label>

        {loadError ? (
          <p className="field-error" role="alert" style={{ marginTop: 16 }}>{loadError}</p>
        ) : !options ? (
          <p className="net-empty" style={{ marginTop: 16 }}>Loading pages…</p>
        ) : (
          <div className="net-page-grid" aria-disabled={unrestricted}>
            {options.map((o) => {
              const on = !unrestricted && selected.has(o.key);
              return (
                <label
                  key={o.key}
                  className={`net-brand-check${on ? " on" : ""}${unrestricted ? " off" : ""}`}
                  style={{ alignItems: "flex-start" }}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={unrestricted}
                    onChange={() => toggle(o.key)}
                    style={{ accentColor: "var(--accent)", marginTop: 3 }}
                  />
                  <span>
                    {o.label}
                    <span className="net-page-desc">{o.description}</span>
                  </span>
                </label>
              );
            })}
          </div>
        )}

        {error && <p className="field-error" role="alert" style={{ marginBottom: 12 }}>{error}</p>}

        <div className="net-modal-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={save}
            disabled={saving || !options || Boolean(loadError)}
          >
            {saving ? "Saving…" : "Save pages"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Brand editor ─────────────────────────────────────────────────────── */

/**
 * Distributor/admin editor for one shop's paint brands. Loads every brand with
 * its current assigned flag, lets the distributor tick the ones the shop may
 * work with, and saves the whole selection. No ticks = "all brands".
 */
function BrandEditor({
  orgId,
  shopName,
  initiallyRestricted,
  onClose,
  onSaved,
}: {
  orgId: string;
  shopName: string;
  /** Whether the shop is currently limited at all — see the `unrestricted` note below. */
  initiallyRestricted: boolean;
  onClose: () => void;
  onSaved: (orgId: string, names: string[], restricted: boolean) => void;
}) {
  const [options, setOptions] = useState<RetailerBrandOption[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  // "Give them everything" is its own switch, NOT "tick nothing". Unticking every
  // box used to be the only way to express it, which made revoking a shop's last
  // brand indistinguishable from handing them the whole catalogue — so the two
  // are separate controls and the checklist is disabled while this is on.
  const [unrestricted, setUnrestricted] = useState(!initiallyRestricted);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  useEffect(() => {
    let live = true;
    getRetailerBrandsAction(orgId).then((res) => {
      if (!live) return;
      if (res.error || !res.options) {
        setLoadError(res.error ?? "Could not load this shop's brands.");
        return;
      }
      setOptions(res.options);
      setSelected(new Set(res.options.filter((o) => o.assigned).map((o) => o.id)));
    });
    return () => {
      live = false;
    };
  }, [orgId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = () => {
    if (!options) return;
    setError(null);
    const ids = unrestricted ? [] : [...selected];
    startSaving(async () => {
      const res = await setRetailerBrandsAction(orgId, ids, unrestricted);
      if (res.error || !res.options) {
        setError(res.error ?? "Could not save the brand selection.");
        return;
      }
      const names = res.options.filter((o) => o.assigned).map((o) => o.name);
      onSaved(orgId, unrestricted ? [] : names, !unrestricted);
    });
  };

  return (
    <div
      className="net-modal-scrim"
      role="dialog"
      aria-modal="true"
      aria-label={`Assign brands for ${shopName}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="net-modal">
        <Mono brass>Assign brands</Mono>
        <h3 className="display" style={{ fontSize: "clamp(22px, 3vw, 30px)", margin: "8px 0 4px" }}>
          {shopName}
        </h3>
        <p style={{ font: "300 15px/1.5 var(--serif)", color: "var(--fg-soft)", margin: "0 0 4px" }}>
          Tick the paint companies this shop can work with — they&apos;ll only see shades from these
          in the catalogue, the studio and the colour finder.
        </p>

        <label className={`net-all-toggle${unrestricted ? " on" : ""}`}>
          <input
            type="checkbox"
            checked={unrestricted}
            onChange={(e) => setUnrestricted(e.target.checked)}
            style={{ accentColor: "var(--accent)" }}
          />
          Give this shop every paint company
        </label>

        {loadError ? (
          <p className="field-error" role="alert" style={{ marginTop: 16 }}>{loadError}</p>
        ) : !options ? (
          <p className="net-empty" style={{ marginTop: 16 }}>Loading brands…</p>
        ) : options.length === 0 ? (
          <p className="net-empty" style={{ marginTop: 16 }}>No brands in the catalogue yet.</p>
        ) : (
          <div className="net-brand-grid" aria-disabled={unrestricted}>
            {options.map((o) => {
              const on = !unrestricted && selected.has(o.id);
              return (
                <label
                  key={o.id}
                  className={`net-brand-check${on ? " on" : ""}${unrestricted ? " off" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={unrestricted}
                    onChange={() => toggle(o.id)}
                    style={{ accentColor: "var(--accent)" }}
                  />
                  {o.name}
                </label>
              );
            })}
          </div>
        )}

        {error && <p className="field-error" role="alert" style={{ marginBottom: 12 }}>{error}</p>}

        <div className="net-modal-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn btn-sm" onClick={save} disabled={saving || !options || Boolean(loadError)}>
            {saving ? "Saving…" : "Save brands"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Customers ────────────────────────────────────────────────────────── */

/**
 * The end of the chain: every walk-in a shop signed up, with the shop and the
 * distributor above them.
 *
 * Customers were only ever a code count on the shop's row — which says how many
 * codes were handed out, not who holds one or whether it did anything. Two shops
 * with "40 issued" can be a busy counter and a stack of dead codes, and the
 * report gave no way to tell them apart. Reading the projects column does: a
 * customer at 0 / 1 redeemed a code and never came back.
 */
function CustomerTable({
  rows,
  showDistributor,
}: {
  rows: CustomerRow[];
  showDistributor: boolean;
}) {
  const [query, setQuery] = useState("");
  const [distributor, setDistributor] = useState(ALL);
  const [shop, setShop] = useState(ALL);
  const [activity, setActivity] = useState(ALL);

  const shopName = (r: CustomerRow) => (r.shop ? (r.shop.orgName ?? r.shop.name) : "—");
  const distributorName = (r: CustomerRow) =>
    r.distributor ? (r.distributor.orgName ?? r.distributor.name) : "—";

  const distributorOptions = useMemo(() => facetOptionsFrom(rows, distributorName), [rows]);
  // Shop options follow the distributor filter, so picking a distributor narrows
  // the shop list to theirs instead of leaving every shop on the platform in it.
  const shopOptions = useMemo(
    () =>
      facetOptionsFrom(
        distributor === ALL ? rows : rows.filter((r) => distributorName(r) === distributor),
        shopName,
      ),
    [rows, distributor],
  );

  /** The three states worth separating: never started, working, out of access. */
  const activityOf = (r: CustomerRow): string => {
    if (isLapsed(r.node.accessExpiresAt)) return "Lapsed";
    return (r.node.projectsUsed ?? 0) > 0 ? "Active" : "Not started";
  };
  const activityOptions = useMemo(() => facetOptionsFrom(rows, activityOf), [rows]);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (distributor !== ALL && distributorName(r) !== distributor) return false;
        if (shop !== ALL && shopName(r) !== shop) return false;
        if (activity !== ALL && activityOf(r) !== activity) return false;
        return matchesQuery(query, r.node.name, r.node.email, r.node.phone, shopName(r), distributorName(r));
      }),
    [rows, query, distributor, shop, activity],
  );

  if (rows.length === 0) {
    return (
      <p className="net-empty">
        No customers yet. They appear here once someone redeems a shop&apos;s access code.
      </p>
    );
  }

  return (
    <>
      <FilterBar
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder="Search customers, shops, distributors…"
        shown={filtered.length}
        total={rows.length}
        noun="customer"
        facets={[
          ...(showDistributor
            ? [{ id: "distributor", label: "Distributor", value: distributor, onChange: setDistributor, options: distributorOptions }]
            : []),
          { id: "shop", label: "Shop", value: shop, onChange: setShop, options: shopOptions },
          { id: "activity", label: "Activity", value: activity, onChange: setActivity, options: activityOptions },
        ]}
      />
      {filtered.length === 0 ? (
        <p className="net-empty">No customers match those filters.</p>
      ) : (
        <div className="net-table-wrap">
          <table className="net-table">
            <thead>
              <tr>
                <th>Customer</th><th>Contact</th><th>Shop</th>
                {showDistributor && <th>Distributor</th>}
                <th>Projects used</th><th>Access until</th><th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const lapsed = isLapsed(r.node.accessExpiresAt);
                return (
                  <tr key={r.node.userId ?? `${shopName(r)}-${r.node.name}`}>
                    <td className="strong">{isDeletedAccount(r.node) ? "Account removed" : r.node.name}</td>
                    <td>
                      {/* An account created by redeeming a code has no real address —
                          the stored one is synthesised from the code, and the backend
                          withholds it rather than present a machine id as a contact. */}
                      <ContactCell node={r.node} />
                    </td>
                    <td>{shopName(r)}</td>
                    {showDistributor && <td>{distributorName(r)}</td>}
                    <td
                      className="net-num"
                      title="Projects used of the allowance their shop gave them. Deleting a project does not give the slot back."
                    >
                      {usageLabel(r.node)}
                    </td>
                    <td style={lapsed ? { color: "var(--fg-mute)" } : undefined}>
                      {formatDate(r.node.accessExpiresAt)}
                      {lapsed && (
                        <>
                          <br />
                          <span style={{ font: "400 12px/1 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase" }}>
                            lapsed
                          </span>
                        </>
                      )}
                    </td>
                    <td>{formatDate(r.node.joinedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* ── Move a shop to another distributor ───────────────────────────────── */

/**
 * ADMIN-only editor for which distributor a shop belongs under.
 *
 * The distributor picked when a shop was created used to be permanent: the
 * distributor-facing link endpoint demands ownership of both organizations, which
 * an admin never has, so a shop filed under the wrong one — or one that changed
 * supplier — was stuck there forever.
 *
 * Reloads the page on success rather than patching the row: moving a shop changes
 * its position in the tree, its old distributor's counts and its access tags, and
 * stitching all of that locally would be three chances to show something the server
 * no longer agrees with.
 */
function MoveShopEditor({
  orgId,
  shopName,
  onClose,
}: {
  orgId: string;
  shopName: string;
  onClose: () => void;
}) {
  const [options, setOptions] = useState<DistributorOption[] | null>(null);
  const [choice, setChoice] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  useEffect(() => {
    let live = true;
    listDistributorsAction().then((res) => {
      if (!live) return;
      if (res.error || !res.options) {
        setLoadError(res.error ?? "Could not load the distributors.");
        return;
      }
      setOptions(res.options);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = () => {
    setError(null);
    startSaving(async () => {
      const res = await moveShopDistributorAction(orgId, choice || undefined);
      if (res.error) {
        setError(res.error);
        return;
      }
      window.location.reload();
    });
  };

  return (
    <div
      className="net-modal-scrim"
      role="dialog"
      aria-modal="true"
      aria-label={`Move ${shopName} to another distributor`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="net-modal">
        <Mono brass>Move shop</Mono>
        <h3 className="display" style={{ fontSize: "clamp(22px, 3vw, 30px)", margin: "8px 0 4px" }}>
          {shopName}
        </h3>
        <p style={{ font: "300 15px/1.5 var(--serif)", color: "var(--fg-soft)", margin: "0 0 16px" }}>
          Choose the distributor this shop belongs under. It moves into their network and out of
          the previous one&apos;s — and the paint companies and pages the old distributor had
          granted are cleared, because those were theirs to decide and the new one never chose
          them. The shop opens with everything until its new distributor narrows it.
        </p>

        {loadError ? (
          <p className="field-error" role="alert">{loadError}</p>
        ) : !options ? (
          <p className="net-empty">Loading distributors…</p>
        ) : (
          <div className="field">
            <label className="field-label" htmlFor="move-distributor">Distributor</label>
            <select
              id="move-distributor"
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
            >
              {options.map((d) => (
                <option key={d.orgId} value={d.house ? "" : d.orgId}>
                  {d.house ? `${d.name} — ours` : d.name}
                  {d.city ? ` · ${d.city}` : ""}
                  {` · ${d.shopCount} shop${d.shopCount === 1 ? "" : "s"}`}
                </option>
              ))}
            </select>
          </div>
        )}

        {error && <p className="field-error" role="alert" style={{ marginTop: 12 }}>{error}</p>}

        <div className="net-modal-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={save}
            disabled={saving || !options || Boolean(loadError)}
          >
            {saving ? "Moving…" : "Move shop"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PainterTable({ rows }: { rows: FlatRow[] }) {
  const [query, setQuery] = useState("");
  const [shop, setShop] = useState(ALL);

  const shopName = (parent: NetworkNode | null) => (parent ? (parent.orgName ?? parent.name) : "");
  const shopOptions = useMemo(() => facetOptionsFrom(rows, ({ parent }) => shopName(parent)), [rows]);

  const filtered = useMemo(
    () =>
      rows.filter(({ node, parent }) => {
        if (shop !== ALL && shopName(parent) !== shop) return false;
        return matchesQuery(query, node.name, node.email, node.phone, shopName(parent));
      }),
    [rows, query, shop],
  );

  if (rows.length === 0) return <p className="net-empty">No painters in this network yet.</p>;
  return (
    <>
      <FilterBar
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder="Search painter, e-mail, shop"
        facets={[
          { id: "shop", label: "Shop", options: shopOptions, value: shop, onChange: setShop, allLabel: "All shops" },
        ]}
        shown={filtered.length}
        total={rows.length}
        noun="painter"
      />
      {filtered.length === 0 ? (
        <p className="net-empty">No painter matches these filters.</p>
      ) : (
    <div className="net-table-wrap">
      <table className="net-table">
        <thead>
          <tr><th>Painter</th><th>Contact</th><th>Shop</th><th>Joined</th></tr>
        </thead>
        <tbody>
          {filtered.map(({ node, parent }, i) => (
            <tr key={node.userId ?? node.email ?? i}>
              <td className="strong">{isDeletedAccount(node) ? "Account removed" : node.name}</td>
              <td><ContactCell node={node} /></td>
              <td>{parent ? (parent.orgName ?? parent.name) : "—"}</td>
              <td>{formatDate(node.joinedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
      )}
    </>
  );
}
