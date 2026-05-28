"use client";

import { useMemo, useState } from "react";
import { Eyebrow, Mono } from "@/components/ui/eyebrow";
import { Placeholder } from "@/components/ui/placeholder";

export type PlateCategory = "Living rooms" | "Bedrooms" | "Kitchens" | "Verandas" | "Façades" | "Commercial";
export type Tone = "terracotta" | "ivory" | "slate" | "sage" | "brass" | "oxblood" | "indigo" | "walnut" | "ink";

export interface Plate {
  num: string;
  category: PlateCategory;
  title: React.ReactNode;
  code: string;
  swatch: string;
  location: string;
  date: string;
  tag: string;
  tone: Tone;
  aspect: string;
}

const CATEGORY_CHIPS: ReadonlyArray<"All rooms" | PlateCategory> = ["All rooms", "Living rooms", "Bedrooms", "Kitchens", "Verandas", "Façades", "Commercial"];

export function GalleryGrid({ plates }: { plates: ReadonlyArray<Plate> }) {
  const [category, setCategory] = useState<(typeof CATEGORY_CHIPS)[number]>("All rooms");
  const [sort, setSort] = useState<"latest" | "oldest">("latest");

  const filtered = useMemo(() => {
    const list = category === "All rooms" ? plates : plates.filter((p) => p.category === category);
    return sort === "latest" ? list : [...list].reverse();
  }, [plates, category, sort]);

  return (
    <>
      <div className="reveal d2" style={{ marginTop: 48, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {CATEGORY_CHIPS.map((c) => {
          const active = c === category;
          return (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              style={{
                padding: "8px 14px",
                font: "400 10px/1 var(--mono)",
                letterSpacing: ".26em",
                textTransform: "uppercase",
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
        <button type="button" onClick={() => setSort(sort === "latest" ? "oldest" : "latest")} style={{ marginLeft: "auto", padding: "8px 14px", font: "400 10px/1 var(--mono)", letterSpacing: ".26em", textTransform: "uppercase", background: "transparent", color: "var(--brass)", border: "1px solid var(--rule-brass)", cursor: "pointer" }}>
          Sort: {sort}
        </button>
      </div>

      <section style={{ paddingTop: 60 }}>
        <div className="reveal" style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 24 }}>
          {filtered.map((p, i) => {
            const colSpan = i % 6 === 0 || i % 6 === 4 ? 6 : 3;
            return (
              <article key={p.num} style={{ gridColumn: `span ${colSpan}`, position: "relative" }}>
                <Placeholder tone={p.tone} grain corners tag={p.tag} label={`${p.location} · ${p.date}`} style={{ aspectRatio: p.aspect }} />
                <span style={{ position: "absolute", top: 16, right: 18, font: "400 italic 14px/1 var(--serif)", color: "rgba(255,255,255,.6)" }}>{p.num}</span>
                <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "var(--serif)", fontSize: 24, color: "var(--ivory)", lineHeight: 1.2 }}>{p.title}</div>
                    <div style={{ marginTop: 6, display: "inline-flex", alignItems: "center", gap: 10 }}>
                      <span style={{ width: 14, height: 14, background: p.swatch, border: "1px solid var(--rule-strong)" }} />
                      <Mono>{p.code}</Mono>
                    </div>
                  </div>
                  <Mono style={{ textAlign: "right", whiteSpace: "pre-line", flexShrink: 0 }}>{p.location}{"\n"}{p.date}</Mono>
                </div>
              </article>
            );
          })}
        </div>
        {filtered.length === 0 && (
          <div style={{ padding: "120px 0", textAlign: "center" }}>
            <Eyebrow>No plates in this category</Eyebrow>
          </div>
        )}
      </section>
    </>
  );
}
