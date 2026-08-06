"use client";

import { useState, useTransition } from "react";
import { Mono } from "@/components/ui/eyebrow";
import type { DistributorOption, ShopLeadRow } from "@/lib/api";

interface ShopLeadsProps {
  /** Null = the queue could not be loaded (outage / expired session) — shown
   *  as an error, never as "no requests". */
  initial: ShopLeadRow[] | null;
  /** Null = the distributor list could not be loaded; the picker says so rather
   *  than silently offering nothing. */
  distributors: DistributorOption[] | null;
  approveAction: (leadId: string, distributorOrgId?: string) => Promise<{ lead?: ShopLeadRow; error?: string }>;
  dismissAction: (leadId: string) => Promise<{ lead?: ShopLeadRow; error?: string }>;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING_EMAIL: "Email not confirmed",
  AWAITING_APPROVAL: "Waiting for you",
  APPROVED: "Account created",
  DISMISSED: "Turned down",
  // Rows from the old call-back funnel.
  NEW: "Old request",
  CONTACTED: "Old request · contacted",
  CONVERTED: "Old request · converted",
};

/**
 * The admin queue for shop-account requests.
 *
 * Each row is a complete account waiting to happen: the shop filled in every
 * detail and chose its own password, and confirmed the email. So the row shows
 * the details and offers one button — the only decision left is which
 * distributor the shop belongs under, and even that has a default.
 *
 * Requests nobody touches create themselves 24 hours after the email was
 * confirmed, which is what the countdown on each row is telling you.
 */
export function ShopLeads({ initial, distributors, approveAction, dismissAction }: ShopLeadsProps) {
  const [leads, setLeads] = useState(initial ?? []);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  if (initial === null) {
    return (
      <p className="field-error" role="alert">
        Could not load the shop requests — refresh the page, or sign in again if it keeps happening.
      </p>
    );
  }

  function run(
    leadId: string,
    fn: () => Promise<{ lead?: ShopLeadRow; error?: string }>,
  ) {
    setBusyId(leadId);
    startTransition(async () => {
      setError(null);
      const res = await fn();
      setBusyId(null);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.lead) setLeads((prev) => prev.map((l) => (l.id === leadId ? res.lead! : l)));
    });
  }

  // Unconfirmed requests are hidden: they are not requests yet, they are
  // abandoned form fills, and showing them would put an un-actionable row at the
  // top of the queue every time somebody closed the tab.
  const visible = leads.filter((l) => l.status !== "PENDING_EMAIL");
  const waiting = visible.filter((l) => l.status === "AWAITING_APPROVAL");
  const settled = visible.filter((l) => l.status !== "AWAITING_APPROVAL");

  if (visible.length === 0) {
    return (
      <p style={{ font: "300 17px/1.6 var(--serif)", color: "var(--fg-mute)" }}>
        No shop requests waiting. Requests appear here once the shop has confirmed its email.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }} aria-busy={pending}>
      {error && <p className="field-error" role="alert">{error}</p>}
      {[...waiting, ...settled].map((l) => {
        const actionable = l.readyToCreate;
        const busy = busyId === l.id;
        return (
          <div
            key={l.id}
            style={{
              border: `1px solid ${actionable ? "var(--rule-brass)" : "var(--rule-strong)"}`,
              background: "var(--surface-soft)",
              borderRadius: 8,
              padding: "16px 18px",
            }}
          >
            {/* Who and what */}
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "8px 18px" }}>
              <span style={{ font: "500 18px/1.3 var(--serif)", color: "var(--fg)" }}>{l.shopName}</span>
              <span style={{ font: "300 15px/1.3 var(--serif)", color: "var(--fg-soft)" }}>
                {l.name}
                {l.city ? ` · ${l.city}` : ""}
                {l.state ? `, ${l.state}` : ""}
              </span>
              <Mono>{l.email}{l.phone ? ` · ${l.phone}` : ""}</Mono>
              <span
                style={{
                  marginLeft: "auto",
                  font: "400 12px/1 var(--mono)",
                  letterSpacing: ".22em",
                  textTransform: "uppercase",
                  color: actionable ? "var(--accent)" : "var(--fg-mute)",
                }}
              >
                {STATUS_LABEL[l.status] ?? l.status}
              </span>
            </div>

            {l.notes && (
              <p style={{ margin: "10px 0 0", font: "300 italic 15px/1.5 var(--serif)", color: "var(--fg-mute)" }}>
                “{l.notes}”
              </p>
            )}

            {/* Where it stands */}
            <p style={{ margin: "10px 0 0", font: "300 15px/1.5 var(--serif)", color: "var(--fg-soft)" }}>
              {l.status === "APPROVED" ? (
                <>
                  Account created{l.autoApproved ? " automatically at the 24-hour mark" : ""}
                  {l.distributorName ? ` under ${l.distributorName}` : ""}. The shop signs in with the
                  password they chose.
                </>
              ) : l.status === "DISMISSED" ? (
                <>Turned down. Nothing was created and the stored password was discarded.</>
              ) : actionable ? (
                <>
                  Email confirmed. Everything needed is here — press Create account and the shop can
                  sign in with the password they chose.
                  {typeof l.hoursUntilAutoCreate === "number" && (
                    <>
                      {" "}
                      <strong>
                        {l.hoursUntilAutoCreate > 0
                          ? `Creates itself in about ${l.hoursUntilAutoCreate}h if nobody does.`
                          : "Past its 24 hours — it creates itself on the next hourly sweep."}
                      </strong>
                    </>
                  )}
                </>
              ) : (
                <>
                  This one predates the current form, so it carries no password. Create the shop with
                  the form above instead — the owner sets their own password from &ldquo;Forgot password&rdquo;.
                </>
              )}
            </p>

            {/* What to do about it */}
            {(actionable || l.status === "AWAITING_APPROVAL" || l.status === "NEW" || l.status === "CONTACTED") && (
              <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 12 }}>
                {actionable && (
                  <div className="field" style={{ margin: 0, minWidth: 240 }}>
                    <label className="field-label" htmlFor={`dist-${l.id}`}>Distributor</label>
                    <select
                      id={`dist-${l.id}`}
                      value={choice[l.id] ?? ""}
                      onChange={(e) => setChoice((c) => ({ ...c, [l.id]: e.target.value }))}
                      disabled={distributors === null}
                    >
                      {distributors === null ? (
                        <option value="">Could not load distributors</option>
                      ) : (
                        distributors.map((d) => (
                          <option key={d.orgId} value={d.house ? "" : d.orgId}>
                            {d.house ? `${d.name} (ours — default)` : d.name}
                            {d.city ? ` · ${d.city}` : ""}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                )}
                {actionable && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(l.id, () => approveAction(l.id, choice[l.id] || undefined))}
                    style={{
                      background: "var(--accent)",
                      border: "1px solid var(--accent)",
                      borderRadius: 6,
                      padding: "10px 16px",
                      cursor: "pointer",
                      color: "var(--bg)",
                      font: "400 12px/1 var(--mono)",
                      letterSpacing: ".18em",
                      textTransform: "uppercase",
                    }}
                  >
                    {busy ? "Creating…" : "Create account"}
                  </button>
                )}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(l.id, () => dismissAction(l.id))}
                  style={{
                    background: "transparent",
                    border: "1px solid var(--rule-strong)",
                    borderRadius: 6,
                    padding: "10px 14px",
                    cursor: "pointer",
                    color: "var(--fg-soft)",
                    font: "400 12px/1 var(--mono)",
                    letterSpacing: ".18em",
                    textTransform: "uppercase",
                  }}
                >
                  Turn down
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
