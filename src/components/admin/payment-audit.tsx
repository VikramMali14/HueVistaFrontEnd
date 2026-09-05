"use client";

import { useMemo, useState, useTransition } from "react";
import { Mono, Note } from "@/components/ui/eyebrow";
import { formatRupees } from "@/lib/money";
import type {
  PaymentAttemptRow,
  PaymentAttemptStatusName,
  PaymentAuditFilters,
  PaymentAuditSummary,
} from "@/lib/api";

/** Must match PAYMENT_AUDIT_PAGE_SIZE in lib/auth.ts — a full page means there may be more. */
const PAGE_SIZE = 50;

const STATUSES: { value: PaymentAttemptStatusName; label: string; hint: string }[] = [
  { value: "PAID", label: "Paid", hint: "Verified and delivered" },
  { value: "ABANDONED", label: "Abandoned", hint: "Buyer closed checkout without paying" },
  { value: "FAILED", label: "Declined", hint: "The gateway refused the payment" },
  { value: "VERIFY_FAILED", label: "Verify failed", hint: "Charged, but we could not complete it" },
  { value: "OPENED", label: "Opened", hint: "Checkout was showing; no outcome yet" },
  { value: "CREATED", label: "Created", hint: "Order made; the buyer never saw a window" },
];

const FLOWS = [
  { value: "SUBSCRIPTION", label: "Plan" },
  { value: "POINTS", label: "Points" },
  { value: "PROJECT", label: "Extra project" },
  { value: "REOPEN", label: "Reopen" },
  { value: "STORE_KIOSK", label: "Kiosk" },
];

/**
 * How loud a row is.
 *
 * A payment audit is read by someone hunting one thing: the buyer who says they paid.
 * VERIFY_FAILED is that buyer — money left their account and they got nothing — so it is
 * the only status that gets an alarm treatment. Abandonment is the bulk of the table and
 * is ordinary; paid rows recede entirely, because nobody opens this report to admire them.
 */
function toneOf(status: PaymentAttemptStatusName): "alarm" | "warn" | "quiet" | "good" {
  if (status === "VERIFY_FAILED") return "alarm";
  if (status === "FAILED") return "warn";
  if (status === "PAID") return "good";
  return "quiet";
}

interface Props {
  /** Null = the report could not be loaded. Never rendered as "no problems found". */
  initial: PaymentAttemptRow[] | null;
  initialSummary: PaymentAuditSummary | null;
  searchAction: (
    filters: PaymentAuditFilters,
    page?: number,
  ) => Promise<PaymentAttemptRow[] | null>;
  summaryAction: (days: number) => Promise<PaymentAuditSummary | null>;
}

export function PaymentAudit({ initial, initialSummary, searchAction, summaryAction }: Props) {
  const [rows, setRows] = useState(initial ?? []);
  const [summary, setSummary] = useState(initialSummary);
  const [filters, setFilters] = useState<PaymentAuditFilters>({});
  const [days, setDays] = useState(30);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState((initial?.length ?? 0) >= PAGE_SIZE);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState("");

  const exportHref = useMemo(() => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) p.set(k, String(v));
    return `/admin/payments/export?${p.toString()}`;
  }, [filters]);

  function apply(next: PaymentAuditFilters) {
    startTransition(async () => {
      setFilters(next);
      setPage(0);
      setExpanded(null);
      const fresh = await searchAction(next, 0);
      setLoadError(fresh === null);
      // A failed refresh keeps what is on screen rather than blanking the report.
      if (fresh !== null) {
        setRows(fresh);
        setHasMore(fresh.length >= PAGE_SIZE);
      }
    });
  }

  function changeWindow(nextDays: number) {
    startTransition(async () => {
      setDays(nextDays);
      const fresh = await summaryAction(nextDays);
      if (fresh !== null) setSummary(fresh);
    });
  }

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const next = page + 1;
    const more = await searchAction(filters, next);
    setLoadError(more === null);
    if (more !== null) {
      setPage(next);
      setHasMore(more.length >= PAGE_SIZE);
      // De-dupe by id: a new attempt can shift the page boundary between loads.
      setRows((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...more.filter((r) => !seen.has(r.id))];
      });
    }
    setLoadingMore(false);
  }

  if (initial === null && rows.length === 0) {
    return (
      <p className="field-error" role="alert">
        Could not load the payment audit — refresh the page, or sign in again if it keeps
        happening. (An error here means the report is unavailable, not that there is
        nothing to report.)
      </p>
    );
  }

  const active = Object.values(filters).some(Boolean);

  return (
    <div aria-busy={pending}>
      {summary && <Summary summary={summary} days={days} onWindow={changeWindow} />}

      {/* ---- filters ---- */}
      <div style={{ marginTop: 32, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <Chip label="All" active={!filters.status} onClick={() => apply({ ...filters, status: undefined })} />
        {STATUSES.map((s) => (
          <Chip
            key={s.value}
            label={s.label}
            title={s.hint}
            active={filters.status === s.value}
            onClick={() => apply({ ...filters, status: s.value })}
          />
        ))}
      </div>

      <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <Chip label="Every flow" active={!filters.flow} onClick={() => apply({ ...filters, flow: undefined })} />
        {FLOWS.map((f) => (
          <Chip
            key={f.value}
            label={f.label}
            active={filters.flow === f.value}
            onClick={() => apply({ ...filters, flow: f.value })}
          />
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply({ ...filters, q: q.trim() || undefined });
        }}
        style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}
      >
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="E-mail, order id, payment id or page URL"
          aria-label="Search payment attempts"
          style={{
            flex: "1 1 320px",
            minWidth: 240,
            padding: "9px 13px",
            border: "1px solid var(--rule-strong)",
            background: "transparent",
            color: "var(--fg)",
            font: "400 14px/1.4 var(--sans)",
          }}
        />
        <DateField
          label="From"
          value={filters.from ?? ""}
          onChange={(v) => apply({ ...filters, from: v || undefined })}
        />
        <DateField
          label="To"
          value={filters.to ?? ""}
          onChange={(v) => apply({ ...filters, to: v || undefined })}
        />
        <button type="submit" className="pa-btn" disabled={pending}>
          Search
        </button>
        {active && (
          <button
            type="button"
            className="pa-btn"
            onClick={() => {
              setQ("");
              apply({});
            }}
          >
            Clear
          </button>
        )}
        <a className="pa-btn" href={exportHref} download>
          Download CSV
        </a>
      </form>

      {loadError && (
        <p className="field-error" role="alert" style={{ marginTop: 14 }}>
          Could not refresh the report — showing the last loaded rows.
        </p>
      )}

      {/* ---- rows ---- */}
      {rows.length === 0 ? (
        <p style={{ marginTop: 22, font: "300 17px/1.6 var(--serif)", color: "var(--fg-mute)" }}>
          {active
            ? "No checkout attempts match these filters."
            : "No checkout attempts recorded yet. Every payment window opened from here on — paid, abandoned or declined — will appear in this report."}
        </p>
      ) : (
        <>
          <div style={{ marginTop: 22, border: "1px solid var(--rule)" }}>
            {rows.map((r, i) => (
              <Row
                key={r.id}
                row={r}
                last={i === rows.length - 1}
                open={expanded === r.id}
                onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
              />
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14 }}>
            {hasMore ? (
              <button
                type="button"
                className="pa-btn"
                onClick={() => void loadMore()}
                disabled={loadingMore || pending}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            ) : (
              <Mono>End of report</Mono>
            )}
            <Note>{rows.length} shown</Note>
          </div>
        </>
      )}

      <style>{`
        .pa-btn {
          background: transparent; border: 1px solid var(--rule-strong);
          border-radius: 999px; padding: 8px 18px; cursor: pointer;
          color: var(--fg-soft); font: 400 12px/1 var(--mono);
          letter-spacing: .18em; text-transform: uppercase; text-decoration: none;
          display: inline-block;
        }
        .pa-btn:disabled { cursor: default; opacity: .55; }

        .pa-row {
          display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 14px;
          padding: 12px 16px 12px 13px; border-left: 3px solid transparent;
          width: 100%; background: transparent; text-align: left; cursor: pointer;
          font: inherit; color: inherit;
        }
        .pa-tag {
          font: 600 11.5px/1 var(--sans); letter-spacing: .04em;
          padding: 5px 9px; border-radius: var(--radius-pill);
          border: 1px solid currentColor; white-space: nowrap;
        }
        .pa-who { font: 400 14px/1.4 var(--sans); color: var(--fg-soft); }
        .pa-what { font: 400 13.5px/1.4 var(--sans); color: var(--fg-mute); }
        .pa-amount { font: 500 14px/1.4 var(--mono); color: var(--fg-soft); }
        .pa-time { margin-left: auto; font: 400 12px/1 var(--mono); color: var(--fg-mute); white-space: nowrap; }

        /* Money taken with nothing delivered is the one row that must never be
           scrolled past, so it carries a fill, a rule and a border of its own. */
        .pa-row.is-alarm { border-left-color: var(--accent-warm); background: rgba(138,58,46,.10); }
        .pa-row.is-alarm .pa-tag { color: var(--accent-warm); font-weight: 700; }
        .pa-row.is-warn { border-left-color: var(--rule-strong); }
        .pa-row.is-warn .pa-tag { color: var(--accent-text); }
        .pa-row.is-quiet .pa-tag { color: var(--fg-soft); }
        /* Nobody opens this report to look at successful payments. */
        .pa-row.is-good .pa-tag { color: var(--fg-mute); border-color: var(--rule-strong); }

        .pa-detail {
          padding: 4px 16px 20px 16px; display: grid; gap: 14px 26px;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        }
        .pa-field { min-width: 0; }
        .pa-field dt {
          font: 400 11px/1 var(--mono); letter-spacing: .16em; text-transform: uppercase;
          color: var(--fg-mute); margin-bottom: 5px;
        }
        .pa-field dd {
          margin: 0; font: 400 13.5px/1.5 var(--sans); color: var(--fg-soft);
          overflow-wrap: anywhere;
        }
        .pa-timeline {
          margin: 0; padding: 11px 13px; background: var(--surface-soft);
          border: 1px solid var(--rule); font: 400 12.5px/1.7 var(--mono);
          color: var(--fg-soft); white-space: pre-wrap; overflow-x: auto;
        }
        .pa-tile-grid {
          display: grid; gap: 12px; margin-top: 18px;
          grid-template-columns: repeat(auto-fit, minmax(158px, 1fr));
        }
        .pa-tile { border: 1px solid var(--rule); padding: 14px 16px; }
        .pa-tile.is-alarm { border-color: var(--accent-warm); background: rgba(138,58,46,.08); }
        .pa-tile-value { font: 500 27px/1.1 var(--serif); color: var(--fg); }
        .pa-tile.is-alarm .pa-tile-value { color: var(--accent-warm); }
        .pa-tile-label {
          font: 400 11px/1.3 var(--mono); letter-spacing: .14em; text-transform: uppercase;
          color: var(--fg-mute); margin-top: 7px;
        }
        .pa-bars { margin-top: 10px; display: grid; gap: 7px; }
        .pa-bar-row { display: flex; align-items: baseline; gap: 12px; }
        .pa-bar-label {
          font: 400 13px/1.4 var(--sans); color: var(--fg-soft);
          flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere;
        }
        .pa-bar-count { font: 400 12px/1 var(--mono); color: var(--fg-mute); white-space: nowrap; }
      `}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ summary */

function Summary({
  summary,
  days,
  onWindow,
}: {
  summary: PaymentAuditSummary;
  days: number;
  onWindow: (days: number) => void;
}) {
  return (
    <section>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <Mono>Window</Mono>
        {[7, 30, 90, 0].map((d) => (
          <Chip
            key={d}
            label={d === 0 ? "All time" : `${d} days`}
            active={days === d}
            onClick={() => onWindow(d)}
          />
        ))}
      </div>

      <div className="pa-tile-grid">
        <Tile value={String(summary.totalAttempts)} label="Checkouts opened" />
        <Tile
          value={summary.conversionPercent === null ? "—" : `${summary.conversionPercent}%`}
          label="Completed"
        />
        <Tile value={String(summary.abandonedCount)} label="Abandoned" />
        <Tile value={String(summary.failedCount)} label="Declined" />
        <Tile value={formatRupees(summary.lostAmountPaise)} label="Value not collected" />
        {/* Zero is the expected reading; anything else names a buyer who is owed something. */}
        <Tile
          value={formatRupees(summary.moneyAtRiskPaise)}
          label="Charged, not delivered"
          alarm={summary.moneyAtRiskPaise > 0}
        />
      </div>

      {summary.verifyFailedCount > 0 && (
        <p className="field-error" role="alert" style={{ marginTop: 14 }}>
          {summary.verifyFailedCount === 1
            ? "1 buyer was charged and did not get what they paid for."
            : `${summary.verifyFailedCount} buyers were charged and did not get what they paid for.`}{" "}
          Filter by <strong>Verify failed</strong> below for the payment ids to refund or fulfil.
        </p>
      )}

      <div
        style={{
          display: "grid",
          gap: 28,
          marginTop: 26,
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        }}
      >
        {summary.worstPages.length > 0 && (
          <Breakdown
            title="Where payments are lost"
            blurb="Abandoned, declined and failed checkouts by the page the buyer was on. One page well ahead of the others is usually that page's fault, not the buyers'."
            rows={summary.worstPages.map((p) => ({
              label: p.pageUrl,
              count: p.count,
              suffix: formatRupees(p.amountPaise),
            }))}
          />
        )}
        {summary.failureReasons.length > 0 && (
          <Breakdown
            title="Why the gateway refused"
            blurb="Razorpay's own decline reasons — this is what separates a bank-side problem from a buyer-side one."
            rows={summary.failureReasons.map((f) => ({
              label: f.errorDescription || f.errorCode,
              count: f.count,
            }))}
          />
        )}
        {summary.byFlow.length > 0 && (
          <Breakdown
            title="By checkout"
            blurb="Which of the five payment flows the attempts came from."
            rows={summary.byFlow.map((f) => ({
              label: f.displayName,
              count: f.count,
              suffix: formatRupees(f.amountPaise),
            }))}
          />
        )}
      </div>
    </section>
  );
}

function Tile({ value, label, alarm }: { value: string; label: string; alarm?: boolean }) {
  return (
    <div className={`pa-tile${alarm ? " is-alarm" : ""}`}>
      <div className="pa-tile-value">{value}</div>
      <div className="pa-tile-label">{label}</div>
    </div>
  );
}

function Breakdown({
  title,
  blurb,
  rows,
}: {
  title: string;
  blurb: string;
  rows: { label: string; count: number; suffix?: string }[];
}) {
  return (
    <div>
      <h3 style={{ font: "400 19px/1.3 var(--serif)", margin: "0 0 6px" }}>{title}</h3>
      <Note style={{ display: "block", maxWidth: "46ch" }}>{blurb}</Note>
      <div className="pa-bars">
        {rows.map((r) => (
          <div key={r.label} className="pa-bar-row">
            <span className="pa-bar-label">{r.label}</span>
            <span className="pa-bar-count">
              {r.count}
              {r.suffix ? ` · ${r.suffix}` : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- row */

function Row({
  row,
  last,
  open,
  onToggle,
}: {
  row: PaymentAttemptRow;
  last: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const tone = toneOf(row.status);
  return (
    <div style={{ borderBottom: last && !open ? "none" : "1px solid var(--rule)" }}>
      <button
        type="button"
        className={`pa-row is-${tone}`}
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="pa-tag">{row.statusLabel}</span>
        <span className="pa-who">{row.userEmail ?? row.userId ?? "walk-in customer"}</span>
        <span className="pa-amount">{formatRupees(row.amountPaise)}</span>
        <span className="pa-what">
          {row.flowLabel}
          {row.description ? ` · ${row.description}` : ""}
        </span>
        {row.createdAt && (
          <span className="pa-time">
            {new Date(row.createdAt).toLocaleString("en-IN", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </button>

      {open && (
        <dl className="pa-detail">
          <Field label="Page they paid on" value={row.pageUrl} wide />
          <Field label="Reference" value={row.reference} />
          <Field label="Razorpay payment id" value={row.paymentId} />
          <Field label="Buyer" value={row.userEmail ?? row.userId} />
          <Field label="Shop" value={row.organizationId} />
          <Field label="Plan" value={row.plan} />
          <Field label="IP address" value={row.ipAddress} />
          <Field label="Browser" value={row.userAgent} wide />
          <Field label="Came from" value={row.referrer} wide />
          <Field label="Gateway error" value={row.errorCode} />
          <Field label="Gateway said" value={row.errorDescription} wide />
          <Field
            label="Blamed on"
            value={[row.errorSource, row.errorStep, row.errorReason].filter(Boolean).join(" · ") || null}
          />
          <Field label="Our error" value={row.failureNote} wide />
          <Field
            label="Time to give up"
            value={row.durationSeconds === null || row.durationSeconds === undefined
              ? null
              : formatDuration(row.durationSeconds)}
          />
          <Field label="Checkout shown at" value={formatStamp(row.openedAt)} />
          <Field label="Closed at" value={formatStamp(row.closedAt)} />
          {row.timeline && (
            <div className="pa-field" style={{ gridColumn: "1 / -1" }}>
              <dt>What happened, in order</dt>
              <dd>
                <pre className="pa-timeline">{row.timeline}</pre>
              </dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}

/** Renders nothing at all when the value is missing — an empty row in a forensic
 *  view reads as "we looked and there was nothing", which is not the same as
 *  "we never captured this". */
function Field({ label, value, wide }: { label: string; value?: string | null; wide?: boolean }) {
  if (!value) return null;
  return (
    <div className="pa-field" style={wide ? { gridColumn: "1 / -1" } : undefined}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function formatStamp(value?: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function Chip({
  label,
  active,
  onClick,
  title,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      style={{
        background: active ? "var(--surface-soft)" : "transparent",
        border: `1px solid ${active ? "var(--accent)" : "var(--rule-strong)"}`,
        borderRadius: 999,
        padding: "6px 12px",
        cursor: "pointer",
        color: active ? "var(--accent-text)" : "var(--fg-soft)",
        font: "400 12px/1 var(--mono)",
        letterSpacing: ".16em",
        textTransform: "uppercase",
      }}
    >
      {label}
    </button>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
      <Mono>{label}</Mono>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: "8px 10px",
          border: "1px solid var(--rule-strong)",
          background: "transparent",
          color: "var(--fg)",
          font: "400 13px/1 var(--mono)",
        }}
      />
    </label>
  );
}
