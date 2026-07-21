"use client";

import { useMemo, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import type { NetworkNode, NetworkReport, UserRole } from "@/lib/types";

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
};

type FlatRow = { node: NetworkNode; parent: NetworkNode | null };

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

/**
 * The role-scoped network report: headline totals, the downline tree, and flat
 * per-role tables (distributors / shops / painters) — one place to read the
 * whole admin → distributor → retailer → painter chain.
 */
export function NetworkReportView({ report }: NetworkReportViewProps) {
  const distributors = useMemo(() => (report ? collectByRole(report.roots, "DISTRIBUTOR") : []), [report]);
  const retailers = useMemo(() => (report ? collectByRole(report.roots, "RETAILER") : []), [report]);
  const painters = useMemo(() => (report ? collectByRole(report.roots, "PAINTER") : []), [report]);

  const tabs = useMemo(() => {
    if (!report) return [];
    const t: { id: string; label: string }[] = [];
    if (report.viewerRole !== "RETAILER") t.push({ id: "tree", label: "Network tree" });
    if (report.viewerRole === "ADMIN") t.push({ id: "distributors", label: `Distributors · ${distributors.length}` });
    if (report.viewerRole !== "RETAILER") t.push({ id: "retailers", label: `Shops · ${retailers.length}` });
    t.push({ id: "painters", label: `Painters · ${painters.length}` });
    return t;
  }, [report, distributors.length, retailers.length, painters.length]);

  const [tab, setTab] = useState<string | null>(null);
  const activeTab = tab ?? tabs[0]?.id ?? "painters";

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

      {activeTab === "tree" && <Tree roots={report.roots} />}
      {activeTab === "distributors" && <DistributorTable rows={distributors} />}
      {activeTab === "retailers" && <RetailerTable rows={retailers} showDistributor={report.viewerRole === "ADMIN"} />}
      {activeTab === "painters" && <PainterTable rows={painters} />}

      <style>{`
        .net-totals { display: flex; flex-wrap: wrap; gap: 14px; margin-bottom: 32px; }
        .net-tile { border: 1px solid var(--rule-strong); background: var(--surface-soft); border-radius: 8px; padding: 16px 22px; display: flex; flex-direction: column; gap: 8px; min-width: 128px; }
        .net-tile-num { font: 300 32px/1 var(--serif); color: var(--fg); font-variant-numeric: tabular-nums; }
        .net-tile-label { font: 400 10px/1 var(--mono); letter-spacing: .22em; text-transform: uppercase; color: var(--fg-mute); }
        .net-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px; border-bottom: 1px solid var(--rule); padding-bottom: 12px; }
        .net-tab { background: transparent; border: 1px solid transparent; border-radius: 6px; padding: 10px 14px; cursor: pointer; color: var(--fg-mute); font: 400 11px/1 var(--mono); letter-spacing: .22em; text-transform: uppercase; transition: color .2s, border-color .2s; }
        .net-tab.active, .net-tab:hover { color: var(--fg); border-color: var(--rule-strong); }
        .net-table-wrap { overflow-x: auto; border: 1px solid var(--rule-strong); border-radius: 8px; }
        .net-table { width: 100%; border-collapse: collapse; min-width: 640px; }
        .net-table th { text-align: left; font: 400 10px/1 var(--mono); letter-spacing: .22em; text-transform: uppercase; color: var(--fg-mute); padding: 14px 16px; border-bottom: 1px solid var(--rule-strong); background: var(--surface-soft); white-space: nowrap; }
        .net-table td { font: 300 15px/1.4 var(--serif); color: var(--fg-soft); padding: 13px 16px; border-bottom: 1px solid var(--rule); vertical-align: top; }
        .net-table tr:last-child td { border-bottom: none; }
        .net-table .strong { font-weight: 500; color: var(--fg); }
        .net-num { font-variant-numeric: tabular-nums; }
        .net-empty { font: 300 17px/1.6 var(--serif); color: var(--fg-mute); }
        .net-node { border: 1px solid var(--rule-strong); background: var(--surface-soft); border-radius: 8px; padding: 12px 16px; display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 16px; }
        .net-branch { display: flex; flex-direction: column; gap: 10px; }
        .net-children { display: flex; flex-direction: column; gap: 10px; margin-left: 26px; padding-left: 16px; border-left: 1px solid var(--rule-strong); }
        .net-chip { font: 400 9px/1 var(--mono); letter-spacing: .2em; text-transform: uppercase; padding: 5px 8px; border-radius: 4px; border: 1px solid var(--rule-strong); color: var(--fg-mute); white-space: nowrap; }
        .net-chip.distributor { color: var(--accent-soft); border-color: var(--accent-soft); }
        .net-chip.retailer { color: var(--fg-soft); }
      `}</style>
    </div>
  );
}

/* ── Tree ─────────────────────────────────────────────────────────────── */

function Tree({ roots }: { roots: NetworkNode[] }) {
  if (roots.length === 0) {
    return <p className="net-empty">Nothing in the network yet — create the first account above.</p>;
  }
  return (
    <div className="net-branch">
      {roots.map((n) => <TreeNode key={n.orgId ?? n.userId ?? n.email ?? n.name} node={n} />)}
    </div>
  );
}

function TreeNode({ node }: { node: NetworkNode }) {
  const roleClass = node.role === "DISTRIBUTOR" ? "distributor" : node.role === "RETAILER" ? "retailer" : "painter";
  return (
    <div className="net-branch">
      <div className="net-node">
        <span className={`net-chip ${roleClass}`}>{ROLE_LABEL[node.role] ?? node.role}</span>
        <span style={{ font: "500 16px/1.3 var(--serif)", color: "var(--fg)" }}>
          {node.orgName ?? node.name}
        </span>
        {node.orgName && (
          <span style={{ font: "300 14px/1.3 var(--serif)", color: "var(--fg-soft)" }}>{node.name}</span>
        )}
        {node.email && <Mono>{node.email}</Mono>}
        {(node.city || node.state) && (
          <span style={{ font: "300 14px/1.3 var(--serif)", color: "var(--fg-mute)" }}>
            {[node.city, node.state].filter(Boolean).join(", ")}
          </span>
        )}
        <span style={{ marginLeft: "auto", font: "400 11px/1 var(--mono)", color: "var(--fg-mute)", whiteSpace: "nowrap" }}>
          {node.role === "DISTRIBUTOR" && <>{node.retailerCount} shops · {node.painterCount} painters</>}
          {node.role === "RETAILER" && <>{node.painterCount} painters · {node.codesRedeemed}/{node.codesIssued} codes</>}
          {node.role === "PAINTER" && <>joined {formatDate(node.joinedAt)}</>}
        </span>
      </div>
      {node.children.length > 0 && (
        <div className="net-children">
          {node.children.map((c) => <TreeNode key={c.orgId ?? c.userId ?? c.email ?? c.name} node={c} />)}
        </div>
      )}
    </div>
  );
}

/* ── Flat tables ──────────────────────────────────────────────────────── */

function DistributorTable({ rows }: { rows: FlatRow[] }) {
  if (rows.length === 0) return <p className="net-empty">No distributors yet — create one above.</p>;
  return (
    <div className="net-table-wrap">
      <table className="net-table">
        <thead>
          <tr>
            <th>Company</th><th>Owner</th><th>Contact</th><th>Location</th>
            <th>Shops</th><th>Painters</th><th>Codes used</th><th>Joined</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ node }) => (
            <tr key={node.orgId ?? node.userId ?? node.email}>
              <td className="strong">{node.orgName ?? "—"}</td>
              <td>{node.name}</td>
              <td><Mono>{node.email}</Mono>{node.phone ? <><br /><Mono>{node.phone}</Mono></> : null}</td>
              <td>{[node.city, node.state].filter(Boolean).join(", ") || "—"}</td>
              <td className="net-num">{node.retailerCount}</td>
              <td className="net-num">{node.painterCount}</td>
              <td className="net-num">{node.codesRedeemed} / {node.codesIssued}</td>
              <td>{formatDate(node.joinedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RetailerTable({ rows, showDistributor }: { rows: FlatRow[]; showDistributor: boolean }) {
  if (rows.length === 0) return <p className="net-empty">No shops in this network yet.</p>;
  return (
    <div className="net-table-wrap">
      <table className="net-table">
        <thead>
          <tr>
            <th>Shop</th><th>Owner</th><th>Contact</th><th>Location</th>
            {showDistributor && <th>Distributor</th>}
            <th>Painters</th><th>Codes used</th><th>Joined</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ node, parent }) => (
            <tr key={node.orgId ?? node.userId ?? node.email}>
              <td className="strong">{node.orgName ?? "—"}</td>
              <td>{node.name}</td>
              <td><Mono>{node.email}</Mono>{node.phone ? <><br /><Mono>{node.phone}</Mono></> : null}</td>
              <td>{[node.city, node.state].filter(Boolean).join(", ") || "—"}</td>
              {showDistributor && (
                <td>{parent && parent.role === "DISTRIBUTOR" ? (parent.orgName ?? parent.name) : "Direct"}</td>
              )}
              <td className="net-num">{node.painterCount}</td>
              <td className="net-num">{node.codesRedeemed} / {node.codesIssued}</td>
              <td>{formatDate(node.joinedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PainterTable({ rows }: { rows: FlatRow[] }) {
  if (rows.length === 0) return <p className="net-empty">No painters in this network yet.</p>;
  return (
    <div className="net-table-wrap">
      <table className="net-table">
        <thead>
          <tr><th>Painter</th><th>Contact</th><th>Shop</th><th>Joined</th></tr>
        </thead>
        <tbody>
          {rows.map(({ node, parent }, i) => (
            <tr key={node.userId ?? node.email ?? i}>
              <td className="strong">{node.name}</td>
              <td><Mono>{node.email}</Mono>{node.phone ? <><br /><Mono>{node.phone}</Mono></> : null}</td>
              <td>{parent ? (parent.orgName ?? parent.name) : "—"}</td>
              <td>{formatDate(node.joinedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
