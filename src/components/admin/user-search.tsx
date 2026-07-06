"use client";

import { useState, useTransition } from "react";
import { Mono } from "@/components/ui/eyebrow";
import type { AdminUserRow } from "@/lib/api";

interface UserSearchProps {
  searchAction: (q: string) => Promise<{ users?: AdminUserRow[]; error?: string }>;
}

/** Admin user lookup: name/email substring → the top 20 matches, newest first. */
export function UserSearch({ searchAction }: UserSearchProps) {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function search() {
    const q = query.trim();
    if (!q) return;
    startTransition(async () => {
      setError(null);
      const res = await searchAction(q);
      if (res.error) {
        setError(res.error);
        return;
      }
      setUsers(res.users ?? []);
    });
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
          aria-label="Search users by name or email"
          style={{
            flex: "1 1 220px",
            font: "400 15px/1.4 var(--sans)",
            color: "var(--fg)",
            background: "var(--surface)",
            border: "1px solid var(--rule-strong)",
            borderRadius: 6,
            padding: "10px 12px",
          }}
        />
        <button
          type="submit"
          disabled={pending || !query.trim()}
          style={{
            background: "transparent",
            border: "1px solid var(--rule-strong)",
            borderRadius: 6,
            padding: "10px 16px",
            cursor: "pointer",
            color: "var(--fg-soft)",
            font: "400 10px/1 var(--mono)",
            letterSpacing: ".18em",
            textTransform: "uppercase",
          }}
        >
          {pending ? "Searching…" : "Search"}
        </button>
      </form>

      {error && <p className="field-error" role="alert">{error}</p>}

      {users !== null && users.length === 0 && !error && (
        <p style={{ font: "300 16px/1.5 var(--serif)", color: "var(--fg-mute)" }}>
          No users match &ldquo;{query.trim()}&rdquo;.
        </p>
      )}

      {users !== null && users.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {users.map((u) => (
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
              <Mono brass>{u.role}</Mono>
              <span
                style={{
                  font: "400 10px/1 var(--mono)",
                  letterSpacing: ".2em",
                  textTransform: "uppercase",
                  color: u.emailVerified ? "var(--accent)" : "var(--fg-mute)",
                }}
              >
                {u.emailVerified ? "verified" : "unverified"}
              </span>
              {u.createdAt && (
                <span style={{ marginLeft: "auto", font: "400 12px/1 var(--mono)", color: "var(--fg-mute)" }}>
                  joined {new Date(u.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
