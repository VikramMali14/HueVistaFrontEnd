"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Mono, Note } from "@/components/ui/eyebrow";
import { useShadeLabels } from "@/hooks/use-shade-code-scheme";
import { matchesQuery } from "@/components/atelier/shade-grid";
import { useCopied } from "@/hooks/use-copied";
import { hexToHsv, readableInk } from "@/lib/color";
import { PAINT_BRANDS, type PaintShade } from "@/lib/types";
import { PARENT_FAMILIES, parentFamilyOf, type ParentFamily } from "@/lib/colour-families";
import { UndertoneTag } from "./undertone-tag";
import { CompareTray, CompareOverlay, COMPARE_MAX } from "./compare-shades";
import { FanDeck } from "./fan-deck";
import { FullscreenSwatch } from "./fullscreen-swatch";

const PAGE_SIZE = 60;

const ALL_BRANDS = "All brands";
const ALL_FAMILIES = "All families";
// Depth buckets over the light-reflectance data — shown as words, never numbers.
const LRV_RANGES: ReadonlyArray<{ id: string; min: number; max: number }> = [
  { id: "All", min: 0, max: 100 },
  { id: "Light", min: 60, max: 100 },
  { id: "Medium", min: 25, max: 60 },
  { id: "Deep", min: 0, max: 25 },
];
const SORTS = ["hue", "lightness", "family", "company", "code"] as const;
type SortBy = (typeof SORTS)[number];

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
        style={{ width: "100%", height: "100%", padding: "18px 20px", background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, font: "400 12px/1 var(--mono)", letterSpacing: ".26em", textTransform: "uppercase", color: "var(--fg-soft)" }}
      >
        <span>{label}</span>
        <span style={{ color: "var(--accent)", fontFamily: "var(--serif)", fontSize: 15, letterSpacing: ".01em", textTransform: "none" }}>{value}</span>
        <span style={{ color: "var(--fg-mute)", fontSize: 12 }} aria-hidden>▾</span>
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
  // Two levels: the parent family a person shops by, and (optionally) the
  // company's own name for a sub-family inside it.
  const [parentFamily, setParentFamily] = useState<ParentFamily | typeof ALL_FAMILIES>(ALL_FAMILIES);
  const [family, setFamily] = useState(ALL_FAMILIES);
  const [brand, setBrand] = useState<string>(ALL_BRANDS);
  const [finish, setFinish] = useState<string>("All");
  const [lrv, setLrv] = useState<(typeof LRV_RANGES)[number]["id"]>("All");
  const [sortBy, setSortBy] = useState<SortBy>("hue");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [openId, setOpenId] = useState<string | null>(null);
  const { copied, copy: copyCode } = useCopied();
  // Under a shop's own numbering these swatches read the way that shop's swatches
  // read everywhere else. A signed-out visitor is under no shop, so the public
  // catalogue is unchanged for them.
  const { patterned, showNames, codeOf, nameOf } = useShadeLabels();
  // Counter tools: comparison queue, fan-deck strip, hold-to-wall.
  const [compareCodes, setCompareCodes] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [fanShade, setFanShade] = useState<PaintShade | null>(null);
  const [wallShade, setWallShade] = useState<PaintShade | null>(null);

  // Companies actually present in the catalogue drive the dropdown; well-known
  // brands with no shades yet stay listed but disabled ("· soon").
  const { brandOptions, brandsSoon } = useMemo(() => {
    const present = Array.from(new Set(shades.map((s) => s.brand))).sort((a, b) => a.localeCompare(b));
    const soon = PAINT_BRANDS.filter((b) => !present.includes(b));
    return { brandOptions: [ALL_BRANDS, ...present, ...soon], brandsSoon: soon };
  }, [shades]);

  // Family chips come from whatever families the shades table holds, folded into
  // the parent families people actually shop by; each chip's dot is that group's
  // mid-lightness shade so the row previews the palette.
  const { parentOptions, subFamiliesByParent } = useMemo(() => {
    const byFamily = new Map<string, PaintShade[]>();
    for (const s of shades) {
      const list = byFamily.get(s.family);
      if (list) list.push(s);
      else byFamily.set(s.family, [s]);
    }
    const midHex = (list: PaintShade[]) => {
      const byLrv = [...list].sort((a, b) => a.lrv - b.lrv);
      return byLrv[Math.floor(byLrv.length / 2)]!.hex;
    };
    const subs = new Map<ParentFamily, Array<{ id: string; dot: string; count: number }>>();
    const parentShades = new Map<ParentFamily, PaintShade[]>();
    for (const [id, list] of byFamily) {
      const parent = parentFamilyOf(id);
      const bucket = subs.get(parent) ?? [];
      bucket.push({ id, dot: midHex(list), count: list.length });
      subs.set(parent, bucket);
      parentShades.set(parent, (parentShades.get(parent) ?? []).concat(list));
    }
    for (const bucket of subs.values()) bucket.sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
    // Fixed order, not alphabetical: the row reads as a spectrum, and it does not
    // reshuffle when a company's catalogue is loaded.
    const parents = PARENT_FAMILIES.filter((p) => parentShades.has(p)).map((p) => ({
      id: p,
      dot: midHex(parentShades.get(p)!),
      count: parentShades.get(p)!.length,
    }));
    return { parentOptions: parents, subFamiliesByParent: subs };
  }, [shades]);

  const subFamilies = parentFamily === ALL_FAMILIES ? [] : (subFamiliesByParent.get(parentFamily) ?? []);

  // Finish filter from the finishes actually recommended in the data.
  const finishOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of shades) for (const f of s.finishes) set.add(f);
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [shades]);

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

  // Deferred so typing stays responsive while a 10k-shade list re-filters.
  const deferredQuery = useDeferredValue(query);

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    const range = LRV_RANGES.find((r) => r.id === lrv) ?? LRV_RANGES[0]!;
    return shades.filter((s) => {
      if (family !== ALL_FAMILIES) {
        if (s.family !== family) return false;
      } else if (parentFamily !== ALL_FAMILIES && parentFamilyOf(s.family) !== parentFamily) {
        return false;
      }
      if (brand !== ALL_BRANDS && s.brand !== brand) return false;
      if (finish !== "All" && !s.finishes.includes(finish)) return false;
      if (s.lrv < range.min || s.lrv > range.max) return false;
      return matchesQuery(s, q, {
        hideCodes: patterned,
        hideNames: !showNames,
        encodeCode: patterned ? codeOf : undefined,
      });
    });
  }, [shades, deferredQuery, family, parentFamily, brand, finish, lrv, patterned, showNames, codeOf]);

  const sorted = useMemo(() => {
    if (sortBy === "hue") {
      // Compute each shade's hue once, then sort — the naive comparator re-derives
      // HSV on every comparison, which is ~250k conversions for 10k shades.
      return filtered
        .map((s) => ({ s, h: hexToHsv(s.hex).h }))
        .sort((a, b) => a.h - b.h)
        .map(({ s }) => s);
    }
    const list = [...filtered];
    if (sortBy === "lightness") list.sort((a, b) => b.lrv - a.lrv);
    else if (sortBy === "family") list.sort((a, b) => a.family.localeCompare(b.family));
    // Group every company's shades together (brand A→Z, then code within a brand).
    else if (sortBy === "company") list.sort((a, b) => a.brand.localeCompare(b.brand) || a.code.localeCompare(b.code));
    else list.sort((a, b) => a.code.localeCompare(b.code));
    return list;
  }, [filtered, sortBy]);

  const clearAll = () => {
    setQuery(""); setFamily(ALL_FAMILIES); setParentFamily(ALL_FAMILIES); setBrand(ALL_BRANDS); setFinish("All"); setLrv("All"); setVisible(PAGE_SIZE);
  };

  const shown = sorted.slice(0, visible);
  const hasMore = visible < sorted.length;

  // Infinite scroll: a sentinel just below the grid loads the next page as it
  // scrolls into view, so shades keep coming as you scroll rather than needing
  // a button. rootMargin pre-loads a screen early to avoid a visible stall.
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible((v) => v + PAGE_SIZE);
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [hasMore, sorted.length]);

  const emptyCause =
    family !== ALL_FAMILIES ? family
    : parentFamily !== ALL_FAMILIES ? parentFamily
    : finish !== "All" ? finish
    : query.trim() ? `“${query.trim()}”`
    : lrv !== "All" ? `${lrv.toLowerCase()} shades`
    : "this filter combination";

  return (
    <>
      <div className="reveal hv-cat-toolbar" style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr auto", border: "1px solid var(--rule)", background: "var(--surface-soft)" }}>
        <div style={{ padding: "18px 20px", borderRight: "1px solid var(--rule)", display: "flex", alignItems: "center", gap: 12 }}>
          <Mono brass style={{ marginRight: 8 }}>⌕</Mono>
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setVisible(PAGE_SIZE); }}
            placeholder="shade name or code…"
            aria-label="Search shades by name or code"
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--fg)", font: "400 16px/1 var(--serif)" }}
          />
        </div>
        <FilterDropdown id="brand" label="Brand" value={brand} options={brandOptions} soon={brandsSoon} onChange={(v) => { setBrand(v); setVisible(PAGE_SIZE); }} openId={openId} setOpenId={setOpenId} />
        <FilterDropdown id="finish" label="Finish" value={finish} options={finishOptions} onChange={(v) => { setFinish(v); setVisible(PAGE_SIZE); }} openId={openId} setOpenId={setOpenId} />
        <FilterDropdown id="lrv" label="Depth" value={lrv} options={LRV_RANGES.map((r) => r.id)} onChange={(v) => { setLrv(v as never); setVisible(PAGE_SIZE); }} openId={openId} setOpenId={setOpenId} />
        <button type="button" onClick={clearAll} style={{ padding: "18px 20px", background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", color: "var(--fg-mute)", font: "400 12px/1 var(--mono)", letterSpacing: ".26em", textTransform: "uppercase" }}>Clear</button>
      </div>

      {/* Families, in two levels and on as many lines as it takes.
          This was one long sideways scroller of raw brand taxonomy — "Blues",
          "Blue-greens", "Blue Greens & Greens", "Neutrals", "Classic Neutrals",
          "Neutrals: Browns & Greys", "Off Whites", "Whispering Whites" and
          "Whites" as peers — with a visible scrollbar even at 1400px and the
          last chip cut mid-word. Nine parents wrap onto two lines; the
          company's own name for a family is one click deeper, never lost. */}
      <div className="reveal d1 hv-family-row">
        {[{ id: ALL_FAMILIES, dot: "var(--ivory)", count: shades.length }, ...parentOptions].map((f) => {
          const active = f.id === parentFamily || (f.id === ALL_FAMILIES && parentFamily === ALL_FAMILIES);
          return (
            <button
              key={f.id}
              type="button"
              className={`hv-family-chip${active ? " is-active" : ""}`}
              aria-pressed={active}
              onClick={() => {
                setParentFamily(f.id as ParentFamily | typeof ALL_FAMILIES);
                setFamily(ALL_FAMILIES);
                setVisible(PAGE_SIZE);
              }}
            >
              <span aria-hidden className="hv-family-dot" style={{ background: f.dot }} />
              {f.id}
            </button>
          );
        })}
      </div>

      {subFamilies.length > 1 && (
        <div className="hv-family-row is-sub">
          <button
            type="button"
            className={`hv-family-chip is-sub${family === ALL_FAMILIES ? " is-active" : ""}`}
            aria-pressed={family === ALL_FAMILIES}
            onClick={() => { setFamily(ALL_FAMILIES); setVisible(PAGE_SIZE); }}
          >
            All {parentFamily.toLowerCase()}
          </button>
          {subFamilies.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`hv-family-chip is-sub${f.id === family ? " is-active" : ""}`}
              aria-pressed={f.id === family}
              onClick={() => { setFamily(f.id); setVisible(PAGE_SIZE); }}
              title={`${f.id} — the company's own name for this group (${f.count} shades)`}
            >
              <span aria-hidden className="hv-family-dot" style={{ background: f.dot }} />
              {f.id}
            </button>
          ))}
        </div>
      )}
      <div className="reveal d2 hv-cat-statusbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 16 }}>
        <Note>Showing <span style={{ color: "var(--fg)", fontWeight: 600 }}>{shown.length}</span> of {sorted.length.toLocaleString("en-IN")} shades · sorted by {sortBy}</Note>
        <div style={{ display: "flex", alignItems: "baseline", gap: 2, flexWrap: "wrap" }}>
          <Mono style={{ marginRight: 6 }}>Sort:</Mono>
          {SORTS.map((s, i) => (
            <span key={s} style={{ display: "inline-flex", alignItems: "baseline" }}>
              {i > 0 && <span className="mono" aria-hidden style={{ padding: "0 4px" }}>·</span>}
              <button
                type="button"
                className="hv-chip tap-row"
                onClick={() => setSortBy(s)}
                aria-pressed={sortBy === s}
                style={{ background: "transparent", border: "none", cursor: "pointer", padding: "10px 6px", font: "400 12px/1 var(--mono)", letterSpacing: ".26em", textTransform: "uppercase", color: sortBy === s ? "var(--brass)" : "var(--fg-soft)" }}
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
            // Read the swatch's own hex, not the brand-reported LRV: LRV is absent or
            // zero across a good slice of the catalogue, which is how pale chips ended
            // up with white labels at 2.8:1.
            const { strong: ink, soft: inkSoft } = readableInk(s.hex);
            const comparing = compareCodes.includes(s.code);
            return (
              <div key={s.code} className="hv-shade-card">
                <button
                  type="button"
                  onClick={() => copyCode(codeOf(s.code))}
                  aria-label={`${nameOf(s)}, ${codeOf(s.code)}. Copy shade code.`}
                  style={{ display: "block", width: "100%", padding: 0, background: "transparent", border: "none", textAlign: "left", cursor: "pointer" }}
                >
                  <div className="hv-shade-swatch" style={{ aspectRatio: "1 / 1.1", position: "relative", background: s.hex, overflow: "hidden", boxShadow: "0 1px 0 rgba(255,255,255,.06) inset, 0 20px 40px -20px rgba(0,0,0,.6)" }}>
                    <span style={{ position: "absolute", top: 14, right: 14, font: "400 14px/1 var(--serif)", color: ink }}>{patterned ? codeOf(s.code) : s.code.split("-")[1]}</span>
                    <span style={{ position: "absolute", bottom: 14, left: 14, font: "400 12px/1 var(--mono)", letterSpacing: ".26em", textTransform: "uppercase", color: inkSoft }}>{s.brand}</span>
                  </div>
                  <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 4 }}>
                    <span className="hv-shade-card-title" title={nameOf(s)} style={{ fontFamily: "var(--serif)", fontSize: 22, color: "var(--fg)", lineHeight: 1.05 }}>{nameOf(s)}</span>
                    <Mono className="shade-code">{copied === codeOf(s.code) ? `${codeOf(s.code)} · copied` : codeOf(s.code)}</Mono>
                  </div>
                </button>
                {/* Tool row: compare · strip (the strip's footer holds
                    "Hold to wall", so it needs no button of its own). */}
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, rowGap: 8, flexWrap: "wrap" }}>
                  <UndertoneTag hex={s.hex} />
                  <span style={{ flex: 1 }} />
                  <span style={{ display: "inline-flex", gap: 6 }}>
                    <button
                      type="button"
                      className="hv-card-action"
                      onClick={() => toggleCompare(s)}
                      aria-pressed={comparing}
                      aria-label={comparing ? `Remove ${nameOf(s)} from compare` : `Compare ${nameOf(s)} with other shades`}
                      title={comparing ? "Remove from compare" : compareCodes.length >= COMPARE_MAX ? `Compare is full (${COMPARE_MAX})` : "Add to compare"}
                      style={comparing ? { color: "var(--accent)", borderColor: "var(--accent)" } : undefined}
                    >
                      <CompareIcon />
                    </button>
                    <button
                      type="button"
                      className="hv-card-action"
                      onClick={() => setFanShade(s)}
                      aria-label={`Open the lighter-to-darker strip around ${nameOf(s)}, with a full-screen hold-to-wall view`}
                      title="Shade strip · lighter to darker, hold to wall"
                    >
                      <StripIcon />
                    </button>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {hasMore && (
        <div ref={sentinelRef} aria-hidden style={{ marginTop: 80, textAlign: "center" }}>
          <Mono>Loading more shades…</Mono>
        </div>
      )}
      {sorted.length === 0 && (
        <div style={{ marginTop: 80, textAlign: "center" }}>
          <Note style={{ display: "block", marginBottom: 24 }}>Nothing matches {emptyCause} — try clearing the filters.</Note>
          <button type="button" className="btn btn-ghost" onClick={clearAll}>Clear all filters</button>
        </div>
      )}

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
      <BackToTop />

      <style>{`
        /* 10k-shade catalogues: skip layout + paint for cards far off-screen. */
        .hv-shade-card { transition: transform .35s var(--ease); content-visibility: auto; contain-intrinsic-size: auto 200px auto 320px; }
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

/**
 * One chip, half of it inked — two tones held against each other.
 *
 * This was two small outlined rectangles side by side. At the 16px it actually
 * renders at, an outlined rectangle is exactly what a browser draws for a
 * character it has no glyph for, so a pair of them read as a font that had
 * failed to load rather than as an icon — the tool row looked broken on every
 * card in the catalogue. Half the shape is solid now, which is a thing no
 * missing-glyph box is ever filled in as.
 */
function CompareIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
      <path d="M12 5.6h4.9a1.5 1.5 0 0 1 1.5 1.5v9.8a1.5 1.5 0 0 1-1.5 1.5H12z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** The paper shade card: one chip, banded lightest to darkest down its face. */
function StripIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      {/* Filled bands, not hairlines: at 16px a ruled band disappears. */}
      <rect x="7.4" y="6.2" width="9.2" height="3.4" rx=".8" fill="currentColor" opacity=".3" stroke="none" />
      <rect x="7.4" y="10.3" width="9.2" height="3.4" rx=".8" fill="currentColor" opacity=".62" stroke="none" />
      <rect x="7.4" y="14.4" width="9.2" height="3.4" rx=".8" fill="currentColor" opacity=".95" stroke="none" />
    </svg>
  );
}

/**
 * Back to the top of an infinite list.
 *
 * With no pagination and 10k shades there was no way back short of a long
 * flick, and nothing said how deep you were. Appears once the reader is well
 * past the first screen.
 */
function BackToTop() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > 1200);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (!shown) return null;
  return (
    <button
      type="button"
      className="hv-back-to-top"
      aria-label="Back to the top of the catalogue"
      title="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
    >
      ↑
    </button>
  );
}
