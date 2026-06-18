"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { hexToHsv } from "@/lib/color";
import { PAINT_BRANDS, type PaintShade } from "@/lib/types";
import { UndertoneTag } from "./undertone-tag";
import { CompareTray, CompareOverlay, COMPARE_MAX } from "./compare-shades";
import { FanDeck } from "./fan-deck";
import { FullscreenSwatch } from "./fullscreen-swatch";
import { BoardsPanel, HeartButton, useBoards } from "./favourites";

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

const BRANDS = ["All brands", ...PAINT_BRANDS] as const;
// In the catalogue today every shade is Asian Paints; the rest are on the way.
const BRANDS_SOON: ReadonlyArray<string> = ["Berger", "Nerolac", "Dulux"];
const FINISHES = ["All", "Matt", "Satin", "Royale", "Velvet"] as const;
const LRV_RANGES: ReadonlyArray<{ id: string; min: number; max: number }> = [
  { id: "0 — 100", min: 0, max: 100 },
  { id: "Under 25", min: 0, max: 25 },
  { id: "25 — 60", min: 25, max: 60 },
  { id: "Over 60", min: 60, max: 100 },
];
const SORTS = ["hue", "lightness", "family", "company", "code"] as const;
type SortBy = (typeof SORTS)[number];

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
  id: string;
  label: string;
  value: string;
  options: ReadonlyArray<string>;
  onChange: (v: string) => void;
  /** Options listed but not yet selectable — rendered muted with a "· soon" suffix. */
  soon?: ReadonlyArray<string>;
  openId: string | null;
  setOpenId: (id: string | null) => void;
}

function FilterDropdown({ id, label, value, options, onChange, soon, openId, setOpenId }: FilterDropdownProps) {
  const open = openId === id;
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close when the pointer goes down anywhere outside this dropdown.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpenId(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, setOpenId]);

  return (
    <div
      ref={wrapRef}
      style={{ position: "relative", borderRight: "1px solid var(--rule)" }}
      onKeyDown={(e) => { if (e.key === "Escape") setOpenId(null); }}
    >
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpenId(open ? null : id)}
        style={{ width: "100%", height: "100%", padding: "18px 20px", background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, font: "400 10px/1 var(--mono)", letterSpacing: ".26em", textTransform: "uppercase", color: "var(--fg-soft)" }}
      >
        <span>{label}</span>
        <span style={{ color: "var(--accent)", fontFamily: "var(--serif)", fontSize: 15, letterSpacing: ".01em", textTransform: "none" }}>{value}</span>
        <span style={{ color: "var(--fg-mute)", fontSize: 10 }} aria-hidden>▾</span>
      </button>
      {open && (
        <div className="hv-dd" role="listbox" aria-label={label} style={{ position: "absolute", top: "100%", left: -1, right: -1, background: "var(--surface-soft)", border: "1px solid var(--rule-strong)", borderTop: "none", zIndex: 20 }}>
          {options.map((o) => {
            const isSoon = soon?.includes(o) ?? false;
            return (
              <button
                key={o}
                type="button"
                role="option"
                aria-selected={o === value}
                disabled={isSoon}
                onClick={() => { onChange(o); setOpenId(null); }}
                className="hv-dd-opt"
                style={{ display: "block", width: "100%", textAlign: "left", padding: "12px 20px", border: "none", borderTop: "1px solid var(--rule)", color: isSoon ? "var(--fg-mute)" : o === value ? "var(--fg)" : "var(--fg-soft)", background: o === value ? "var(--surface)" : "transparent", fontFamily: "var(--serif)", fontSize: 15, letterSpacing: ".01em", textTransform: "none", cursor: isSoon ? "default" : "pointer" }}
              >
                {o}{isSoon && <span style={{ color: "var(--fg-mute)" }}> · soon</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function CatalogueToolbar({ shades }: { shades: ReadonlyArray<PaintShade> }) {
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState("All families");
  const [brand, setBrand] = useState<(typeof BRANDS)[number]>("All brands");
  const [finish, setFinish] = useState<(typeof FINISHES)[number]>("All");
  const [lrv, setLrv] = useState<(typeof LRV_RANGES)[number]["id"]>("0 — 100");
  const [sortBy, setSortBy] = useState<SortBy>("hue");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [openId, setOpenId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  // Counter tools: comparison queue, fan-deck strip, hold-to-wall, boards.
  const [compareCodes, setCompareCodes] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [fanShade, setFanShade] = useState<PaintShade | null>(null);
  const [wallShade, setWallShade] = useState<PaintShade | null>(null);
  const [savedToast, setSavedToast] = useState<string | null>(null);
  const { boards, refresh } = useBoards();

  const compareShades = useMemo(
    () => compareCodes.map((c) => shades.find((s) => s.code === c)).filter((s): s is PaintShade => Boolean(s)),
    [compareCodes, shades],
  );

  const toggleCompare = (s: PaintShade) => {
    setCompareCodes((prev) => {
      if (prev.includes(s.code)) return prev.filter((c) => c !== s.code);
      if (prev.length >= COMPARE_MAX) return prev;
      return [...prev, s.code];
    });
  };

  const showSavedToast = (boardName: string) => {
    setSavedToast(`Saved to ${boardName}`);
    setTimeout(() => setSavedToast(null), 1800);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const range = LRV_RANGES.find((r) => r.id === lrv) ?? LRV_RANGES[0]!;
    return shades.filter((s) => {
      if (family !== "All families" && designFamily(s) !== family) return false;
      if (brand !== "All brands" && s.brand !== brand) return false;
      if (finish !== "All" && !s.finishes.includes(finish as never)) return false;
      if (s.lrv < range.min || s.lrv > range.max) return false;
      if (!q) return true;
      return s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q) || s.hex.toLowerCase().includes(q);
    });
  }, [shades, query, family, brand, finish, lrv]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    if (sortBy === "hue") list.sort((a, b) => hexToHsv(a.hex).h - hexToHsv(b.hex).h);
    else if (sortBy === "lightness") list.sort((a, b) => b.lrv - a.lrv);
    else if (sortBy === "family") list.sort((a, b) => a.family.localeCompare(b.family));
    // Group every company's shades together (brand A→Z, then code within a brand).
    else if (sortBy === "company") list.sort((a, b) => a.brand.localeCompare(b.brand) || a.code.localeCompare(b.code));
    else list.sort((a, b) => a.code.localeCompare(b.code));
    return list;
  }, [filtered, sortBy]);

  const clearAll = () => {
    setQuery(""); setFamily("All families"); setBrand("All brands"); setFinish("All"); setLrv("0 — 100"); setVisible(PAGE_SIZE);
  };

  const copyCode = (code: string) => {
    navigator.clipboard
      ?.writeText(code)
      .then(() => {
        setCopied(code);
        setTimeout(() => setCopied((c) => (c === code ? null : c)), 1200);
      })
      .catch(() => {});
  };

  const shown = sorted.slice(0, visible);
  const emptyCause =
    family !== "All families" ? family
    : finish !== "All" ? finish
    : query.trim() ? `“${query.trim()}”`
    : lrv !== "0 — 100" ? `LRV ${lrv}`
    : "this filter combination";

  return (
    <>
      <div className="reveal hv-cat-toolbar" style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr auto", border: "1px solid var(--rule)", background: "var(--surface-soft)" }}>
        <div style={{ padding: "18px 20px", borderRight: "1px solid var(--rule)", display: "flex", alignItems: "center", gap: 12 }}>
          <Mono brass style={{ marginRight: 8 }}>⌕</Mono>
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setVisible(PAGE_SIZE); }}
            placeholder="shade, code, or hex…"
            aria-label="Search shades by name, code, or hex"
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--fg)", font: "400 16px/1 var(--serif)" }}
          />
        </div>
        <FilterDropdown id="brand" label="Brand" value={brand} options={BRANDS} soon={BRANDS_SOON} onChange={(v) => { setBrand(v as never); setVisible(PAGE_SIZE); }} openId={openId} setOpenId={setOpenId} />
        <FilterDropdown id="finish" label="Finish" value={finish} options={FINISHES} onChange={(v) => { setFinish(v as never); setVisible(PAGE_SIZE); }} openId={openId} setOpenId={setOpenId} />
        <FilterDropdown id="lrv" label="LRV" value={lrv} options={LRV_RANGES.map((r) => r.id)} onChange={(v) => { setLrv(v as never); setVisible(PAGE_SIZE); }} openId={openId} setOpenId={setOpenId} />
        <button type="button" onClick={clearAll} style={{ padding: "18px 20px", background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", color: "var(--fg-mute)", font: "400 10px/1 var(--mono)", letterSpacing: ".26em", textTransform: "uppercase" }}>Clear</button>
      </div>

      <div className="reveal d1 r-scroll-x" style={{ marginTop: 24, display: "flex", border: "1px solid var(--rule)", background: "var(--rule)", gap: 1 }}>
        {FAMILIES.map((f) => {
          const active = f.id === family;
          return (
            <button key={f.id} type="button" className="hv-chip" onClick={() => { setFamily(f.id); setVisible(PAGE_SIZE); }} style={{ flexShrink: 0, padding: "16px 22px", border: "none", background: active ? "var(--surface-soft)" : "var(--bg)", color: active ? "var(--fg)" : "var(--fg-soft)", font: "400 10px/1 var(--mono)", letterSpacing: ".26em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 10, whiteSpace: "nowrap", cursor: "pointer" }}>
              <span style={{ width: 10, height: 10, background: f.dot, border: "1px solid var(--rule-strong)", boxShadow: active ? "0 0 0 2px var(--accent-soft)" : "none" }} />
              {f.id}
            </button>
          );
        })}
      </div>

      <div className="reveal d2" style={{ marginTop: 32, display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 16 }}>
        <Mono>Showing <span style={{ color: "var(--fg)" }}>{shown.length}</span> of {sorted.length} · sorted by {sortBy}</Mono>
        <div style={{ display: "flex", alignItems: "baseline", gap: 2, flexWrap: "wrap" }}>
          <Mono style={{ marginRight: 6 }}>Sort:</Mono>
          {SORTS.map((s, i) => (
            <span key={s} style={{ display: "inline-flex", alignItems: "baseline" }}>
              {i > 0 && <span className="mono" aria-hidden style={{ padding: "0 4px" }}>·</span>}
              <button
                type="button"
                className="hv-chip"
                onClick={() => setSortBy(s)}
                aria-pressed={sortBy === s}
                style={{ background: "transparent", border: "none", cursor: "pointer", padding: "0 2px", font: "400 10px/1 var(--mono)", letterSpacing: ".26em", textTransform: "uppercase", color: sortBy === s ? "var(--brass)" : "var(--fg-soft)" }}
              >
                {s}
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Keyed inner div replays a short entrance when the result set changes; the
          outer div keeps .reveal (remounting it would strip .in and stay invisible). */}
      <div className="reveal d3" style={{ marginTop: 48 }}>
        <div key={[family, brand, finish, lrv, sortBy].join("|")} className="hv-grid-swap hv-cat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 24 }}>
          {shown.map((s) => {
            const ink = s.lrv >= 45 ? "rgba(26,22,18,.72)" : "rgba(255,255,255,.75)";
            const inkSoft = s.lrv >= 45 ? "rgba(26,22,18,.6)" : "rgba(255,255,255,.65)";
            const comparing = compareCodes.includes(s.code);
            return (
              <div key={s.code} className="hv-shade-card">
                <button
                  type="button"
                  onClick={() => copyCode(s.code)}
                  aria-label={`${s.name}, ${s.code}. Copy shade code.`}
                  style={{ display: "block", width: "100%", padding: 0, background: "transparent", border: "none", textAlign: "left", cursor: "pointer" }}
                >
                  <div className="hv-shade-swatch" style={{ aspectRatio: "1 / 1.1", position: "relative", background: s.hex, overflow: "hidden", boxShadow: "0 1px 0 rgba(255,255,255,.06) inset, 0 20px 40px -20px rgba(0,0,0,.6)" }}>
                    <span style={{ position: "absolute", top: 14, right: 14, font: "400 14px/1 var(--serif)", color: ink }}>{s.code.split("-")[1]}</span>
                    <span style={{ position: "absolute", bottom: 14, left: 14, font: "400 9px/1 var(--mono)", letterSpacing: ".26em", textTransform: "uppercase", color: inkSoft }}>LRV {s.lrv}</span>
                  </div>
                  <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontFamily: "var(--serif)", fontSize: 22, color: "var(--fg)", lineHeight: 1.05 }}>{s.name}</span>
                    <Mono>{copied === s.code ? `${s.code} · copied` : `${s.code} · ${s.hex}`}</Mono>
                  </div>
                </button>
                {/* Tool row: heart · compare · strip (the strip's footer holds
                    "Hold to wall", so it needs no button of its own — three
                    targets stay comfortable even on a two-column phone grid). */}
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, rowGap: 8, flexWrap: "wrap" }}>
                  <UndertoneTag hex={s.hex} />
                  <span style={{ flex: 1 }} />
                  <span style={{ display: "inline-flex", gap: 6 }}>
                    <HeartButton shade={s} boards={boards} refresh={refresh} onSaved={showSavedToast} />
                    <button
                      type="button"
                      className="hv-card-action"
                      onClick={() => toggleCompare(s)}
                      aria-pressed={comparing}
                      aria-label={comparing ? `Remove ${s.name} from compare` : `Compare ${s.name} with other shades`}
                      title={comparing ? "Remove from compare" : compareCodes.length >= COMPARE_MAX ? `Compare is full (${COMPARE_MAX})` : "Add to compare"}
                      style={comparing ? { color: "var(--accent)", borderColor: "var(--accent)" } : undefined}
                    >
                      ⇄
                    </button>
                    <button
                      type="button"
                      className="hv-card-action"
                      onClick={() => setFanShade(s)}
                      aria-label={`Open the lighter-to-darker strip around ${s.name}, with a full-screen hold-to-wall view`}
                      title="Shade strip · hold to wall"
                    >
                      ☰
                    </button>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {visible < sorted.length && (
        <div style={{ marginTop: 80, textAlign: "center" }}>
          <button type="button" onClick={() => setVisible((v) => v + PAGE_SIZE)} className="btn btn-ghost">
            Load the next {Math.min(PAGE_SIZE, sorted.length - visible)} <span className="arr">→</span>
          </button>
        </div>
      )}
      {sorted.length === 0 && (
        <div style={{ marginTop: 80, textAlign: "center" }}>
          <Mono style={{ display: "block", marginBottom: 24 }}>Nothing matches {emptyCause} — try clearing the filters.</Mono>
          <button type="button" className="btn btn-ghost" onClick={clearAll}>Clear all filters</button>
        </div>
      )}

      {/* ── Boards (saved shades) ── */}
      <section id="boards" style={{ paddingTop: 96, paddingBottom: 0 }}>
        <Mono brass>Your boards</Mono>
        <h2 className="display" style={{ fontSize: "clamp(28px, 3.5vw, 44px)", margin: "12px 0 8px" }}>
          Saved shades
        </h2>
        <p style={{ font: "400 16px/1.55 var(--serif)", color: "var(--fg-soft)", margin: "0 0 28px", maxWidth: "56ch" }}>
          Tap ♡ on any shade to collect it. Boards stay on this device — share one as a single
          image on WhatsApp and decide together at home.
        </p>
        <BoardsPanel boards={boards} refresh={refresh} catalogue={shades} />
      </section>

      <CompareTray
        shades={compareShades}
        onRemove={(code) => setCompareCodes((prev) => prev.filter((c) => c !== code))}
        onClear={() => setCompareCodes([])}
        onOpen={() => setCompareOpen(true)}
      />
      {compareOpen && compareShades.length >= 2 && (
        <CompareOverlay
          shades={compareShades}
          onClose={() => setCompareOpen(false)}
          onRemove={(code) => {
            setCompareCodes((prev) => {
              const next = prev.filter((c) => c !== code);
              if (next.length < 2) setCompareOpen(false);
              return next;
            });
          }}
        />
      )}
      {fanShade && (
        <FanDeck
          shade={fanShade}
          catalogue={shades}
          onClose={() => setFanShade(null)}
          onHoldToWall={(s) => { setFanShade(null); setWallShade(s); }}
        />
      )}
      {wallShade && <FullscreenSwatch shades={[wallShade]} onClose={() => setWallShade(null)} />}
      {savedToast && (
        <div
          role="status"
          style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: "calc(78px + env(safe-area-inset-bottom))", zIndex: 121, padding: "10px 16px", borderRadius: 999, background: "var(--nav-bg-strong)", border: "1px solid var(--rule-strong)", font: "400 11px/1 var(--mono)", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--fg-soft)" }}
        >
          {savedToast} · <a href="#boards" style={{ color: "var(--fg)" }}>view</a>
        </div>
      )}

      <style>{`
        .hv-shade-card { transition: transform .35s var(--ease); }
        .hv-shade-card .hv-shade-swatch { transition: box-shadow .35s var(--ease); }
        .hv-shade-card:hover { transform: translateY(-4px); }
        .hv-shade-card:hover .hv-shade-swatch { box-shadow: 0 1px 0 rgba(255,255,255,.06) inset, 0 28px 48px -18px rgba(0,0,0,.7); }
        .hv-shade-card:active { transform: translateY(-1px); transition-duration: .12s; }
        .hv-grid-swap { animation: hv-grid-swap .45s var(--ease); }
        @keyframes hv-grid-swap { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) {
          .hv-shade-card, .hv-shade-card .hv-shade-swatch { transition: none; }
          .hv-shade-card:hover, .hv-shade-card:active { transform: none; }
          .hv-grid-swap { animation: none; }
        }
      `}</style>
    </>
  );
}
