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

const TABS = ["Catalogue", "AI Suggest", "Custom"] as const;
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
    if (tabId === "AI Suggest") return "AI Suggest";
    return "Custom";
  };

  const tabIcon = (tabId: Tab) => {
    if (tabId === "Catalogue") return <PaletteIcon />;
    if (tabId === "AI Suggest") return <SparkleIcon />;
    return <DropperIcon />;
  };

  const showCoordinate =
    Boolean(baseHex) && Boolean(activeRegionId) && Boolean(onApplyToRegion) && (regions?.length ?? 0) > 0;

  return (
    <div className="hv-studio-panel">
      <div className="hv-studio-tabs" role="tablist">
        {TABS.map((tabId) => {
          const isActive = tab === tabId;
          return (
            <button
              key={tabId}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setTab(tabId)}
              className={`hv-studio-tab ${isActive ? "is-active" : ""}`}
            >
              {tabIcon(tabId)}
              {tabLabel(tabId)}
            </button>
          );
        })}
      </div>

      {tab === "Catalogue" && (
        <div className="hv-studio-filter-bar">
          <div className="hv-studio-search">
            <span aria-hidden style={{ color: "var(--fg-mute)", display: "inline-flex" }}>
              <SearchIcon />
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or code"
              aria-label="Search by name or code"
            />
          </div>
          <div className="hv-studio-pills">
            {FAMILIES.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFamily(f)}
                className={`hv-studio-pill ${family === f ? "is-active" : ""}`}
              >
                {f}
              </button>
            ))}
          </div>

          {availableBrands.length > 1 && (
            <div className="hv-studio-pills">
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
                    className={`hv-studio-pill ${on ? "is-active" : ""}`}
                  >
                    {on ? "✓ " : ""}{brand}
                  </button>
                );
              })}
            </div>
          )}

          <div className="hv-studio-filter-row">
            <div className="hv-studio-pills">
              {([
                ["top50", "Top 50"],
                ["company", "By company"],
              ] as ReadonlyArray<readonly [Section, string]>).map(([key, lbl]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSection(key)}
                  aria-pressed={section === key}
                  className={`hv-studio-pill ${section === key ? "is-active" : ""}`}
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
        </div>
      )}

      <div className="hv-studio-scroll">
        <RegionStrip
          regions={regions}
          activeRegionId={activeRegionId}
          onSelectRegion={onSelectRegion}
          onAddWall={onAddWall}
          masksRemaining={masksRemaining}
        />

        {tab === "Catalogue" && (
          <>
            {shown.length === 0 ? (
              <p className="hv-studio-empty">No shades match. Clear the search or family filter.</p>
            ) : section === "top50" ? (
              <SwatchGrid shades={top} selected={selected} onSelect={onSelect} hideCodes={hideCodes} />
            ) : (
              <div className="hv-studio-by-company">
                {byCompany.map(({ brand, list }) => (
                  <div key={brand}>
                    <div className="hv-studio-brand-head">
                      <span>{brand}</span>
                      <Mono>{list.length}</Mono>
                    </div>
                    <SwatchGrid shades={list} selected={selected} onSelect={onSelect} hideCodes={hideCodes} />
                  </div>
                ))}
              </div>
            )}
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

        {clashNote && (
          <div className="hv-studio-note" role="note">
            <p>⚠ {clashNote}</p>
          </div>
        )}

        {showCoordinate && (
          <div className="hv-studio-suggest-section">
            <Mono>Complete the look</Mono>
            <CoordinateSuggestions
              baseHex={baseHex!}
              activeRegionId={activeRegionId!}
              regions={regions!}
              catalogue={catalogue}
              onApplyToRegion={onApplyToRegion!}
            />
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

        {recentShades &&
          recentShades.length > 0 &&
          recentShades.some((s) => !(triedShades ?? []).some((t) => t.code === s.code)) && (
          <div className="hv-studio-recent-section">
            <Mono>Recent colours</Mono>
            <div className="hv-studio-recent-list">
              {recentShades.map((s) => (
                <button
                  key={s.code}
                  type="button"
                  onClick={() => onSelect(s)}
                  title={hideCodes ? s.name : `${s.name} · ${s.code}`}
                  aria-label={hideCodes ? `Apply ${s.name} again` : `Apply ${s.name} again, code ${s.code}`}
                  className="hv-studio-recent-swatch"
                  style={{ background: s.hex }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** A scrolling block of rectangular colour tiles. */
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
  return (
    <div className="hv-studio-swatches">
      {shades.map((s) => (
        <button
          key={s.code}
          type="button"
          onClick={() => onSelect(s)}
          aria-label={hideCodes ? s.name : `${s.name}, code ${s.code}`}
          className={`hv-studio-swatch ${selected === s.code ? "is-selected" : ""}`}
        >
          <span className="hv-studio-swatch-color" style={{ background: s.hex }} />
          <span className="hv-studio-swatch-label">
            {hideCodes ? s.name : `${s.name}`}
          </span>
        </button>
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
      <div className="hv-studio-detail">
        <Mono>No colour selected</Mono>
        <p className="hv-studio-detail-empty">
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
      className="hv-studio-chip"
    >
      <span aria-hidden className="hv-studio-chip-dot" style={{ background: s.hex }} />
      {s.name}
    </button>
  );

  return (
    <div className="hv-studio-detail">
      <div className="hv-studio-detail-head">
        <div className="hv-studio-detail-swatch" style={{ background: shade.hex }} />
        <div className="hv-studio-detail-info">
          <span className="hv-studio-detail-name">{shade.name}</span>
          <span className="hv-studio-detail-meta">
            {hideCodes ? `${shade.hex} · LRV ${shade.lrv}` : `${shade.code} · ${shade.hex} · LRV ${shade.lrv}`}
          </span>
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
        <div className="hv-studio-steppers">
          <button
            type="button"
            onClick={() => lighter && onSelectShade(lighter)}
            disabled={!lighter}
            title={lighter ? `One step lighter: ${lighter.name}` : "No lighter step in this family"}
            aria-label={lighter ? `Apply one step lighter, ${lighter.name}` : "No lighter step"}
            className="hv-studio-step"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => darker && onSelectShade(darker)}
            disabled={!darker}
            title={darker ? `One step darker: ${darker.name}` : "No darker step in this family"}
            aria-label={darker ? `Apply one step darker, ${darker.name}` : "No darker step"}
            className="hv-studio-step"
          >
            ↓
          </button>
        </div>
      </div>

      {darkRoomAlts.length > 0 && (
        <div className="hv-studio-note" role="note">
          <p>
            This is a deep shade (LRV {shade.lrv}) — the room may feel dark without strong light.
            Same colour, a step lighter:
          </p>
          <div className="hv-studio-note-chips">
            {darkRoomAlts.map(altChip)}
          </div>
        </div>
      )}

      {fadeRisky && (
        <div className="hv-studio-note" role="note">
          <p>
            Deep {hideCodes ? "shades like this" : `shades like ${shade.name}`} fade faster in
            strong Indian sun on outside walls.{fadeAlts.length > 0 ? " Nearby colours that hold up longer:" : ""}
          </p>
          {fadeAlts.length > 0 && (
            <div className="hv-studio-note-chips">
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

      <div className="hv-studio-detail-actions">
        <button
          type="button"
          onClick={onFindSimilar}
          className="btn btn-sm btn-ghost"
        >
          Find similar
        </button>
        <button
          type="button"
          onClick={onApply}
          title="Apply this shade to the active wall"
          className="btn btn-sm"
        >
          Apply to wall
        </button>
      </div>
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

function RegionStrip({
  regions,
  activeRegionId,
  onSelectRegion,
  onAddWall,
  masksRemaining,
}: {
  regions?: ReadonlyArray<RegionLite>;
  activeRegionId?: string;
  onSelectRegion?: (id: string) => void;
  onAddWall?: () => void;
  masksRemaining?: number;
}) {
  const list = regions ?? [];
  if (list.length === 0) return null;
  const addDisabled = masksRemaining !== undefined && masksRemaining <= 0;
  return (
    <div className="hv-studio-region-strip">
      <div className="hv-studio-region-strip-scroll">
        {list.map((r) => {
          const isActive = r.id === activeRegionId;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onSelectRegion?.(r.id)}
              aria-pressed={isActive}
              className={`hv-studio-region-chip ${isActive ? "is-active" : ""}`}
            >
              <span
                aria-hidden
                className="hv-studio-region-chip-dot"
                style={{ background: r.applied ? r.hex : undefined }}
              >
                {r.applied && "✓"}
              </span>
              <span className="hv-studio-region-chip-name">{r.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onAddWall?.()}
          disabled={addDisabled}
          title={addDisabled ? "You can add up to 3 walls" : "Draw a wall we missed"}
          className="hv-studio-add-wall-chip"
        >
          + Wall
        </button>
      </div>
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

function PaletteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
      <path d="M12 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
      <path d="M18 12a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
      <path d="M6 12a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2z" />
      <path d="M18 14l1 2.5L21.5 18l-2.5 1L18 21.5l-1-2.5L14.5 18l2.5-1L18 14z" />
    </svg>
  );
}

function DropperIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M19 11l-6-6-1.5 1.5" />
      <path d="M15 15l-3 3a2.828 2.828 0 1 1-4-4l3-3" />
      <path d="M14 7l3 3" />
      <path d="M5 19l-2 2" />
      <path d="M3 21l2-2" />
    </svg>
  );
}

