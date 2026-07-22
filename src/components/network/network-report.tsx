"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { getRetailerBrandsAction, setRetailerBrandsAction } from "@/lib/auth";
import type { NetworkNode, NetworkReport, RetailerBrandOption, UserRole } from "@/lib/types";

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

  // A distributor/admin can grant paint brands to each shop. Edits are saved
  // through the shop's org id; we keep local overrides so a row reflects the
  // new selection immediately without re-fetching the whole report.
  const canManageBrands = report?.viewerRole === "DISTRIBUTOR" || report?.viewerRole === "ADMIN";
  const [brandOverrides, setBrandOverrides] = useState<Record<string, string[]>>({});
  const [editingShop, setEditingShop] = useState<{ orgId: string; name: string } | null>(null);
  const brandsFor = (node: NetworkNode): string[] =>
    node.orgId && brandOverrides[node.orgId] !== undefined
      ? brandOverrides[node.orgId]!
      : node.assignedBrands ?? [];

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

      {activeTab === "tree" && <Tree roots={report.roots} brandsFor={brandsFor} />}
      {activeTab === "distributors" && <DistributorTable rows={distributors} />}
      {activeTab === "retailers" && (
        <RetailerTable
          rows={retailers}
          showDistributor={report.viewerRole === "ADMIN"}
          canManageBrands={canManageBrands}
          brandsFor={brandsFor}
          onEditBrands={(orgId, name) => setEditingShop({ orgId, name })}
        />
      )}
      {activeTab === "painters" && <PainterTable rows={painters} />}

      {editingShop && (
        <BrandEditor
          orgId={editingShop.orgId}
          shopName={editingShop.name}
          onClose={() => setEditingShop(null)}
          onSaved={(orgId, names) => {
            setBrandOverrides((prev) => ({ ...prev, [orgId]: names }));
            setEditingShop(null);
          }}
        />
      )}

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
        .net-brands { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
        .net-brand-tag { font: 400 10px/1 var(--mono); letter-spacing: .12em; text-transform: uppercase; padding: 5px 8px; border-radius: 4px; border: 1px solid var(--rule-strong); color: var(--fg-soft); background: var(--surface); white-space: nowrap; }
        .net-brand-tag.all { color: var(--fg-mute); border-style: dashed; }
        .net-brand-edit { font: 400 10px/1 var(--mono); letter-spacing: .16em; text-transform: uppercase; padding: 6px 10px; border-radius: 4px; border: 1px solid var(--rule-strong); background: transparent; color: var(--accent); cursor: pointer; white-space: nowrap; }
        .net-brand-edit:hover { border-color: var(--accent); }
        .net-modal-scrim { position: fixed; inset: 0; z-index: 200; background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; padding: 20px; }
        .net-modal { background: var(--surface); border: 1px solid var(--rule-strong); border-radius: 12px; width: min(480px, 100%); max-height: 85vh; overflow-y: auto; padding: 24px; box-shadow: 0 24px 60px -20px rgba(0,0,0,.6); }
        .net-brand-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 18px 0; }
        @media (max-width: 480px) { .net-brand-grid { grid-template-columns: 1fr; } }
        .net-brand-check { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--rule-strong); border-radius: 6px; cursor: pointer; font: 300 15px/1.2 var(--serif); color: var(--fg-soft); }
        .net-brand-check.on { border-color: var(--accent); color: var(--fg); background: var(--surface-soft); }
        .net-modal-actions { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; margin-top: 8px; }
      `}</style>
    </div>
  );
}

/* ── Tree ─────────────────────────────────────────────────────────────── */

function Tree({ roots, brandsFor }: { roots: NetworkNode[]; brandsFor: (n: NetworkNode) => string[] }) {
  if (roots.length === 0) {
    return <p className="net-empty">Nothing in the network yet — create the first account above.</p>;
  }
  return (
    <div className="net-branch">
      {roots.map((n) => <TreeNode key={n.orgId ?? n.userId ?? n.email ?? n.name} node={n} brandsFor={brandsFor} />)}
    </div>
  );
}

function TreeNode({ node, brandsFor }: { node: NetworkNode; brandsFor: (n: NetworkNode) => string[] }) {
  const roleClass = node.role === "DISTRIBUTOR" ? "distributor" : node.role === "RETAILER" ? "retailer" : "painter";
  const brands = node.role === "RETAILER" ? brandsFor(node) : [];
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
        {node.role === "RETAILER" && (
          <div className="net-brands" style={{ flexBasis: "100%", marginTop: 4 }}>
            {brands.length === 0 ? (
              <span className="net-brand-tag all">All brands</span>
            ) : (
              brands.map((b) => <span key={b} className="net-brand-tag">{b}</span>)
            )}
          </div>
        )}
      </div>
      {node.children.length > 0 && (
        <div className="net-children">
          {node.children.map((c) => <TreeNode key={c.orgId ?? c.userId ?? c.email ?? c.name} node={c} brandsFor={brandsFor} />)}
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

function RetailerTable({
  rows,
  showDistributor,
  canManageBrands,
  brandsFor,
  onEditBrands,
}: {
  rows: FlatRow[];
  showDistributor: boolean;
  canManageBrands: boolean;
  brandsFor: (n: NetworkNode) => string[];
  onEditBrands: (orgId: string, name: string) => void;
}) {
  if (rows.length === 0) return <p className="net-empty">No shops in this network yet.</p>;
  return (
    <div className="net-table-wrap">
      <table className="net-table">
        <thead>
          <tr>
            <th>Shop</th><th>Owner</th><th>Contact</th><th>Location</th>
            {showDistributor && <th>Distributor</th>}
            <th>Painters</th><th>Codes used</th><th>Brands</th><th>Joined</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ node, parent }) => {
            const brands = brandsFor(node);
            return (
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
                <td>
                  <div className="net-brands" style={{ marginBottom: canManageBrands ? 8 : 0 }}>
                    {brands.length === 0 ? (
                      <span className="net-brand-tag all">All brands</span>
                    ) : (
                      brands.map((b) => <span key={b} className="net-brand-tag">{b}</span>)
                    )}
                  </div>
                  {canManageBrands && node.orgId && (
                    <button
                      type="button"
                      className="net-brand-edit"
                      onClick={() => onEditBrands(node.orgId!, node.orgName ?? node.name)}
                    >
                      Assign brands
                    </button>
                  )}
                </td>
                <td>{formatDate(node.joinedAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
  onClose,
  onSaved,
}: {
  orgId: string;
  shopName: string;
  onClose: () => void;
  onSaved: (orgId: string, names: string[]) => void;
}) {
  const [options, setOptions] = useState<RetailerBrandOption[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
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
    const ids = [...selected];
    startSaving(async () => {
      const res = await setRetailerBrandsAction(orgId, ids);
      if (res.error || !res.options) {
        setError(res.error ?? "Could not save the brand selection.");
        return;
      }
      const names = res.options.filter((o) => o.assigned).map((o) => o.name);
      onSaved(orgId, names);
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
          Tick the paint companies this shop can work with. Leave everything unticked to give them
          the whole catalogue.
        </p>

        {loadError ? (
          <p className="field-error" role="alert" style={{ marginTop: 16 }}>{loadError}</p>
        ) : !options ? (
          <p className="net-empty" style={{ marginTop: 16 }}>Loading brands…</p>
        ) : options.length === 0 ? (
          <p className="net-empty" style={{ marginTop: 16 }}>No brands in the catalogue yet.</p>
        ) : (
          <div className="net-brand-grid">
            {options.map((o) => {
              const on = selected.has(o.id);
              return (
                <label key={o.id} className={`net-brand-check${on ? " on" : ""}`}>
                  <input
                    type="checkbox"
                    checked={on}
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
