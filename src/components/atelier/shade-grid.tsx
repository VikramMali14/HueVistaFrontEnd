"use client";

import { useMemo, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { SHADES } from "@/lib/shades";
import type { PaintShade, ColorFamily } from "@/lib/types";

const FAMILIES: ReadonlyArray<ColorFamily | "All"> = ["All", "Whites", "Neutrals", "Earths", "Reds", "Greens", "Blues", "Yellows", "Greys", "Browns"];

interface ShadeGridProps { selected?: string; onSelect: (shade: PaintShade) => void; }

export function ShadeGrid({ selected, onSelect }: ShadeGridProps) {
  const [family, setFamily] = useState<(typeof FAMILIES)[number]>("All");
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SHADES.filter((s) => {
      if (family !== "All" && s.family !== family) return false;
      if (!q) return true;
      return s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q) || s.hex.toLowerCase().includes(q);
    });
  }, [family, query]);

  return (
    <div style={{ display: "flex", flexDirection: "column", borderLeft: "1px solid var(--rule)", height: "100%" }}>
      <div style={{ borderBottom: "1px solid var(--rule)", display: "flex" }}>
        {["Catalogue", "AI Suggest", "Regions"].map((t, i) => (
          <div key={t} style={{ flex: 1, textAlign: "center", padding: "16px 0", fontFamily: "var(--serif)", fontStyle: i === 0 ? "italic" : "normal", fontSize: 15, color: i === 0 ? "var(--ivory)" : "var(--mute)", borderBottom: i === 0 ? "1px solid var(--brass)" : "none", marginBottom: -1 }}>{t}</div>
        ))}
      </div>
      <div style={{ padding: 20, borderBottom: "1px solid var(--rule)" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", borderBottom: "1px solid var(--ivory)", paddingBottom: 8 }}>
          <span style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 16, color: "var(--mute)" }}>⌕</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="shade, code, or hex…" style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--ivory)", fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 16 }} />
        </div>
      </div>
      <div style={{ padding: 16, borderBottom: "1px solid var(--rule)" }}>
        <Mono style={{ marginBottom: 10, display: "block" }}>Family</Mono>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {FAMILIES.map((f) => (
            <button key={f} type="button" onClick={() => setFamily(f)} style={{ padding: "6px 10px", font: "400 9.5px/1 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase", border: "1px solid " + (family === f ? "var(--ivory)" : "var(--rule)"), color: family === f ? "var(--ivory)" : "var(--mute)", background: "transparent", cursor: "pointer" }}>{f}</button>
          ))}
        </div>
      </div>
      <div style={{ padding: 20, flex: 1, overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <span style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 17 }}>Asian Paints</span>
            <Mono style={{ display: "block" }}>{shown.length} shades</Mono>
          </div>
          <Mono style={{ fontSize: 9 }}>LRV · Finish ▾</Mono>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
          {shown.map((s) => (
            <button key={s.code} type="button" onClick={() => onSelect(s)} title={`${s.name} · ${s.code}`} style={{ background: s.hex, aspectRatio: "1 / 1", border: "none", cursor: "pointer", padding: 0, outline: selected === s.code ? "1px solid var(--brass)" : "none", outlineOffset: 3 }} />
          ))}
        </div>
      </div>
    </div>
  );
}
