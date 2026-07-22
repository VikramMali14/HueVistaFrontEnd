"use client";

import { useMemo, useState, useTransition } from "react";
import { Mono } from "@/components/ui/eyebrow";
import type { AuditLogRow } from "@/lib/api";

/** Rows per page — must match AUDIT_PAGE_SIZE in lib/auth.ts (the server action
 *  that backs refreshAction). A full page means there may be more to load. */
const PAGE_SIZE = 50;

/** Cap the trail's own height so a long history scrolls inside its box instead
 *  of pushing the rest of the admin page down. */
const LIST_MAX_HEIGHT = 480;

interface AuditLogProps {
  /** Null = the trail could not be loaded (outage / expired session) — shown
   *  as an error, never as "nothing recorded". */
  initial: AuditLogRow[] | null;
  /** Re-query the trail, optionally narrowed to one exact action and to a
   *  zero-based page. Null = the request failed; the component keeps its rows. */
  refreshAction: (action?: string, page?: number) => Promise<AuditLogRow[] | null>;
}

/** Union the actions we've ever seen (plus the active filter) into a sorted,
 *  stable chip list — so selecting a filter, whose page holds only that one
 *  action, never collapses the chip bar and strands the user with no "All". */
function mergeActions(known: string[], rows: AuditLogRow[], filter: string | null): string[] {
  const set = new Set(known);
  for (const r of rows) set.add(r.action);
  if (filter) set.add(filter);
  return Array.from(set).sort();
}

/**
 * The audit trail every sensitive action already writes to — filterable by
 * action, paged so a thousand records don't all render at once, and scrolled
 * inside its own box. The action chips re-query the backend, so the filter
 * isn't limited to the rows on the first page.
 */
export function AuditLog({ initial, refreshAction }: AuditLogProps) {
  const [rows, setRows] = useState(initial ?? []);
  const [filter, setFilter] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState((initial?.length ?? 0) >= PAGE_SIZE);
  // Stable chip list: seeded from the first page and only ever grown, so a
  // filtered page (all one action) can't shrink it.
  const [knownActions, setKnownActions] = useState<string[]>(() =>
    mergeActions([], initial ?? [], null),
  );
  const [loadError, setLoadError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pending, startTransition] = useTransition();

  const actions = useMemo(
    () => (filter && !knownActions.includes(filter) ? [...knownActions, filter].sort() : knownActions),
    [knownActions, filter],
  );

  function applyFilter(action: string | null) {
    startTransition(async () => {
      setFilter(action);
      setPage(0);
      const fresh = await refreshAction(action ?? undefined, 0);
      setLoadError(fresh === null);
      // A failed refresh keeps what's on screen rather than blanking the trail.
      if (fresh !== null) {
        setRows(fresh);
        setHasMore(fresh.length >= PAGE_SIZE);
        setKnownActions((prev) => mergeActions(prev, fresh, action));
      }
    });
  }

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const next = page + 1;
    const more = await refreshAction(filter ?? undefined, next);
    setLoadError(more === null);
    if (more !== null) {
      setPage(next);
      setHasMore(more.length >= PAGE_SIZE);
      // De-dupe by id in case a new record shifted the page boundary between loads.
      setRows((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...more.filter((r) => !seen.has(r.id))];
      });
      setKnownActions((prev) => mergeActions(prev, more, filter));
    }
    setLoadingMore(false);
  }

  if (initial === null && rows.length === 0) {
    return (
      <p className="field-error" role="alert">
        Could not load the audit trail — refresh the page, or sign in again if it keeps happening.
      </p>
    );
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
      {loadError && (
        <p className="field-error" role="alert" style={{ marginBottom: 12 }}>
          Could not refresh the trail — showing the last loaded records.
        </p>
      )}
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
        <>
          <div
            role="table"
            aria-label="Audit log"
            style={{ border: "1px solid var(--rule)", maxHeight: LIST_MAX_HEIGHT, overflowY: "auto" }}
          >
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

          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14 }}>
            {hasMore ? (
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore || pending}
                style={{
                  background: "transparent",
                  border: "1px solid var(--rule-strong)",
                  borderRadius: 999,
                  padding: "8px 18px",
                  cursor: loadingMore ? "default" : "pointer",
                  color: "var(--fg-soft)",
                  font: "400 10px/1 var(--mono)",
                  letterSpacing: ".18em",
                  textTransform: "uppercase",
                }}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            ) : (
              <Mono>End of trail</Mono>
            )}
            <Mono>{rows.length} shown</Mono>
          </div>
        </>
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
