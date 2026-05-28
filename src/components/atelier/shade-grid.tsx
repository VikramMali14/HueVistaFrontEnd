"use client";

import { useMemo, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { SHADES } from "@/lib/shades";
import type { PaintShade, ColorFamily } from "@/lib/types";

const FAMILIES: ReadonlyArray<ColorFamily | "All"> = ["All", "Whites", "Neutrals", "Earths", "Reds", "Greens", "Blues", "Yellows", "Greys", "Browns"];
const TABS = ["Catalogue", "AI Suggest", "Regions"] as const;
type Tab = (typeof TABS)[number];

interface ShadeGridProps {
  selected?: string;
  onSelect: (shade: PaintShade) => void;
  activeShade?: PaintShade;
  activeRegionLabel?: string;
}

export function ShadeGrid({ selected, onSelect, activeShade, activeRegionLabel }: ShadeGridProps) {
  const [family, setFamily] = useState<(typeof FAMILIES)[number]>("All");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("Catalogue");

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
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              flex: 1, textAlign: "center", padding: "16px 0",
              fontFamily: "var(--serif)", fontStyle: tab === t ? "italic" : "normal", fontSize: 15,
              color: tab === t ? "var(--ivory)" : "var(--mute)",
              borderBottom: tab === t ? "1px solid var(--brass)" : "none",
              marginBottom: -1,
              background: "transparent", borderTop: "none", borderLeft: "none", borderRight: "none",
              cursor: "pointer",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Catalogue" && (
        <>
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
            {activeRegionLabel && (
              <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 8 }}>
                <span className="ornament" style={{ color: "var(--brass)" }}>⁂</span>
                <span style={{ font: "300 italic 13px/1.3 var(--serif)", color: "var(--mute)" }}>applies to {activeRegionLabel}</span>
              </div>
            )}
          </div>
        </>
      )}

      {tab === "AI Suggest" && (
        <AISuggestPanel onSelect={onSelect} />
      )}

      {tab === "Regions" && (
        <RegionsListPanel selected={selected} />
      )}

      <SelectedShadeDetail shade={activeShade} />
    </div>
  );
}

function SelectedShadeDetail({ shade }: { shade?: PaintShade }) {
  if (!shade) {
    return (
      <div style={{ borderTop: "1px solid var(--rule)", padding: 22, background: "var(--charcoal-soft)" }}>
        <Mono>No shade selected</Mono>
        <p style={{ font: "300 italic 14px/1.4 var(--serif)", color: "var(--mute)", margin: "8px 0 0" }}>Pick a swatch above. It paints the active region in real time.</p>
      </div>
    );
  }
  return (
    <div style={{ borderTop: "1px solid var(--rule)", padding: 22, background: "var(--charcoal-soft)" }}>
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <div style={{ width: 64, height: 64, background: shade.hex, border: "1px solid var(--ivory)", flexShrink: 0 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 }}>
          <span style={{ fontFamily: "var(--serif)", fontSize: 22, lineHeight: 1, color: "var(--ivory)" }}>{shade.name}</span>
          <Mono>{shade.code} · {shade.hex} · LRV {shade.lrv}</Mono>
          <span style={{ font: "300 italic 13px/1.3 var(--serif)", color: "var(--mute)" }}>{shade.finishes.map((f) => f.toLowerCase()).join(" · ")}</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 14 }}>
        <button type="button" style={{ font: "400 11px/1 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase", color: "var(--ivory)", borderBottom: "1px solid var(--ivory)", paddingBottom: 2, background: "transparent", border: "none", borderRadius: 0, borderBottomWidth: 1, cursor: "pointer" }}>Find similar →</button>
        <button type="button" style={{ font: "400 11px/1 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase", color: "var(--mute)", background: "transparent", border: "none", cursor: "pointer" }}>Add to project</button>
      </div>
    </div>
  );
}

function AISuggestPanel({ onSelect }: { onSelect: (shade: PaintShade) => void }) {
  const combos = [
    { name: "Counter Quiet", rationale: "Ivory main, sage accent, slate trim — a Belgavi morning.", shades: [SHADES[0]!, SHADES[14]!, SHADES[16]!] },
    { name: "Spice Veranda", rationale: "Earthbound and warm; reads well in afternoon sun.", shades: [SHADES[5]!, SHADES[12]!, SHADES[0]!] },
    { name: "Twilight Atelier", rationale: "For studies and reading rooms — cool, low LRV.", shades: [SHADES[17]!, SHADES[15]!, SHADES[3]!] },
  ];
  return (
    <div style={{ padding: 20, flex: 1, overflow: "auto" }}>
      <Mono style={{ display: "block", marginBottom: 14 }}>Three suggestions · Claude Sonnet</Mono>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {combos.map((c) => (
          <div key={c.name} style={{ border: "1px solid var(--rule)", padding: 16 }}>
            <div style={{ font: "300 italic 18px/1.1 var(--serif)", color: "var(--ivory)" }}>{c.name}</div>
            <p style={{ font: "300 italic 13px/1.4 var(--serif)", color: "var(--mute)", margin: "6px 0 12px" }}>{c.rationale}</p>
            <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
              {c.shades.map((s) => (
                <button key={s.code} type="button" onClick={() => onSelect(s)} title={`${s.name} · ${s.code}`} style={{ flex: 1, aspectRatio: "1 / 1", background: s.hex, border: "1px solid var(--rule-strong)", cursor: "pointer", padding: 0 }} />
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <Mono>ΔE · snapped</Mono>
              <button type="button" style={{ font: "400 10px/1 var(--mono)", letterSpacing: ".22em", textTransform: "uppercase", color: "var(--ivory)", background: "transparent", border: "1px solid var(--rule-strong)", padding: "6px 10px", cursor: "pointer" }}>Apply</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RegionsListPanel({ selected }: { selected?: string }) {
  return (
    <div style={{ padding: 20, flex: 1, overflow: "auto" }}>
      <Mono style={{ display: "block", marginBottom: 14 }}>Defined regions</Mono>
      <p style={{ font: "300 italic 13px/1.4 var(--serif)", color: "var(--mute)" }}>Regions are auto-detected from your photograph. Click any point on the canvas with the refine tool to add a manual region. {selected ? `Currently painting with ${selected}.` : ""}</p>
    </div>
  );
}
