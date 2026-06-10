"use client";

import { useMemo, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import type { PaintShade } from "@/lib/types";

const PAGE_SIZE = 96;

const FAMILIES: ReadonlyArray<{ id: string; dot: string }> = [
  { id: "All families", dot: "var(--ivory)" },
  { id: "Oxblood", dot: "#7a3a2f" },
  { id: "Terracotta", dot: "#b96b48" },
  { id: "Brass", dot: "#d4b88a" },
  { id: "Ivory", dot: "var(--ivory)" },
  { id: "Linen", dot: "#9b8d70" },
  { id: "Sage", dot: "#5b6c5b" },
  { id: "Bluestone", dot: "#3e4a52" },
  { id: "Indigo", dot: "#3a4870" },
  { id: "Walnut", dot: "#7a5a3f" },
  { id: "Shadow", dot: "var(--charcoal-warm)" },
];

const BRANDS = ["Asian Paints", "Berger", "Nerolac", "Dulux"] as const;
const FINISHES = ["All", "Matt", "Satin", "Royale", "Velvet"] as const;
const LRV_RANGES: ReadonlyArray<{ id: string; min: number; max: number }> = [
  { id: "0 — 100", min: 0, max: 100 },
  { id: "Under 25", min: 0, max: 25 },
  { id: "25 — 60", min: 25, max: 60 },
  { id: "Over 60", min: 60, max: 100 },
];
const STYLES = ["All", "Indian", "Italian", "American"] as const;

function designFamily(s: PaintShade): string {
  const code = s.code;
  if (code === "AP-3318" || s.name === "Terracotta Rose") return "Oxblood";
  if (s.name.toLowerCase().includes("terracotta")) return "Terracotta";
  if (s.family === "Earths") return "Terracotta";
  if (s.family === "Reds") return "Oxblood";
  if (s.family === "Yellows" || (s.family === "Neutrals" && s.lrv >= 55)) return "Brass";
  if (s.family === "Whites") return "Ivory";
  if (s.family === "Neutrals") return "Linen";
  if (s.family === "Greens") return "Sage";
  if (s.family === "Blues" && s.lrv < 14) return "Indigo";
  if (s.family === "Blues") return "Bluestone";
  if (s.family === "Browns") return "Walnut";
  if (s.family === "Greys" && s.lrv < 15) return "Shadow";
  if (s.family === "Greys") return "Bluestone";
  return "Linen";
}

interface FilterDropdownProps {
  label: string;
  value: string;
  options: ReadonlyArray<string>;
  onChange: (v: string) => void;
}

function FilterDropdown({ label, value, options, onChange }: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative", padding: "18px 20px", borderRight: "1px solid var(--rule)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, font: "400 10px/1 var(--mono)", letterSpacing: ".26em", textTransform: "uppercase", color: "var(--fg-soft)" }} onClick={() => setOpen((v) => !v)}>
      <span>{label}</span>
      <span style={{ color: "var(--accent)", fontFamily: "var(--serif)", fontSize: 15, letterSpacing: ".01em", textTransform: "none" }}>{value}</span>
      <span style={{ color: "var(--fg-mute)", fontSize: 10 }}>▾</span>
      {open && (
        <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", top: "100%", left: -1, right: -1, background: "var(--surface-soft)", border: "1px solid var(--rule-strong)", borderTop: "none", zIndex: 20 }}>
          {options.map((o) => (
            <div key={o} onClick={() => { onChange(o); setOpen(false); }} style={{ padding: "12px 20px", borderTop: "1px solid var(--rule)", color: o === value ? "var(--fg)" : "var(--fg-soft)", background: o === value ? "var(--surface)" : "transparent", fontFamily: "var(--serif)", fontSize: 15, letterSpacing: ".01em", textTransform: "none" }}>
              {o}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CatalogueToolbar({ shades }: { shades: ReadonlyArray<PaintShade> }) {
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState("All families");
  const [brand, setBrand] = useState<(typeof BRANDS)[number]>("Asian Paints");
  const [finish, setFinish] = useState<(typeof FINISHES)[number]>("All");
  const [lrv, setLrv] = useState<(typeof LRV_RANGES)[number]["id"]>("0 — 100");
  const [style, setStyle] = useState<(typeof STYLES)[number]>("All");
  const [visible, setVisible] = useState(PAGE_SIZE);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const range = LRV_RANGES.find((r) => r.id === lrv) ?? LRV_RANGES[0]!;
    return shades.filter((s) => {
      if (family !== "All families" && designFamily(s) !== family) return false;
      if (brand && s.brand !== brand) return false;
      if (finish !== "All" && !s.finishes.includes(finish as never)) return false;
      if (s.lrv < range.min || s.lrv > range.max) return false;
      if (!q) return true;
      return s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q) || s.hex.toLowerCase().includes(q);
    });
  }, [shades, query, family, brand, finish, lrv]);

  const clearAll = () => {
    setQuery(""); setFamily("All families"); setBrand("Asian Paints"); setFinish("All"); setLrv("0 — 100"); setStyle("All"); setVisible(PAGE_SIZE);
  };

  const shown = filtered.slice(0, visible);

  return (
    <>
      <div className="reveal hv-cat-toolbar" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr 1fr auto", border: "1px solid var(--rule)", background: "var(--surface-soft)" }}>
        <div style={{ padding: "18px 20px", borderRight: "1px solid var(--rule)", display: "flex", alignItems: "center", gap: 12 }}>
          <Mono brass style={{ marginRight: 8 }}>⌕</Mono>
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setVisible(PAGE_SIZE); }}
            placeholder="shade, code, or hex…"
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--fg)", font: "400 16px/1 var(--serif)" }}
          />
        </div>
        <FilterDropdown label="Brand" value={brand} options={BRANDS} onChange={(v) => { setBrand(v as never); setVisible(PAGE_SIZE); }} />
        <FilterDropdown label="Finish" value={finish} options={FINISHES} onChange={(v) => { setFinish(v as never); setVisible(PAGE_SIZE); }} />
        <FilterDropdown label="LRV" value={lrv} options={LRV_RANGES.map((r) => r.id)} onChange={(v) => { setLrv(v as never); setVisible(PAGE_SIZE); }} />
        <FilterDropdown label="Style" value={style} options={STYLES} onChange={(v) => { setStyle(v as never); setVisible(PAGE_SIZE); }} />
        <button type="button" onClick={clearAll} style={{ padding: "18px 20px", background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", color: "var(--fg-mute)", font: "400 10px/1 var(--mono)", letterSpacing: ".26em", textTransform: "uppercase" }}>Clear ·</button>
      </div>

      <div className="reveal d1 r-scroll-x" style={{ marginTop: 24, display: "flex", border: "1px solid var(--rule)", background: "var(--rule)", gap: 1 }}>
        {FAMILIES.map((f) => {
          const active = f.id === family;
          return (
            <button key={f.id} type="button" onClick={() => { setFamily(f.id); setVisible(PAGE_SIZE); }} style={{ flexShrink: 0, padding: "16px 22px", border: "none", background: active ? "var(--surface-soft)" : "var(--bg)", color: active ? "var(--fg)" : "var(--fg-soft)", font: "400 10px/1 var(--mono)", letterSpacing: ".26em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 10, whiteSpace: "nowrap", cursor: "pointer" }}>
              <span style={{ width: 10, height: 10, background: f.dot, boxShadow: active ? "0 0 0 2px var(--accent-soft)" : "none" }} />
              {f.id}
            </button>
          );
        })}
      </div>

      <div className="reveal d2" style={{ marginTop: 32, display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 16 }}>
        <Mono>Showing <span style={{ color: "var(--fg)" }}>{shown.length}</span> of {filtered.length} · sorted by hue</Mono>
        <Mono>Sort: hue · lightness · family · code</Mono>
      </div>

      <div className="reveal d3 hv-cat-grid" style={{ marginTop: 48, display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 24 }}>
        {shown.map((s) => (
          <article key={s.code} style={{ cursor: "pointer", transition: "transform .35s var(--ease)" }}>
            <div style={{ aspectRatio: "1 / 1.1", position: "relative", background: s.hex, overflow: "hidden", boxShadow: "0 1px 0 rgba(255,255,255,.06) inset, 0 20px 40px -20px rgba(0,0,0,.6)" }}>
              <span style={{ position: "absolute", top: 14, right: 14, font: "400 14px/1 var(--serif)", color: "rgba(255,255,255,.75)" }}>{s.code.split("-")[1]}</span>
              <span style={{ position: "absolute", bottom: 14, left: 14, font: "400 9px/1 var(--mono)", letterSpacing: ".26em", textTransform: "uppercase", color: "rgba(255,255,255,.65)" }}>LRV {s.lrv}</span>
            </div>
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontFamily: "var(--serif)", fontSize: 22, color: "var(--fg)", lineHeight: 1.05 }}>{s.name}</span>
              <Mono>{s.code} · {s.hex}</Mono>
            </div>
          </article>
        ))}
      </div>

      {visible < filtered.length && (
        <div style={{ marginTop: 80, textAlign: "center" }}>
          <button type="button" onClick={() => setVisible((v) => v + PAGE_SIZE)} className="btn btn-ghost">
            Load the next {Math.min(PAGE_SIZE, filtered.length - visible)} <span className="arr">→</span>
          </button>
        </div>
      )}
      {filtered.length === 0 && (
        <div style={{ marginTop: 80, textAlign: "center" }}>
          <Mono>No shades match this filter combination.</Mono>
        </div>
      )}
    </>
  );
}
