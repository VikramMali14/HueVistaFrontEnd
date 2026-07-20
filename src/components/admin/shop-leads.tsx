"use client";

import { useState, useTransition } from "react";
import { Mono } from "@/components/ui/eyebrow";
import type { ShopLeadRow, ShopLeadStatus } from "@/lib/api";

interface ShopLeadsProps {
  /** Null = the queue could not be loaded (outage / expired session) — shown
   *  as an error, never as "no requests". */
  initial: ShopLeadRow[] | null;
  updateAction: (leadId: string, status: ShopLeadStatus) => Promise<{ lead?: ShopLeadRow; error?: string }>;
}

const STATUS_LABEL: Record<ShopLeadStatus, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  CONVERTED: "Converted",
  DISMISSED: "Dismissed",
};

/** The admin queue for shop-account requests submitted on /trial. */
export function ShopLeads({ initial, updateAction }: ShopLeadsProps) {
  const [leads, setLeads] = useState(initial ?? []);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (initial === null) {
    return (
      <p className="field-error" role="alert">
        Could not load the shop requests — refresh the page, or sign in again if it keeps happening.
      </p>
    );
  }

  function setStatus(leadId: string, status: ShopLeadStatus) {
    startTransition(async () => {
      setError(null);
      const res = await updateAction(leadId, status);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.lead) {
        setLeads((prev) => prev.map((l) => (l.id === leadId ? res.lead! : l)));
      }
    });
  }

  if (leads.length === 0) {
    return (
      <p style={{ font: "300 17px/1.6 var(--serif)", color: "var(--fg-mute)" }}>
        No shop requests yet. New submissions from the public form land here.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }} aria-busy={pending}>
      {error && <p className="field-error" role="alert">{error}</p>}
      {leads.map((l) => (
        <div
          key={l.id}
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
          <span style={{ font: "500 17px/1.3 var(--serif)", color: "var(--fg)" }}>{l.shopName}</span>
          <span style={{ font: "300 15px/1.3 var(--serif)", color: "var(--fg-soft)" }}>
            {l.name}
            {l.city ? ` · ${l.city}` : ""}
            {l.state ? `, ${l.state}` : ""}
          </span>
          <Mono>{l.email}{l.phone ? ` · ${l.phone}` : ""}</Mono>
          {l.tier && <Mono brass>{l.tier}</Mono>}
          <span
            style={{
              marginLeft: "auto",
              font: "400 10px/1 var(--mono)",
              letterSpacing: ".22em",
              textTransform: "uppercase",
              color: l.status === "NEW" ? "var(--accent)" : "var(--fg-mute)",
            }}
          >
            {STATUS_LABEL[l.status]}
          </span>
          <span style={{ display: "inline-flex", gap: 8 }}>
            {(["CONTACTED", "CONVERTED", "DISMISSED"] as const)
              .filter((s) => s !== l.status)
              .map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(l.id, s)}
                  disabled={pending}
                  style={{
                    background: "transparent",
                    border: "1px solid var(--rule-strong)",
                    borderRadius: 6,
                    padding: "6px 10px",
                    cursor: "pointer",
                    color: "var(--fg-soft)",
                    font: "400 10px/1 var(--mono)",
                    letterSpacing: ".18em",
                    textTransform: "uppercase",
                  }}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
          </span>
          {l.notes && (
            <p style={{ flexBasis: "100%", margin: "4px 0 0", font: "300 italic 15px/1.5 var(--serif)", color: "var(--fg-mute)" }}>
              “{l.notes}”
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
