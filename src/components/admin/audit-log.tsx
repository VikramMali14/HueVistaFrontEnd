"use client";

import { useMemo, useState, useTransition } from "react";
import { Mono } from "@/components/ui/eyebrow";
import type { AuditLogRow } from "@/lib/api";

interface AuditLogProps {
  initial: AuditLogRow[];
  /** Re-query the trail, optionally narrowed to one exact action. */
  refreshAction: (action?: string) => Promise<AuditLogRow[]>;
}

/**
 * The audit trail every sensitive action already writes to — finally readable.
 * Shows the latest 50 records; the action chips re-query the backend so the
 * filter isn't limited to what happens to be on the first page.
 */
export function AuditLog({ initial, refreshAction }: AuditLogProps) {
  const [rows, setRows] = useState(initial);
  const [filter, setFilter] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Chip list: actions seen in the CURRENT rows plus the active filter itself,
  // so the selected chip never vanishes when the filtered page loads.
  const actions = useMemo(() => {
    const set = new Set(rows.map((r) => r.action));
    if (filter) set.add(filter);
    return Array.from(set).sort();
  }, [rows, filter]);

  function applyFilter(action: string | null) {
    startTransition(async () => {
      setFilter(action);
      setRows(await refreshAction(action ?? undefined));
    });
  }

  if (rows.length === 0 && !filter) {
    return (
      <p style={{ font: "300 17px/1.6 var(--serif)", color: "var(--fg-mute)" }}>
        Nothing recorded yet. Sensitive actions — role changes, deletions, password
        changes, subscription events — will appear here.
      </p>
    );
  }

  return (
    <div aria-busy={pending}>
      {actions.length > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          <FilterChip label="All" active={filter === null} onClick={() => applyFilter(null)} />
          {actions.map((a) => (
            <FilterChip key={a} label={a} active={filter === a} onClick={() => applyFilter(a)} />
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <p style={{ font: "300 16px/1.5 var(--serif)", color: "var(--fg-mute)" }}>
          No records for this action.
        </p>
      ) : (
        <div role="table" aria-label="Audit log" style={{ border: "1px solid var(--rule)" }}>
          {rows.map((r, i) => (
            <div
              key={r.id}
              role="row"
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "baseline",
                gap: "4px 14px",
                padding: "12px 16px",
                borderBottom: i === rows.length - 1 ? "none" : "1px solid var(--rule)",
              }}
            >
              <span role="cell" style={{ font: "400 11px/1 var(--mono)", letterSpacing: ".14em", color: "var(--accent)" }}>
                {r.action}
              </span>
              <span role="cell" style={{ font: "300 14px/1.4 var(--serif)", color: "var(--fg-soft)" }}>
                {r.actorEmail ?? r.actorUserId ?? "system"}
              </span>
              {r.targetType && (
                <Mono>
                  {r.targetType}
                  {r.targetId ? ` ${r.targetId.slice(0, 8)}…` : ""}
                </Mono>
              )}
              {r.detail && (
                <span role="cell" style={{ font: "300 italic 14px/1.4 var(--serif)", color: "var(--fg-mute)" }}>
                  {r.detail}
                </span>
              )}
              {r.createdAt && (
                <span
                  role="cell"
                  style={{ marginLeft: "auto", font: "400 11px/1 var(--mono)", color: "var(--fg-mute)", whiteSpace: "nowrap" }}
                >
                  {new Date(r.createdAt).toLocaleString("en-IN", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        background: active ? "var(--surface-soft)" : "transparent",
        border: `1px solid ${active ? "var(--accent)" : "var(--rule-strong)"}`,
        borderRadius: 999,
        padding: "6px 12px",
        cursor: "pointer",
        color: active ? "var(--accent)" : "var(--fg-soft)",
        font: "400 10px/1 var(--mono)",
        letterSpacing: ".16em",
        textTransform: "uppercase",
      }}
    >
      {label}
    </button>
  );
}
