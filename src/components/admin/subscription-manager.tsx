"use client";

import { useState, useTransition } from "react";
import { Mono } from "@/components/ui/eyebrow";
import type { AdminUserRow } from "@/lib/api";
import type { SubscriptionSummary } from "@/lib/types";

interface SubscriptionManagerProps {
  searchAction: (q: string) => Promise<{ users?: AdminUserRow[]; error?: string }>;
  getSubscriptionAction: (
    userId: string,
  ) => Promise<{ subscription?: SubscriptionSummary | null; error?: string }>;
  grantAction: (
    userId: string,
    input: { plan: string; days: number; aiGenerationsLimit?: number },
  ) => Promise<{ subscription?: SubscriptionSummary; error?: string }>;
  adjustAction: (
    userId: string,
    input: { addAiGenerations?: number; extendDays?: number },
  ) => Promise<{ subscription?: SubscriptionSummary; error?: string }>;
}

const PLANS = ["STARTER", "PROFESSIONAL", "BUSINESS", "ENTERPRISE"] as const;

const inputStyle: React.CSSProperties = {
  font: "400 15px/1.4 var(--sans)",
  color: "var(--fg)",
  background: "var(--surface)",
  border: "1px solid var(--rule-strong)",
  borderRadius: 6,
  padding: "10px 12px",
};

const buttonStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--rule-strong)",
  borderRadius: 6,
  padding: "10px 16px",
  cursor: "pointer",
  color: "var(--fg-soft)",
  font: "400 10px/1 var(--mono)",
  letterSpacing: ".18em",
  textTransform: "uppercase",
};

const fieldLabel: React.CSSProperties = {
  font: "400 10px/1 var(--mono)",
  letterSpacing: ".2em",
  textTransform: "uppercase",
  color: "var(--fg-mute)",
  display: "block",
  marginBottom: 6,
};

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function fmtLimit(n: number): string {
  return n >= 2_000_000_000 ? "unlimited" : String(n);
}

function statusColor(status: SubscriptionSummary["status"]): string {
  if (status === "ACTIVE") return "var(--accent)";
  if (status === "EXPIRED" || status === "HALTED") return "var(--terracotta)";
  return "var(--fg-mute)";
}

/**
 * Admin subscription console: look a user up, see their plan and quota, then
 * grant a plan (no payment), top up AI image generations, or extend/reactivate
 * an ended subscription — all server-actioned against the admin endpoints.
 */
export function SubscriptionManager({
  searchAction,
  getSubscriptionAction,
  grantAction,
  adjustAction,
}: SubscriptionManagerProps) {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [selected, setSelected] = useState<AdminUserRow | null>(null);
  const [sub, setSub] = useState<SubscriptionSummary | null>(null);
  const [subLoaded, setSubLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Grant form
  const [plan, setPlan] = useState<string>("PROFESSIONAL");
  const [days, setDays] = useState("30");
  const [aiLimit, setAiLimit] = useState("");
  // Adjust forms
  const [addGenerations, setAddGenerations] = useState("50");
  const [extendDays, setExtendDays] = useState("30");

  function search() {
    const q = query.trim();
    if (!q) return;
    startTransition(async () => {
      setError(null);
      setNotice(null);
      setSelected(null);
      setSub(null);
      setSubLoaded(false);
      const res = await searchAction(q);
      if (res.error) {
        setError(res.error);
        return;
      }
      setUsers(res.users ?? []);
    });
  }

  function pickUser(u: AdminUserRow) {
    setSelected(u);
    setSub(null);
    setSubLoaded(false);
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await getSubscriptionAction(u.id);
      if (res.error) {
        setError(res.error);
        return;
      }
      setSub(res.subscription ?? null);
      setSubLoaded(true);
    });
  }

  function grant() {
    if (!selected) return;
    const d = Math.trunc(Number(days));
    if (!Number.isFinite(d) || d < 1) {
      setError("Enter a validity of at least 1 day.");
      return;
    }
    const limitRaw = aiLimit.trim();
    const limit = limitRaw ? Math.trunc(Number(limitRaw)) : undefined;
    if (limitRaw && (!Number.isFinite(limit!) || limit! < 1)) {
      setError("The AI image limit must be a positive number (or leave it blank for the plan default).");
      return;
    }
    startTransition(async () => {
      setError(null);
      setNotice(null);
      const res = await grantAction(selected.id, { plan, days: d, aiGenerationsLimit: limit });
      if (res.error) {
        setError(res.error);
        return;
      }
      setSub(res.subscription ?? null);
      setSubLoaded(true);
      setNotice(`Granted ${res.subscription?.planDisplayName ?? plan} for ${d} days — active now.`);
    });
  }

  function adjust(input: { addAiGenerations?: number; extendDays?: number }, message: string) {
    if (!selected) return;
    startTransition(async () => {
      setError(null);
      setNotice(null);
      const res = await adjustAction(selected.id, input);
      if (res.error) {
        setError(res.error);
        return;
      }
      setSub(res.subscription ?? null);
      setSubLoaded(true);
      setNotice(message);
    });
  }

  function addCredits() {
    const n = Math.trunc(Number(addGenerations));
    if (!Number.isFinite(n) || n < 1) {
      setError("Enter how many AI image generations to add (at least 1).");
      return;
    }
    adjust({ addAiGenerations: n }, `Added ${n} AI image generations.`);
  }

  function extend() {
    const n = Math.trunc(Number(extendDays));
    if (!Number.isFinite(n) || n < 1) {
      setError("Enter how many days to extend by (at least 1).");
      return;
    }
    adjust({ extendDays: n }, `Extended by ${n} days — the subscription is active.`);
  }

  return (
    <div aria-busy={pending}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
        style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name or email"
          aria-label="Search users to manage their subscription"
          style={{ ...inputStyle, flex: "1 1 220px" }}
        />
        <button type="submit" disabled={pending || !query.trim()} style={buttonStyle}>
          {pending ? "Searching…" : "Search"}
        </button>
      </form>

      {error && <p className="field-error" role="alert">{error}</p>}
      {notice && (
        <p role="status" style={{ font: "400 14px/1.5 var(--sans)", color: "var(--accent)", margin: "0 0 14px" }}>
          {notice}
        </p>
      )}

      {users !== null && users.length === 0 && !error && (
        <p style={{ font: "300 16px/1.5 var(--serif)", color: "var(--fg-mute)" }}>
          No users match &ldquo;{query.trim()}&rdquo;.
        </p>
      )}

      {users !== null && users.length > 0 && !selected && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {users.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => pickUser(u)}
              style={{
                border: "1px solid var(--rule-strong)",
                background: "var(--surface-soft)",
                borderRadius: 8,
                padding: "12px 16px",
                display: "flex",
                flexWrap: "wrap",
                alignItems: "baseline",
                gap: "6px 16px",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span style={{ font: "500 16px/1.3 var(--serif)", color: "var(--fg)" }}>{u.name}</span>
              <Mono>{u.email}</Mono>
              <Mono brass>{u.role}</Mono>
              <span style={{ marginLeft: "auto", font: "400 10px/1 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase", color: "var(--accent-soft)" }}>
                Manage →
              </span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div style={{ border: "1px solid var(--rule-strong)", background: "var(--surface-soft)", borderRadius: 8, padding: 20 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "6px 16px", marginBottom: 18 }}>
            <span style={{ font: "500 18px/1.3 var(--serif)", color: "var(--fg)" }}>{selected.name}</span>
            <Mono>{selected.email}</Mono>
            <Mono brass>{selected.role}</Mono>
            <button type="button" onClick={() => { setSelected(null); setSub(null); setSubLoaded(false); setNotice(null); setError(null); }} style={{ ...buttonStyle, marginLeft: "auto", padding: "8px 12px" }}>
              ← Back to results
            </button>
          </div>

          {!subLoaded && <Mono>Loading subscription…</Mono>}

          {subLoaded && !sub && (
            <p style={{ font: "300 16px/1.5 var(--serif)", color: "var(--fg-mute)", margin: "0 0 18px" }}>
              This user has never had a subscription. Grant one below to activate them.
            </p>
          )}

          {subLoaded && sub && (
            <dl
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: "14px 24px",
                margin: "0 0 20px",
                borderBottom: "1px solid var(--rule)",
                paddingBottom: 20,
              }}
            >
              <div>
                <dt style={fieldLabel}>Plan</dt>
                <dd style={{ font: "500 16px/1.3 var(--serif)", color: "var(--fg)", margin: 0 }}>
                  {sub.planDisplayName}
                  {sub.trial ? " (trial)" : ""}
                </dd>
              </div>
              <div>
                <dt style={fieldLabel}>Status</dt>
                <dd style={{ font: "500 13px/1.3 var(--mono)", color: statusColor(sub.status), margin: 0 }}>
                  {sub.status}
                </dd>
              </div>
              <div>
                <dt style={fieldLabel}>Valid till</dt>
                <dd style={{ font: "400 15px/1.3 var(--sans)", color: "var(--fg)", margin: 0 }}>
                  {fmtDate(sub.currentPeriodEnd)}
                </dd>
              </div>
              <div>
                <dt style={fieldLabel}>AI images</dt>
                <dd style={{ font: "400 15px/1.3 var(--sans)", color: "var(--fg)", margin: 0 }}>
                  {sub.aiGenerationsUsed} / {fmtLimit(sub.aiGenerationsLimit)}
                </dd>
              </div>
              <div>
                <dt style={fieldLabel}>PDF boards</dt>
                <dd style={{ font: "400 15px/1.3 var(--sans)", color: "var(--fg)", margin: 0 }}>
                  {sub.pdfDownloadsUsed ?? 0} / {fmtLimit(sub.pdfDownloadsLimit ?? 0)}
                </dd>
              </div>
            </dl>
          )}

          {subLoaded && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 24 }}>
              <section>
                <h3 style={{ font: "600 15px/1.3 var(--serif)", color: "var(--fg)", margin: "0 0 12px" }}>
                  Grant a subscription
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <label>
                    <span style={fieldLabel}>Plan</span>
                    <select value={plan} onChange={(e) => setPlan(e.target.value)} style={{ ...inputStyle, width: "100%" }}>
                      {PLANS.map((p) => (
                        <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span style={fieldLabel}>Valid for (days)</span>
                    <input type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
                  </label>
                  <label>
                    <span style={fieldLabel}>AI image limit (blank = plan default)</span>
                    <input type="number" min={1} value={aiLimit} onChange={(e) => setAiLimit(e.target.value)} placeholder="Plan default" style={{ ...inputStyle, width: "100%" }} />
                  </label>
                  <button type="button" onClick={grant} disabled={pending} style={{ ...buttonStyle, borderColor: "var(--accent-soft)", color: "var(--accent-soft)" }}>
                    {pending ? "Working…" : "Grant & activate"}
                  </button>
                  <p style={{ font: "400 12px/1.5 var(--sans)", color: "var(--fg-mute)", margin: 0 }}>
                    Activates immediately, no payment. Replaces any currently active plan or trial.
                  </p>
                </div>
              </section>

              <section>
                <h3 style={{ font: "600 15px/1.3 var(--serif)", color: "var(--fg)", margin: "0 0 12px" }}>
                  Top up AI images
                </h3>
                <div style={{ display: "flex", gap: 10 }}>
                  <input
                    type="number"
                    min={1}
                    value={addGenerations}
                    onChange={(e) => setAddGenerations(e.target.value)}
                    aria-label="AI image generations to add"
                    style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                  />
                  <button type="button" onClick={addCredits} disabled={pending || !sub} style={buttonStyle}>
                    Add
                  </button>
                </div>
                <p style={{ font: "400 12px/1.5 var(--sans)", color: "var(--fg-mute)", margin: "10px 0 0" }}>
                  Raises this cycle&rsquo;s generation limit so the user can create more images right away.
                </p>

                <h3 style={{ font: "600 15px/1.3 var(--serif)", color: "var(--fg)", margin: "24px 0 12px" }}>
                  Extend / reactivate
                </h3>
                <div style={{ display: "flex", gap: 10 }}>
                  <input
                    type="number"
                    min={1}
                    value={extendDays}
                    onChange={(e) => setExtendDays(e.target.value)}
                    aria-label="Days to extend the subscription by"
                    style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                  />
                  <button type="button" onClick={extend} disabled={pending || !sub} style={buttonStyle}>
                    Extend
                  </button>
                </div>
                <p style={{ font: "400 12px/1.5 var(--sans)", color: "var(--fg-mute)", margin: "10px 0 0" }}>
                  Pushes the expiry out by this many days. An expired subscription comes back to life.
                </p>
              </section>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
