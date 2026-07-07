"use client";

import { useState, useTransition } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { AdminUserRow } from "@/lib/api";

interface UserSearchProps {
  action: (q: string) => Promise<{ users?: AdminUserRow[]; error?: string }>;
}

const ROLE_COLOR: Record<string, string> = {
  ADMIN: "var(--accent)",
  RETAILER: "var(--brass)",
};

/** Admin console: find an account by name or email (top 20 newest matches). */
export function UserSearch({ action }: UserSearchProps) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<AdminUserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function search() {
    const query = q.trim();
    if (!query) return;
    startTransition(async () => {
      setError(null);
      const res = await action(query);
      if (res.error) {
        setError(res.error);
        return;
      }
      setResults(res.users ?? []);
    });
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", maxWidth: 520 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Name or email…"
          aria-label="Search users by name or email"
          style={{
            flex: 1,
            minWidth: 220,
            padding: "12px 14px",
            border: "1px solid var(--rule-strong)",
            background: "var(--surface)",
            color: "var(--fg)",
            font: "400 15px/1 var(--sans)",
          }}
        />
        <Button onClick={search} disabled={pending || !q.trim()}>
          {pending ? <><Spinner size={14} color="currentColor" /> Searching…</> : "Search"}
        </Button>
      </div>

      {error && <p className="field-error" role="alert" style={{ marginTop: 12 }}>{error}</p>}

      {results !== null && !error && (
        results.length === 0 ? (
          <p style={{ marginTop: 16, font: "300 16px/1.5 var(--serif)", color: "var(--fg-mute)" }}>
            No accounts match &ldquo;{q.trim()}&rdquo;.
          </p>
        ) : (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }} aria-live="polite">
            {results.map((u) => (
              <div
                key={u.id}
                style={{
                  border: "1px solid var(--rule-strong)",
                  background: "var(--surface-soft)",
                  borderRadius: 8,
                  padding: "12px 16px",
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "baseline",
                  gap: "6px 16px",
                }}
              >
                <span style={{ font: "500 16px/1.3 var(--serif)", color: "var(--fg)" }}>{u.name}</span>
                <Mono>{u.email}</Mono>
                <span
                  style={{
                    font: "500 9.5px/1 var(--mono)",
                    letterSpacing: ".22em",
                    textTransform: "uppercase",
                    color: ROLE_COLOR[u.role] ?? "var(--fg-mute)",
                  }}
                >
                  {u.role}
                </span>
                {u.emailVerified === false && (
                  <span style={{ font: "400 9.5px/1 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase", color: "var(--fg-mute)" }}>
                    email unverified
                  </span>
                )}
                {u.createdAt && (
                  <span style={{ marginLeft: "auto", font: "400 12px/1 var(--mono)", color: "var(--fg-mute)" }}>
                    joined {new Date(u.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                )}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
