"use client";

import { useMemo, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { SHADES } from "@/lib/shades";
import {
  DARK_ROOM_LRV,
  fadeSaferAlternatives,
  lighterSteps,
  lightShift,
  LIGHT_SHIFT_BADGE,
  pairCeilingAndTrim,
  stepInFanDeck,
  sunFadeRisk,
} from "@/lib/color-science";
import { UndertoneTag } from "@/components/catalogue/undertone-tag";
import { CustomMatchPanel } from "./color-wheel";
import { CoordinateSuggestions, type RegionLite } from "./coordinate-suggestions";
import type { ColorFamily, PaintShade } from "@/lib/types";

function pickShade(shades: ReadonlyArray<PaintShade>, idx: number): PaintShade {
  return shades[idx] ?? shades[idx % shades.length] ?? shades[0]!;
}

const FAMILIES: ReadonlyArray<ColorFamily | "All"> = [
  "All",
  "Whites",
  "Neutrals",
  "Earths",
  "Reds",
  "Greens",
  "Blues",
  "Yellows",
  "Greys",
  "Browns",
];

const TABS = ["Catalogue", "AI Suggest", "Custom", "Regions"] as const;
type Tab = (typeof TABS)[number];

/** How the Catalogue tab groups its shades. */
type Section = "top50" | "company";
const TOP_N = 50;

interface ShadeGridProps {
  selected?: string;
  onSelect: (shade: PaintShade) => void;
  /** Apply a picked colour exactly (Custom tab), without snapping to a shade. */
  onApplyExact?: (hex: string) => void;
  activeShade?: PaintShade;
  activeRegionLabel?: string;
  /** Shades fetched from the backend; falls back to the bundled sample. */
  shades?: ReadonlyArray<PaintShade>;
  // --- Coordinate suggestions ("complete the look") ---
  /** Applied colour of the active region; drives the pairing suggestions. */
  baseHex?: string;
  activeRegionId?: string;
  regions?: ReadonlyArray<RegionLite>;
  /** Apply a coordinating shade to a specific region (not just the active one). */
  onApplyToRegion?: (regionId: string, shade: PaintShade) => void;
  /** Guest mode: hide real shade codes (guests pick by colour; the shop reads codes). */
  hideCodes?: boolean;
  /** Make a region the active paint target (Walls tab rows). */
  onSelectRegion?: (id: string) => void;
  /** Open the Mask Studio to draw a new wall. */
  onAddWall?: () => void;
  /** Hand-drawn masks still allowed (3-mask cap); disables "+ Add wall" at 0. */
  masksRemaining?: number;
  /** Shades previously applied to the ACTIVE region — one-tap re-apply. */
  triedShades?: ReadonlyArray<PaintShade>;
  /** Last shades tried anywhere in the project (newest first, max 10). */
  recentShades?: ReadonlyArray<PaintShade>;
  /** Outdoor photo: enables the sun-fade warning on risky shades. */
  outdoor?: boolean;
  /** Undertone-clash message computed across applied regions, if any. */
  clashNote?: string | null;
}

export function ShadeGrid({
  selected,
  onSelect,
  onApplyExact,
  activeShade,
  activeRegionLabel,
  shades,
  baseHex,
  activeRegionId,
  regions,
  onApplyToRegion,
  hideCodes = false,
  onSelectRegion,
  onAddWall,
  masksRemaining,
  triedShades,
  recentShades,
  outdoor = false,
  clashNote,
}: ShadeGridProps) {
  const [family, setFamily] = useState<(typeof FAMILIES)[number]>("All");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("Catalogue");
  const [section, setSection] = useState<Section>("top50");
  // Company filter — empty set means "every available brand". For guests the
  // incoming `shades` are already limited to the brands the shop unlocked, so
  // these checkboxes let them narrow further within that allowed set.
  const [selectedBrands, setSelectedBrands] = useState<Set<string>>(new Set());
  // Seed colour for the Custom (nearest-match) panel, set by a shade's "Find similar".
  const [customSeed, setCustomSeed] = useState<string | undefined>(undefined);

  const catalogue = useMemo<ReadonlyArray<PaintShade>>(
    () => (shades && shades.length > 0 ? shades : SHADES),
    [shades],
  );

  // Distinct paint companies present in the (already brand-scoped) catalogue, sorted.
  const availableBrands = useMemo(
    () => Array.from(new Set(catalogue.map((s) => s.brand))).sort((a, b) => a.localeCompare(b)),
    [catalogue],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalogue.filter((s) => {
      if (family !== "All" && s.family !== family) return false;
      if (selectedBrands.size > 0 && !selectedBrands.has(s.brand)) return false;
      if (!q) return true;
      return s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q) || s.hex.toLowerCase().includes(q);
    });
  }, [catalogue, family, selectedBrands, query]);

  const top = useMemo(() => shown.slice(0, TOP_N), [shown]);

  // Group the filtered shades by brand, preserving first-seen order.
  const byCompany = useMemo(() => {
    const map = new Map<string, PaintShade[]>();
    for (const s of shown) {
      const list = map.get(s.brand);
      if (list) list.push(s);
      else map.set(s.brand, [s]);
    }
    return Array.from(map, ([brand, list]) => ({ brand, list }));
  }, [shown]);

  const tabLabel = (tabId: Tab) => {
    if (tabId === "Catalogue") return "Colours";
    if (tabId === "AI Suggest") return "Suggestions";
    if (tabId === "Custom") return "Custom";
    return "Walls";
  };

  const showCoordinate =
    Boolean(baseHex) && Boolean(activeRegionId) && Boolean(onApplyToRegion) && (regions?.length ?? 0) > 0;

  return (
    <div
      className="hv-shade-grid"
      style={{ display: "flex", flexDirection: "column", borderLeft: "1px solid var(--rule)", height: "100%", minHeight: 0 }}
    >
      <div
        role="tablist"
        style={{
          borderBottom: "1px solid var(--rule)",
          display: "flex",
          background: "var(--surface)",
          flexShrink: 0,
        }}
      >
        {TABS.map((tabId) => {
          const isActive = tab === tabId;
          return (
            <button
              key={tabId}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setTab(tabId)}
              style={{
                flex: 1,
                textAlign: "center",
                padding: "12px 0",
                fontFamily: "var(--sans)",
                fontStyle: "normal",
                fontWeight: isActive ? 600 : 500,
                fontSize: 13,
                color: isActive ? "var(--fg)" : "var(--fg-mute)",
                borderBottom: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                marginBottom: -1,
                background: "transparent",
                borderTop: "none",
                borderLeft: "none",
                borderRight: "none",
                cursor: "pointer",
              }}
            >
              {tabLabel(tabId)}
            </button>
          );
        })}
      </div>

      {tab === "Catalogue" && (
        <>
          <div style={{ padding: 16, borderBottom: "1px solid var(--rule)", flexShrink: 0 }}>
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                border: "1px solid var(--rule-strong)",
                borderRadius: 6,
                
                padding: "8px 12px",
                background: "var(--surface)",
              }}
            >
              <span
                aria-hidden
                style={{
                  fontFamily: "var(--sans)",
                  fontStyle: "normal",
                  fontSize: 14,
                  color: "var(--fg-mute)",
                }}
              >
                <SearchIcon />
              </span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or code"
                aria-label="Search by name or code"
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "var(--fg)",
                  fontFamily: "var(--sans)",
                  fontStyle: "normal",
                  fontSize: 14,
                  padding: 0,
                }}
              />
            </div>
          </div>

          <div style={{ padding: 12, borderBottom: "1px solid var(--rule)", flexShrink: 0 }}>
            <Mono style={{ marginBottom: 10, display: "block" }}>Family</Mono>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {FAMILIES.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFamily(f)}
                  style={{
                    padding: "6px 10px",
                    font: "500 12px/1 var(--sans)",
                    border: "1px solid " + (family === f ? "var(--accent)" : "var(--rule)"),
                    borderRadius: 999,
                    color: family === f ? "var(--accent)" : "var(--fg-mute)",
                    background: family === f ? "var(--surface-soft)" : "transparent",
                    cursor: "pointer",
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* COMPANY filter — only shown when more than one brand is available. */}
          {availableBrands.length > 1 && (
            <div style={{ padding: 12, borderBottom: "1px solid var(--rule)", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <Mono>Company</Mono>
                {selectedBrands.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedBrands(new Set())}
                    style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--accent)", font: "500 11px/1 var(--sans)" }}
                  >
                    All companies
                  </button>
                )}
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {availableBrands.map((brand) => {
                  const on = selectedBrands.has(brand);
                  return (
                    <button
                      key={brand}
                      type="button"
                      onClick={() =>
                        setSelectedBrands((prev) => {
                          const next = new Set(prev);
                          if (next.has(brand)) next.delete(brand);
                          else next.add(brand);
                          return next;
                        })
                      }
                      aria-pressed={on}
                      style={{
                        padding: "6px 10px",
                        font: "500 12px/1 var(--sans)",
                        border: "1px solid " + (on ? "var(--accent)" : "var(--rule)"),
                        borderRadius: 999,
                        color: on ? "var(--accent)" : "var(--fg-mute)",
                        background: on ? "var(--surface-soft)" : "transparent",
                        cursor: "pointer",
                      }}
                    >
                      {on ? "✓ " : ""}{brand}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* TOP 50 ↔ BY COMPANY toggle */}
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid var(--rule)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", gap: 4 }}>
              {([
                ["top50", "Top 50"],
                ["company", "By company"],
              ] as ReadonlyArray<readonly [Section, string]>).map(([key, lbl]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSection(key)}
                  aria-pressed={section === key}
                  style={{
                    padding: "6px 12px",
                    border: "1px solid " + (section === key ? "var(--accent)" : "var(--rule)"),
                    borderRadius: 999,
                    color: section === key ? "var(--accent)" : "var(--fg-mute)",
                    background: section === key ? "var(--surface-soft)" : "transparent",
                    cursor: "pointer",
                    font: "500 12px/1 var(--sans)",
                  }}
                >
                  {lbl}
                </button>
              ))}
            </div>
            <Mono>
              {section === "top50"
                ? `${top.length} of ${shown.length}`
                : `${byCompany.length} ${byCompany.length === 1 ? "brand" : "brands"}`}
            </Mono>
          </div>

          {/* Scrolling colour area — fixed-size swatches, the IMAGE never resizes. */}
          <div style={{ padding: 16, flex: 1, minHeight: 0, overflow: "auto" }}>
            {shown.length === 0 ? (
              <p style={{ font: "400 14px/1.4 var(--serif)", color: "var(--fg-mute)" }}>
                No shades match. Clear the search or family filter.
              </p>
            ) : section === "top50" ? (
              <SwatchGrid shades={top} selected={selected} onSelect={onSelect} hideCodes={hideCodes} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {byCompany.map(({ brand, list }) => (
                  <div key={brand}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        justifyContent: "space-between",
                        marginBottom: 10,
                      }}
                    >
                      <span
                        style={{
                          font: "600 14px/1 var(--sans)",
                          color: "var(--fg)",
                        }}
                      >
                        {brand}
                      </span>
                      <Mono>{list.length}</Mono>
                    </div>
                    <SwatchGrid shades={list} selected={selected} onSelect={onSelect} hideCodes={hideCodes} />
                  </div>
                ))}
              </div>
            )}

            {showCoordinate && (
              <CoordinateSuggestions
                baseHex={baseHex!}
                activeRegionId={activeRegionId!}
                regions={regions!}
                catalogue={catalogue}
                onApplyToRegion={onApplyToRegion!}
              />
            )}

            {activeRegionLabel && (
              <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ font: "400 13px/1.3 var(--sans)", color: "var(--fg-mute)" }}>
                  {`Will paint: ${activeRegionLabel}`}
                </span>
              </div>
            )}
          </div>
        </>
      )}

      {tab === "AI Suggest" && (
        <AISuggestPanel onSelect={onSelect} catalogue={catalogue} />
      )}

      {tab === "Custom" && (
        <CustomMatchPanel
          onSelect={onSelect}
          onApplyExact={onApplyExact}
          catalogue={catalogue}
          activeRegionLabel={activeRegionLabel}
          initialHex={customSeed}
        />
      )}

      {tab === "Regions" && (
        <RegionsListPanel
          regions={regions}
          activeRegionId={activeRegionId}
          hideCodes={hideCodes}
          onPickRegion={(id) => {
            onSelectRegion?.(id);
            setTab("Catalogue");
          }}
          onAddWall={onAddWall}
          masksRemaining={masksRemaining}
        />
      )}

      {clashNote && (
        <div
          role="note"
          style={{
            padding: "10px 16px",
            borderTop: "1px solid var(--rule)",
            flexShrink: 0,
            font: "400 12.5px/1.45 var(--sans)",
            color: "var(--fg-soft)",
            background: "var(--surface)",
          }}
        >
          ⚠ {clashNote}
        </div>
      )}

      {triedShades && triedShades.length > 0 && (
        <div
          style={{
            padding: "10px 16px",
            borderTop: "1px solid var(--rule)",
            flexShrink: 0,
          }}
        >
          <Mono style={{ display: "block", marginBottom: 8 }}>Tried on this wall</Mono>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {triedShades.map((s) => (
              <button
                key={s.code}
                type="button"
                onClick={() => onSelect(s)}
                title={hideCodes ? s.name : `${s.name} · ${s.code}`}
                aria-label={hideCodes ? `Reapply ${s.name}` : `Reapply ${s.name}, code ${s.code}`}
                style={{
                  width: 28,
                  height: 28,
                  // Keeps the swatch square on touch devices, where the global
                  // coarse-pointer rule would stretch buttons to 44px tall.
                  minHeight: 28,
                  background: s.hex,
                  border: "1px solid var(--rule-strong)",
                  borderRadius: 4,
                  cursor: "pointer",
                  padding: 0,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Across-walls memory: "that pink from before", one tap away. Only
          shown when it offers something the per-wall row above doesn't. */}
      {recentShades &&
        recentShades.length > 0 &&
        recentShades.some((s) => !(triedShades ?? []).some((t) => t.code === s.code)) && (
        <div
          style={{
            padding: "10px 16px",
            borderTop: "1px solid var(--rule)",
            flexShrink: 0,
          }}
        >
          <Mono style={{ display: "block", marginBottom: 8 }}>Recently tried · all walls</Mono>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {recentShades.map((s) => (
              <button
                key={s.code}
                type="button"
                onClick={() => onSelect(s)}
                title={hideCodes ? s.name : `${s.name} · ${s.code}`}
                aria-label={hideCodes ? `Apply ${s.name} again` : `Apply ${s.name} again, code ${s.code}`}
                style={{
                  width: 28,
                  height: 28,
                  minHeight: 28,
                  background: s.hex,
                  border: "1px solid var(--rule-strong)",
                  borderRadius: 4,
                  cursor: "pointer",
                  padding: 0,
                }}
              />
            ))}
          </div>
        </div>
      )}

      <SelectedShadeDetail
        shade={activeShade}
        catalogue={catalogue}
        outdoor={outdoor}
        onSelectShade={onSelect}
        onFindSimilar={
          activeShade
            ? () => {
                setCustomSeed(activeShade.hex);
                setTab("Custom");
              }
            : undefined
        }
        onApply={activeShade ? () => onSelect(activeShade) : undefined}
        hideCodes={hideCodes}
      />
    </div>
  );
}

/** A scrolling block of fixed-size square swatches. */
function SwatchGrid({
  shades,
  selected,
  onSelect,
  hideCodes = false,
}: {
  shades: ReadonlyArray<PaintShade>;
  selected?: string;
  onSelect: (shade: PaintShade) => void;
  hideCodes?: boolean;
}) {
  const tile = 50;
  return (
    <div
      className="hv-swatches"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fill, ${tile}px)`,
        gap: 6,
        justifyContent: "space-between",
      }}
    >
      {shades.map((s) => (
        <button
          key={s.code}
          type="button"
          onClick={() => onSelect(s)}
          title={hideCodes ? s.name : `${s.name} · ${s.code}`}
          aria-label={hideCodes ? s.name : `${s.name}, code ${s.code}`}
          style={{
            background: s.hex,
            width: "100%",
            height: tile,
            border: "none",
            cursor: "pointer",
            padding: 0,
            outline: selected === s.code ? "2px solid var(--accent)" : "none",
            outlineOffset: 2,
            borderRadius: 4,
          }}
        />
      ))}
    </div>
  );
}

function SelectedShadeDetail({
  shade,
  catalogue,
  outdoor = false,
  onSelectShade,
  onFindSimilar,
  onApply,
  hideCodes = false,
}: {
  shade?: PaintShade;
  catalogue: ReadonlyArray<PaintShade>;
  outdoor?: boolean;
  /** Applies any shade (steppers and warning alternatives use this). */
  onSelectShade: (shade: PaintShade) => void;
  onFindSimilar?: () => void;
  onApply?: () => void;
  hideCodes?: boolean;
}) {
  // All hooks before the early return — React requires a stable hook order.
  const lighter = useMemo(
    () => (shade ? stepInFanDeck(shade, catalogue, -1) : undefined),
    [shade, catalogue],
  );
  const darker = useMemo(
    () => (shade ? stepInFanDeck(shade, catalogue, 1) : undefined),
    [shade, catalogue],
  );
  const darkRoomAlts = useMemo(
    () => (shade && shade.lrv < DARK_ROOM_LRV && !outdoor ? lighterSteps(shade, catalogue, 2) : []),
    [shade, catalogue, outdoor],
  );
  const fadeRisky = useMemo(() => Boolean(shade && outdoor && sunFadeRisk(shade)), [shade, outdoor]);
  const fadeAlts = useMemo(
    () => (shade && fadeRisky ? fadeSaferAlternatives(shade, catalogue, 2) : []),
    [shade, catalogue, fadeRisky],
  );
  const pairing = useMemo(
    () => (shade ? pairCeilingAndTrim(shade, catalogue) : {}),
    [shade, catalogue],
  );
  const shift = useMemo(() => (shade ? lightShift(shade.hex) : null), [shade]);

  if (!shade) {
    return (
      <div
        style={{
          borderTop: "1px solid var(--rule)",
          padding: 16,
          background: "var(--surface-soft)",
          flexShrink: 0,
        }}
      >
        <Mono>No colour selected</Mono>
        <p
          style={{
            font: "400 13px/1.5 var(--sans)",
            color: "var(--fg-soft)",
            margin: "6px 0 0",
          }}
        >
          Pick a colour above. It paints the selected wall straight away.
        </p>
      </div>
    );
  }

  const altChip = (s: PaintShade) => (
    <button
      key={s.code}
      type="button"
      onClick={() => onSelectShade(s)}
      title={hideCodes ? s.name : `${s.name} · ${s.code}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: "5px 10px 5px 5px",
        border: "1px solid var(--rule-strong)",
        borderRadius: 999,
        background: "var(--surface)",
        color: "var(--fg)",
        font: "500 12px/1 var(--sans)",
        cursor: "pointer",
      }}
    >
      <span aria-hidden style={{ width: 18, height: 18, minHeight: 18, borderRadius: "50%", background: s.hex, border: "1px solid var(--rule-strong)" }} />
      {s.name}
    </button>
  );

  return (
    <div
      style={{
        borderTop: "1px solid var(--rule)",
        padding: 16,
        background: "var(--surface-soft)",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <div
          style={{
            width: 48,
            height: 48,
            background: shade.hex,
            border: "1px solid var(--rule-strong)",
            borderRadius: 6,
            flexShrink: 0,
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 }}>
          <span
            style={{
              fontFamily: "var(--sans)",
              fontWeight: 600,
              fontSize: 16,
              lineHeight: 1.2,
              color: "var(--fg)",
            }}
          >
            {shade.name}
          </span>
          <Mono>{hideCodes ? `${shade.hex} · LRV ${shade.lrv}` : `${shade.code} · ${shade.hex} · LRV ${shade.lrv}`}</Mono>
          <span style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <UndertoneTag hex={shade.hex} prefix />
            {shift && shift.score >= LIGHT_SHIFT_BADGE && (
              <span
                title="This colour changes noticeably under a warm evening bulb"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "400 10px/1 var(--mono)", letterSpacing: ".12em", textTransform: "uppercase", color: "var(--fg-mute)" }}
              >
                <span aria-hidden style={{ width: 14, height: 8, borderRadius: 2, background: `linear-gradient(90deg, ${shade.hex} 50%, ${shift.warmHex} 50%)`, border: "1px solid var(--rule-strong)" }} />
                shifts in lamplight
              </span>
            )}
          </span>
        </div>
        {/* Fan-deck steppers: flip through the strip like a paper shade card. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => lighter && onSelectShade(lighter)}
            disabled={!lighter}
            title={lighter ? `One step lighter: ${lighter.name}` : "No lighter step in this family"}
            aria-label={lighter ? `Apply one step lighter, ${lighter.name}` : "No lighter step"}
            className="hv-step-btn"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => darker && onSelectShade(darker)}
            disabled={!darker}
            title={darker ? `One step darker: ${darker.name}` : "No darker step in this family"}
            aria-label={darker ? `Apply one step darker, ${darker.name}` : "No darker step"}
            className="hv-step-btn"
          >
            ↓
          </button>
        </div>
      </div>

      {darkRoomAlts.length > 0 && (
        <div role="note" style={{ marginTop: 12, padding: "10px 12px", border: "1px solid var(--rule)", borderRadius: 8, background: "var(--surface)" }}>
          <p style={{ margin: 0, font: "400 12.5px/1.45 var(--sans)", color: "var(--fg-soft)" }}>
            This is a deep shade (LRV {shade.lrv}) — the room may feel dark without strong light.
            Same colour, a step lighter:
          </p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {darkRoomAlts.map(altChip)}
          </div>
        </div>
      )}

      {fadeRisky && (
        <div role="note" style={{ marginTop: 12, padding: "10px 12px", border: "1px solid var(--rule)", borderRadius: 8, background: "var(--surface)" }}>
          <p style={{ margin: 0, font: "400 12.5px/1.45 var(--sans)", color: "var(--fg-soft)" }}>
            Deep {hideCodes ? "shades like this" : `shades like ${shade.name}`} fade faster in
            strong Indian sun on outside walls.{fadeAlts.length > 0 ? " Nearby colours that hold up longer:" : ""}
          </p>
          {fadeAlts.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {fadeAlts.map(altChip)}
            </div>
          )}
        </div>
      )}

      {(pairing.ceiling || pairing.trim) && (
        <div style={{ marginTop: 12 }}>
          <Mono style={{ display: "block", marginBottom: 6 }}>Goes with</Mono>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {pairing.ceiling && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7, font: "400 12px/1.2 var(--sans)", color: "var(--fg-soft)" }}>
                <span aria-hidden style={{ width: 16, height: 16, borderRadius: 4, background: pairing.ceiling.hex, border: "1px solid var(--rule-strong)" }} />
                Ceiling: {pairing.ceiling.name}{hideCodes ? "" : ` · ${pairing.ceiling.code}`}
              </span>
            )}
            {pairing.trim && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7, font: "400 12px/1.2 var(--sans)", color: "var(--fg-soft)" }}>
                <span aria-hidden style={{ width: 16, height: 16, borderRadius: 4, background: pairing.trim.hex, border: "1px solid var(--rule-strong)" }} />
                Trim: {pairing.trim.name}{hideCodes ? "" : ` · ${pairing.trim.code}`}
              </span>
            )}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button
          type="button"
          onClick={onFindSimilar}
          style={{
            padding: "8px 12px",
            font: "500 12px/1 var(--sans)",
            border: "1px solid var(--rule-strong)",
            borderRadius: 6,
            background: "var(--surface)",
            color: "var(--fg)",
            cursor: "pointer",
          }}
        >
          Find similar
        </button>
        <button
          type="button"
          onClick={onApply}
          title="Apply this shade to the active wall"
          style={{
            padding: "8px 12px",
            font: "500 12px/1 var(--sans)",
            border: "1px solid var(--rule-strong)",
            borderRadius: 6,
            background: "var(--surface)",
            color: "var(--fg)",
            cursor: "pointer",
          }}
        >
          Apply to wall
        </button>
      </div>
      <style>{`
        .hv-step-btn { width: 30px; height: 24px; min-height: 24px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--rule-strong); border-radius: 6px; background: var(--surface); color: var(--fg); cursor: pointer; font: 500 13px/1 var(--sans); padding: 0; }
        .hv-step-btn:disabled { opacity: .35; cursor: default; }
      `}</style>
    </div>
  );
}

function AISuggestPanel({
  onSelect,
  catalogue,
}: {
  onSelect: (shade: PaintShade) => void;
  catalogue: ReadonlyArray<PaintShade>;
}) {
  const combos = [
    { name: "Quiet morning", rationale: "Soft ivory main, sage accent, slate trim.", shades: [pickShade(catalogue, 0), pickShade(catalogue, 14), pickShade(catalogue, 16)] },
    { name: "Warm afternoon", rationale: "Earthy and warm; reads well in sun.", shades: [pickShade(catalogue, 5), pickShade(catalogue, 12), pickShade(catalogue, 0)] },
    { name: "Cool evening", rationale: "For studies and reading rooms.", shades: [pickShade(catalogue, 17), pickShade(catalogue, 15), pickShade(catalogue, 3)] },
  ];
  return (
    <div style={{ padding: 16, flex: 1, minHeight: 0, overflow: "auto" }}>
      <Mono style={{ display: "block", marginBottom: 14 }}>Three suggestions</Mono>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {combos.map((c) => (
          <div
            key={c.name}
            style={{
              border: "1px solid var(--rule)",
              padding: 14,
              borderRadius: 8,
              background: "var(--surface)",
            }}
          >
            <div
              style={{ font: "600 14px/1.2 var(--sans)", color: "var(--fg)" }}
            >
              {c.name}
            </div>
            <p
              style={{
                font: "400 13px/1.45 var(--sans)",
                color: "var(--fg-mute)",
                margin: "6px 0 12px",
              }}
            >
              {c.rationale}
            </p>
            <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
              {c.shades.map((s) => (
                <button
                  key={s.code}
                  type="button"
                  onClick={() => onSelect(s)}
                  title={`${s.name} · ${s.code}`}
                  aria-label={`Apply ${s.name}`}
                  style={{
                    flex: 1,
                    aspectRatio: "1 / 1",
                    background: s.hex,
                    border: "1px solid var(--rule-strong)",
                    borderRadius: 4,
                    cursor: "pointer",
                    padding: 0,
                  }}
                />
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => onSelect(c.shades[0]!)}
                className="btn btn-sm"
              >
                Apply
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RegionsListPanel({
  regions,
  activeRegionId,
  hideCodes = false,
  onPickRegion,
  onAddWall,
  masksRemaining,
}: {
  regions?: ReadonlyArray<RegionLite>;
  activeRegionId?: string;
  hideCodes?: boolean;
  /** Selects the region AND flips back to the Catalogue tab to pick its colour. */
  onPickRegion: (id: string) => void;
  onAddWall?: () => void;
  masksRemaining?: number;
}) {
  const list = regions ?? [];
  const addDisabled = masksRemaining !== undefined && masksRemaining <= 0;
  return (
    <div style={{ padding: 16, flex: 1, minHeight: 0, overflow: "auto" }}>
      <Mono style={{ display: "block", marginBottom: 10 }}>Detected walls</Mono>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {list.map((r) => {
          const isActive = r.id === activeRegionId;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onPickRegion(r.id)}
              aria-pressed={isActive}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                background: isActive ? "var(--surface-soft)" : "transparent",
                border: "1px solid " + (isActive ? "var(--rule-strong)" : "var(--rule)"),
                borderRadius: 6,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: r.applied ? r.hex : "transparent",
                  border: "1px solid var(--rule-strong)",
                  flexShrink: 0,
                }}
              />
              <span style={{ font: "500 13px/1.2 var(--sans)", color: "var(--fg)", flex: 1, minWidth: 0 }}>
                {r.label}
              </span>
              <span style={{ font: "400 11px/1 var(--mono)", color: "var(--fg-mute)", whiteSpace: "nowrap" }}>
                {r.applied ? (hideCodes ? "" : r.shadeCode ?? "") : "No colour yet"}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onAddWall?.()}
          disabled={addDisabled}
          title={addDisabled ? "You can add up to 3 walls" : "Draw a wall we missed"}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            background: "transparent",
            border: "1px dashed var(--rule-strong)",
            borderRadius: 6,
            color: "var(--fg-soft)",
            font: "500 13px/1.2 var(--sans)",
            cursor: addDisabled ? "not-allowed" : "pointer",
            opacity: addDisabled ? 0.5 : 1,
          }}
        >
          + Add wall
        </button>
      </div>
      <p style={{ font: "400 12px/1.5 var(--sans)", color: "var(--fg-mute)", margin: "10px 0 0" }}>
        Tap a wall above, then pick its colour.
      </p>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}
