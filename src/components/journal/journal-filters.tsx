"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Eyebrow, Mono } from "@/components/ui/eyebrow";
import type { JournalCategory, JournalEntry } from "./journal-entries";

const CATEGORIES: ReadonlyArray<JournalCategory> = ["All", "Essays", "Case studies", "Field notes", "Press", "Engineering"];

export function JournalFilters({ entries }: { entries: ReadonlyArray<JournalEntry> }) {
  const [category, setCategory] = useState<JournalCategory>("All");
  const filtered = useMemo(() => category === "All" ? entries : entries.filter((e) => e.category === category), [entries, category]);

  return (
    <>
      <div className="reveal" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 16 }}>
        <Eyebrow>All entries &nbsp;·&nbsp; chronological</Eyebrow>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {CATEGORIES.map((c) => {
            const active = c === category;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                style={{
                  font: "400 10px/1 var(--mono)",
                  letterSpacing: ".26em",
                  textTransform: "uppercase",
                  padding: "8px 14px",
                  background: active ? "rgba(184,153,104,.08)" : "transparent",
                  color: active ? "var(--brass)" : "var(--ivory-soft)",
                  border: "1px solid " + (active ? "var(--rule-brass)" : "transparent"),
                  cursor: "pointer",
                }}
              >
                {c}
              </button>
            );
          })}
        </div>
      </div>

      <div className="reveal d1" style={{ marginTop: 48 }}>
        {filtered.map((e, i) => (
          <Link
            key={e.num}
            href="/journal"
            className="hv-journal-row"
            style={{
              display: "grid",
              gridTemplateColumns: "80px 1fr 220px 140px 160px",
              gap: 32,
              padding: "32px 0",
              borderTop: i === 0 ? "1px solid var(--rule-strong)" : "1px solid var(--rule)",
              borderBottom: i === filtered.length - 1 ? "1px solid var(--rule-strong)" : "none",
              alignItems: "baseline",
              color: "inherit",
            }}
          >
            <span style={{ font: "400 italic 22px/1 var(--serif)", color: "var(--brass)" }}>{e.num}</span>
            <span style={{ fontFamily: "var(--serif)", fontSize: 26, color: "var(--ivory)", lineHeight: 1.2 }}>{e.title}</span>
            <Mono style={{ color: "var(--ivory-soft)" }}>{e.meta}</Mono>
            <Mono>{e.category}</Mono>
            <Mono brass style={{ textAlign: "right" }}>{e.date} →</Mono>
          </Link>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: "48px 0", textAlign: "center" }}>
            <Mono>No entries in this category yet.</Mono>
          </div>
        )}
      </div>
    </>
  );
}
