"use client";

import { useState, useTransition } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { formatRupees } from "@/lib/money";
import type { WalletRedemption } from "@/lib/types";

interface WalletRedemptionsProps {
  /** Null = the queue could not be loaded (outage / expired session) — shown
   *  as an error. A money queue must never render a failure as "clear". */
  initial: WalletRedemption[] | null;
  decideAction: (
    redemptionId: string,
    approve: boolean,
    note?: string,
  ) => Promise<{ redemption?: WalletRedemption; error?: string }>;
  /** Undo an approval whose transfer never landed. Requires a reason. */
  reverseAction: (
    redemptionId: string,
    note: string,
  ) => Promise<{ redemption?: WalletRedemption; error?: string }>;
}

/**
 * The manual payout queue. Each pending request shows the shop, the amount and
 * the UPI id to pay. Approve ONLY after actually sending the money — approval
 * records the payout as settled; reject returns the amount to the shop's wallet.
 */
export function WalletRedemptions({ initial, decideAction, reverseAction }: WalletRedemptionsProps) {
  const [rows, setRows] = useState(initial ?? []);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Approving moves real money and cannot be undone by re-approving, so it takes a
  // deliberate second click rather than firing on the first.
  const [confirmApprove, setConfirmApprove] = useState<string | null>(null);
  const [reversing, setReversing] = useState<string | null>(null);

  if (initial === null) {
    return (
      <p className="field-error" role="alert">
        Could not load the payout queue — pending requests may exist. Refresh the page, or sign in
        again if it keeps happening.
      </p>
    );
  }

  function decide(id: string, approve: boolean) {
    startTransition(async () => {
      setError(null);
      const res = await decideAction(id, approve, notes[id]?.trim() || undefined);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.redemption) {
        setRows((prev) => prev.map((r) => (r.id === id ? res.redemption! : r)));
        setConfirmApprove(null);
      }
    });
  }

  function reverse(id: string) {
    const note = notes[id]?.trim();
    if (!note) {
      setError("Say why the payout is being reversed — the shop is told this reason.");
      return;
    }
    startTransition(async () => {
      setError(null);
      const res = await reverseAction(id, note);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.redemption) {
        setRows((prev) => prev.map((r) => (r.id === id ? res.redemption! : r)));
        setReversing(null);
      }
    });
  }

  if (rows.length === 0) {
    return (
      <p style={{ font: "300 17px/1.6 var(--serif)", color: "var(--fg-mute)" }}>
        No payout requests yet. When a retailer redeems wallet earnings, the request lands here
        (and in the redemption inbox).
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }} aria-busy={pending}>
      {error && <p className="field-error" role="alert">{error}</p>}
      {rows.map((r) => (
        <div
          key={r.id}
          style={{
            border: "1px solid var(--rule-strong)",
            background: "var(--surface-soft)",
            borderRadius: 8,
            padding: "14px 16px",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "baseline",
            gap: "8px 18px",
          }}
        >
          <span style={{ font: "500 17px/1.3 var(--serif)", color: "var(--fg)" }}>
            {r.organizationName || r.organizationId}
          </span>
          <span style={{ font: "500 17px/1.3 var(--serif)", color: "var(--accent)" }}>
            {formatRupees(r.amountPaise)}
          </span>
          <Mono>{r.upiId}</Mono>
          {r.createdAt && (
            <Mono>{new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</Mono>
          )}
          <span
            style={{
              marginLeft: "auto",
              font: "400 10px/1 var(--mono)",
              letterSpacing: ".22em",
              textTransform: "uppercase",
              color: r.status === "PENDING" ? "var(--accent)" : "var(--fg-mute)",
            }}
          >
            {r.status}
          </span>
          {r.status === "PENDING" && (
            <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input
                value={notes[r.id] ?? ""}
                onChange={(e) => setNotes((prev) => ({ ...prev, [r.id]: e.target.value }))}
                placeholder="Note (optional)"
                aria-label="Decision note"
                style={{
                  padding: "6px 10px",
                  border: "1px solid var(--rule-strong)",
                  background: "var(--surface)",
                  color: "var(--fg)",
                  font: "400 13px/1 var(--sans)",
                  width: 160,
                }}
              />
              {([["Approve (paid)", true], ["Reject", false]] as const).map(([label, approve]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() =>
                    approve && confirmApprove !== r.id
                      ? setConfirmApprove(r.id)
                      : decide(r.id, approve)
                  }
                  disabled={pending}
                  style={{
                    background: "transparent",
                    border: "1px solid " + (approve ? "var(--accent)" : "var(--rule-strong)"),
                    borderRadius: 6,
                    padding: "6px 10px",
                    cursor: "pointer",
                    color: approve ? "var(--accent)" : "var(--fg-soft)",
                    font: "400 10px/1 var(--mono)",
                    letterSpacing: ".18em",
                    textTransform: "uppercase",
                  }}
                >
                  {approve && confirmApprove === r.id
                    ? `Confirm — ${formatRupees(r.amountPaise)} sent to ${r.upiId}`
                    : label}
                </button>
              ))}
            </span>
          )}
          {r.status === "APPROVED" && (
            <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {reversing === r.id ? (
                <>
                  <input
                    value={notes[r.id] ?? ""}
                    onChange={(e) => setNotes((prev) => ({ ...prev, [r.id]: e.target.value }))}
                    placeholder="Why is it being reversed?"
                    aria-label="Reversal reason"
                    style={{
                      padding: "6px 10px",
                      border: "1px solid var(--rule-strong)",
                      background: "var(--surface)",
                      color: "var(--fg)",
                      font: "400 13px/1 var(--sans)",
                      width: 200,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => reverse(r.id)}
                    disabled={pending}
                    style={{
                      background: "transparent",
                      border: "1px solid var(--terracotta)",
                      borderRadius: 6,
                      padding: "6px 10px",
                      cursor: "pointer",
                      color: "var(--terracotta)",
                      font: "400 10px/1 var(--mono)",
                      letterSpacing: ".18em",
                      textTransform: "uppercase",
                    }}
                  >
                    Confirm reversal
                  </button>
                  <button
                    type="button"
                    onClick={() => setReversing(null)}
                    style={{
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--fg-mute)",
                      font: "400 10px/1 var(--mono)",
                      letterSpacing: ".18em",
                      textTransform: "uppercase",
                    }}
                  >
                    Keep
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setReversing(r.id)}
                  title="The transfer bounced or the approval was a mistake — return the amount to the shop"
                  style={{
                    background: "transparent",
                    border: "1px solid var(--rule-strong)",
                    borderRadius: 6,
                    padding: "6px 10px",
                    cursor: "pointer",
                    color: "var(--fg-mute)",
                    font: "400 10px/1 var(--mono)",
                    letterSpacing: ".18em",
                    textTransform: "uppercase",
                  }}
                >
                  Reverse
                </button>
              )}
            </span>
          )}
          {r.adminNote && (
            <p style={{ flexBasis: "100%", margin: "4px 0 0", font: "300 italic 15px/1.5 var(--serif)", color: "var(--fg-mute)" }}>
              “{r.adminNote}”
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
