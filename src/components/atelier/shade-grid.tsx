"use client";

import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Mono } from "@/components/ui/eyebrow";
import { SHADES } from "@/lib/shades";
import {
  DARK_ROOM_LRV,
  fadeSaferAlternatives,
  fanDeckNeighbors,
  lighterSteps,
  lightShift,
  LIGHT_SHIFT_BADGE,
  pairCeilingAndTrim,
  sunFadeRisk,
} from "@/lib/color-science";
import { UndertoneTag } from "@/components/catalogue/undertone-tag";
import { generatePalettes } from "@/lib/palettes";
import { mapToPaintShade } from "@/lib/catalogue";
import { HttpError } from "@/lib/http-error";
import { CustomMatchPanel } from "./color-wheel";
import { CoordinateSuggestions, type RegionLite } from "./coordinate-suggestions";
import type {
  AiColorCombo,
  AiMatchedShade,
  AiRecommendationResponse,
  PaintShade,
  RegionKind,
  RetailerCombo,
} from "@/lib/types";

const TABS = ["Catalogue", "AI Suggest", "Custom"] as const;
type Tab = (typeof TABS)[number];

// Light/Medium/Dark quick filter, in LRV terms a painter would recognise.
const TONES = ["All", "Light", "Medium", "Dark"] as const;
type Tone = (typeof TONES)[number];
const toneOf = (lrv: number): Exclude<Tone, "All"> =>
  lrv >= 55 ? "Light" : lrv >= 25 ? "Medium" : "Dark";

/** How the Catalogue tab groups its shades. */
type Section = "top50" | "company";
const TOP_N = 50;
// With a 10k+ catalogue a company can hold thousands of shades — mounting them all
// at once freezes the panel. Each company starts with one screenful and grows in
// steps as the user asks for more.
const COMPANY_INITIAL = 48;
const COMPANY_STEP = 240;

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
  /** With hideCodes: show this shop-scheme encoding of the code instead of nothing,
   *  so the counter reads the shade straight off the guest's screen. */
  encodeCode?: (code: string) => string;
  /** Make a region the active paint target (Walls tab rows). */
  onSelectRegion?: (id: string) => void;
  /** Open the Mask Studio to draw a new wall. */
  onAddWall?: () => void;
  /** Open the Mask Studio to REFINE a region's existing mask (AI-detected or hand-drawn). */
  onEditWall?: (id: string) => void;
  /** Remove a hand-drawn wall (only offered for custom regions). */
  onDeleteWall?: (id: string) => void;
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
  /** Ask Claude for palettes tuned to THIS photo (costs 1 AI preview). Absent
   *  for guests and until the project exists — the section hides itself. */
  onFetchAiPalettes?: () => Promise<AiRecommendationResponse>;
  /** The shop's predefined combinations (AI Suggest tab). Absent/empty = hidden. */
  shopCombos?: ReadonlyArray<RetailerCombo>;
}

/**
 * The studio's right-hand colour panel, laid out in FIXED ZONES so nothing
 * jumps around while the user browses:
 *
 *   tabs → filters (Catalogue) → wall strip → [scrollable browse area] → dock
 *
 * Only the browse area scrolls. The wall strip stays reachable at the top and
 * the dock — selected colour, its tips and the recent strip — stays pinned at
 * the bottom, so tapping any swatch anywhere gives feedback in the same spot.
 */
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
  encodeCode,
  onSelectRegion,
  onAddWall,
  onEditWall,
  onDeleteWall,
  masksRemaining,
  triedShades,
  recentShades,
  outdoor = false,
  clashNote,
  onFetchAiPalettes,
  shopCombos,
}: ShadeGridProps) {
  const [family, setFamily] = useState<string>("All");
  const [tone, setTone] = useState<Tone>("All");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("Catalogue");
  const [section, setSection] = useState<Section>("top50");
  // Family/depth/company pills live behind a toggle so the fixed header stays
  // compact; the button shows how many filters are currently narrowing the grid.
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Company filter — empty set means "every available brand". For guests the
  // incoming `shades` are already limited to the brands the shop unlocked, so
  // these checkboxes let them narrow further within that allowed set.
  const [selectedBrands, setSelectedBrands] = useState<Set<string>>(new Set());
  // How many swatches each company section currently shows (keyed by brand name).
  const [companyVisible, setCompanyVisible] = useState<Record<string, number>>({});
  // Seed colour for the Custom (nearest-match) panel, set by a shade's "Find similar".
  const [customSeed, setCustomSeed] = useState<string | undefined>(undefined);
  // Keep keystrokes snappy on a 10k-shade catalogue: the input updates immediately,
  // the filtered grid re-renders at deferred priority.
  const deferredQuery = useDeferredValue(query);

  // Each tab starts at the top of the browse area instead of wherever the
  // previous tab left the scrollbar.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [tab]);

  const catalogue = useMemo<ReadonlyArray<PaintShade>>(
    () => (shades && shades.length > 0 ? shades : SHADES),
    [shades],
  );

  // Distinct paint companies present in the (already brand-scoped) catalogue, sorted.
  const availableBrands = useMemo(
    () => Array.from(new Set(catalogue.map((s) => s.brand))).sort((a, b) => a.localeCompare(b)),
    [catalogue],
  );

  // Family pills come from whatever families the shades table actually holds.
  const families = useMemo(
    () => ["All", ...Array.from(new Set(catalogue.map((s) => s.family))).sort((a, b) => a.localeCompare(b))],
    [catalogue],
  );

  const shown = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return catalogue.filter((s) => {
      if (family !== "All" && s.family !== family) return false;
      if (tone !== "All" && toneOf(s.lrv) !== tone) return false;
      if (selectedBrands.size > 0 && !selectedBrands.has(s.brand)) return false;
      if (!q) return true;
      return s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q) || s.hex.toLowerCase().includes(q);
    });
  }, [catalogue, family, tone, selectedBrands, deferredQuery]);

  const top = useMemo(() => shown.slice(0, TOP_N), [shown]);

  // Stable identity so the memoised CompanySection isn't re-rendered by a new callback.
  const showMoreOfCompany = useCallback((brand: string, next: number) => {
    setCompanyVisible((prev) => ({ ...prev, [brand]: next }));
  }, []);

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

  const activeFilterCount = (family !== "All" ? 1 : 0) + (tone !== "All" ? 1 : 0) + selectedBrands.size;
  const clearFilters = () => {
    setFamily("All");
    setTone("All");
    setSelectedBrands(new Set());
  };

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
          <div className="hv-studio-filter-row">
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
            <button
              type="button"
              onClick={() => setFiltersOpen((o) => !o)}
              aria-expanded={filtersOpen}
              className={`hv-studio-filter-toggle ${filtersOpen || activeFilterCount > 0 ? "is-active" : ""}`}
            >
              <FilterIcon />
              Filters{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}
            </button>
          </div>

          {filtersOpen && (
            <div className="hv-studio-filter-groups">
              <div className="hv-studio-filter-group">
                <Mono>Family</Mono>
                <div className="hv-studio-pills">
                  {families.map((f) => (
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
              </div>

              <div className="hv-studio-filter-group">
                <Mono>Depth</Mono>
                <div className="hv-studio-pills" role="group" aria-label="Filter by depth">
                  {TONES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTone(t)}
                      aria-pressed={tone === t}
                      className={`hv-studio-pill ${tone === t ? "is-active" : ""}`}
                    >
                      {t === "All" ? "Any depth" : t}
                    </button>
                  ))}
                </div>
              </div>

              {availableBrands.length > 1 && (
                <div className="hv-studio-filter-group">
                  <Mono>Company</Mono>
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
                </div>
              )}

              {activeFilterCount > 0 && (
                <div className="hv-studio-pills">
                  <button type="button" onClick={clearFilters} className="hv-studio-pill">
                    ✕ Clear all filters
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="hv-studio-filter-row">
            <div className="hv-studio-seg" role="group" aria-label="Group colours">
              {([
                ["top50", "Top 50"],
                ["company", "By company"],
              ] as ReadonlyArray<readonly [Section, string]>).map(([key, lbl]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSection(key)}
                  aria-pressed={section === key}
                  className={`hv-studio-seg-btn ${section === key ? "is-active" : ""}`}
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

      <RegionStrip
        regions={regions}
        activeRegionId={activeRegionId}
        onSelectRegion={onSelectRegion}
        onAddWall={onAddWall}
        onEditWall={onEditWall}
        onDeleteWall={onDeleteWall}
        masksRemaining={masksRemaining}
      />

      <div className="hv-studio-scroll" ref={scrollRef}>
        {tab === "Catalogue" && (
          <>
            {shown.length === 0 ? (
              <p className="hv-studio-empty">No shades match. Clear the search, family or depth filter.</p>
            ) : section === "top50" ? (
              <SwatchGrid shades={top} selected={selected} onSelect={onSelect} hideCodes={hideCodes} encodeCode={encodeCode} />
            ) : (
              <div className="hv-studio-by-company">
                {byCompany.map(({ brand, list }) => (
                  <CompanySection
                    key={brand}
                    brand={brand}
                    list={list}
                    visible={companyVisible[brand] ?? COMPANY_INITIAL}
                    onShowMore={showMoreOfCompany}
                    selected={selected}
                    onSelect={onSelect}
                    hideCodes={hideCodes}
                    encodeCode={encodeCode}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {tab === "AI Suggest" && (
          <AISuggestPanel
            onSelect={onSelect}
            catalogue={catalogue}
            regions={regions}
            activeRegionId={activeRegionId}
            onApplyToRegion={onApplyToRegion}
            baseHex={baseHex}
            hideCodes={hideCodes}
            encodeCode={encodeCode}
            onFetchAiPalettes={onFetchAiPalettes}
            shopCombos={shopCombos}
            outdoor={outdoor}
          />
        )}

        {tab === "Custom" && (
          <CustomMatchPanel
            onSelect={onSelect}
            onApplyExact={onApplyExact}
            catalogue={catalogue}
            activeRegionLabel={activeRegionLabel}
            initialHex={customSeed}
            hideCodes={hideCodes}
            encodeCode={encodeCode}
          />
        )}
      </div>

      <SelectionDock
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
        encodeCode={encodeCode}
        clashNote={clashNote}
        recentShades={recentShades}
        triedShades={triedShades}
        selectedCode={selected}
      />
    </div>
  );
}

/** A scrolling block of rectangular colour tiles. */
function SwatchGrid({
  shades,
  selected,
  onSelect,
  hideCodes = false,
  encodeCode,
}: {
  shades: ReadonlyArray<PaintShade>;
  selected?: string;
  onSelect: (shade: PaintShade) => void;
  hideCodes?: boolean;
  encodeCode?: (code: string) => string;
}) {
  const codeLabel = (code: string) => (hideCodes ? (encodeCode ? encodeCode(code) : null) : code);
  return (
    <div className="hv-studio-swatches">
      {shades.map((s) => (
        <button
          key={s.code}
          type="button"
          onClick={() => onSelect(s)}
          title={codeLabel(s.code) ? `${s.name} · ${codeLabel(s.code)}` : s.name}
          aria-label={codeLabel(s.code) ? `${s.name}, code ${codeLabel(s.code)}` : s.name}
          className={`hv-studio-swatch ${selected === s.code ? "is-selected" : ""}`}
        >
          <span className="hv-studio-swatch-color" style={{ background: s.hex }} />
          <span className="hv-studio-swatch-label">
            {s.name}
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * One company's block in the "By company" view. Memoised so growing one company's
 * grid (or typing elsewhere) doesn't re-render every other company's swatches —
 * with 10k+ shades that re-render is what used to freeze the panel.
 */
const CompanySection = memo(function CompanySection({
  brand,
  list,
  visible,
  onShowMore,
  selected,
  onSelect,
  hideCodes,
  encodeCode,
}: {
  brand: string;
  list: ReadonlyArray<PaintShade>;
  visible: number;
  onShowMore: (brand: string, next: number) => void;
  selected?: string;
  onSelect: (shade: PaintShade) => void;
  hideCodes?: boolean;
  encodeCode?: (code: string) => string;
}) {
  const slice = useMemo(
    () => (list.length > visible ? list.slice(0, visible) : list),
    [list, visible],
  );
  return (
    <div>
      <div className="hv-studio-brand-head">
        <span>{brand}</span>
        <Mono>{slice.length < list.length ? `${slice.length} of ${list.length}` : list.length}</Mono>
      </div>
      <SwatchGrid shades={slice} selected={selected} onSelect={onSelect} hideCodes={hideCodes} encodeCode={encodeCode} />
      {slice.length < list.length && (
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          style={{ margin: "8px 16px 4px" }}
          onClick={() => onShowMore(brand, visible + COMPANY_STEP)}
        >
          Show {Math.min(COMPANY_STEP, list.length - slice.length)} more
        </button>
      )}
    </div>
  );
});

/**
 * Pinned footer of the panel. Three constant-height rows — tips (collapsible),
 * the selected colour, the recent strip — so applying a colour from ANY tab
 * shows up right here instead of somewhere down a long scroll.
 */
function SelectionDock({
  shade,
  catalogue,
  outdoor = false,
  onSelectShade,
  onFindSimilar,
  onApply,
  hideCodes = false,
  encodeCode,
  clashNote,
  recentShades,
  triedShades,
  selectedCode,
}: {
  shade?: PaintShade;
  catalogue: ReadonlyArray<PaintShade>;
  outdoor?: boolean;
  /** Applies any shade (steppers, warning alternatives and the recent strip use this). */
  onSelectShade: (shade: PaintShade) => void;
  onFindSimilar?: () => void;
  onApply?: () => void;
  hideCodes?: boolean;
  encodeCode?: (code: string) => string;
  clashNote?: string | null;
  recentShades?: ReadonlyArray<PaintShade>;
  triedShades?: ReadonlyArray<PaintShade>;
  selectedCode?: string;
}) {
  const [tipsOpen, setTipsOpen] = useState(false);

  // All hooks before any early return — React requires a stable hook order.
  // One strip build serves both steppers — each fanDeck pass filters and sorts
  // the whole catalogue, so asking for lighter and darker separately doubled it.
  const { lighter, darker } = useMemo(
    () => (shade ? fanDeckNeighbors(shade, catalogue) : {}),
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
  const triedCodes = useMemo(
    () => new Set((triedShades ?? []).map((t) => t.code)),
    [triedShades],
  );

  const shiftsInLamplight = Boolean(shift && shift.score >= LIGHT_SHIFT_BADGE);
  const tipCount =
    (clashNote ? 1 : 0) +
    (darkRoomAlts.length > 0 ? 1 : 0) +
    (fadeRisky ? 1 : 0) +
    ((pairing.ceiling || pairing.trim) ? 1 : 0) +
    (shiftsInLamplight ? 1 : 0);
  const hasWarning = Boolean(clashNote) || darkRoomAlts.length > 0 || fadeRisky;
  const canOpenTips = Boolean(shade) || Boolean(clashNote);

  const codeLabel = (code: string) => (hideCodes ? (encodeCode ? encodeCode(code) : null) : code);

  const altChip = (s: PaintShade) => (
    <button
      key={s.code}
      type="button"
      onClick={() => onSelectShade(s)}
      title={codeLabel(s.code) ? `${s.name} · ${codeLabel(s.code)}` : s.name}
      className="hv-studio-chip"
    >
      <span aria-hidden className="hv-studio-chip-dot" style={{ background: s.hex }} />
      {s.name}
    </button>
  );

  return (
    <div className="hv-studio-dock">
      {tipsOpen && canOpenTips && (
        <div className="hv-studio-dock-tips">
          {shade && (
            <div className="hv-studio-dock-tips-row">
              <UndertoneTag hex={shade.hex} prefix />
              {shiftsInLamplight && shift && (
                <span
                  title="This colour changes noticeably under a warm evening bulb"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "400 10px/1 var(--mono)", letterSpacing: ".12em", textTransform: "uppercase", color: "var(--fg-mute)" }}
                >
                  <span aria-hidden style={{ width: 14, height: 8, borderRadius: 2, background: `linear-gradient(90deg, ${shade.hex} 50%, ${shift.warmHex} 50%)`, border: "1px solid var(--rule-strong)" }} />
                  shifts in lamplight
                </span>
              )}
              {onFindSimilar && (
                <button type="button" onClick={onFindSimilar} className="btn btn-sm btn-ghost">
                  Find similar
                </button>
              )}
            </div>
          )}

          {clashNote && (
            <div className="hv-studio-note" role="note">
              <p>⚠ {clashNote}</p>
            </div>
          )}

          {shade && darkRoomAlts.length > 0 && (
            <div className="hv-studio-note" role="note">
              <p>
                This is a deep shade — the room may feel dark without strong light.
                Same colour, a step lighter:
              </p>
              <div className="hv-studio-note-chips">
                {darkRoomAlts.map(altChip)}
              </div>
            </div>
          )}

          {shade && fadeRisky && (
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
            <div>
              <Mono style={{ display: "block", marginBottom: 6 }}>Goes with</Mono>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                {pairing.ceiling && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 7, font: "400 12px/1.2 var(--sans)", color: "var(--fg-soft)" }}>
                    <span aria-hidden style={{ width: 16, height: 16, borderRadius: 4, background: pairing.ceiling.hex, border: "1px solid var(--rule-strong)" }} />
                    Ceiling: {pairing.ceiling.name}{codeLabel(pairing.ceiling.code) ? ` · ${codeLabel(pairing.ceiling.code)}` : ""}
                  </span>
                )}
                {pairing.trim && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 7, font: "400 12px/1.2 var(--sans)", color: "var(--fg-soft)" }}>
                    <span aria-hidden style={{ width: 16, height: 16, borderRadius: 4, background: pairing.trim.hex, border: "1px solid var(--rule-strong)" }} />
                    Trim: {pairing.trim.name}{codeLabel(pairing.trim.code) ? ` · ${codeLabel(pairing.trim.code)}` : ""}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="hv-studio-dock-row">
        <span
          aria-hidden
          className={`hv-studio-dock-swatch ${shade ? "" : "is-empty"}`}
          style={shade ? { background: shade.hex } : undefined}
        />
        <div className="hv-studio-dock-info" aria-live="polite">
          <span className="hv-studio-dock-name">{shade ? shade.name : "No colour selected"}</span>
          <span className="hv-studio-dock-meta">
            {shade
              ? [codeLabel(shade.code), shade.brand].filter(Boolean).join(" · ") || shade.family
              : "Tap any swatch — it paints the active wall"}
          </span>
        </div>
        <div className="hv-studio-dock-btns">
          {/* Fan-deck steppers: flip through the strip like a paper shade card. */}
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
          <button
            type="button"
            onClick={() => setTipsOpen((o) => !o)}
            disabled={!canOpenTips}
            aria-expanded={tipsOpen}
            title={canOpenTips ? "Advice for this colour: pairings, light and warnings" : "Pick a colour to see tips"}
            className={`hv-studio-dock-tipsbtn ${hasWarning ? "has-warn" : ""} ${tipsOpen ? "is-open" : ""}`}
          >
            {hasWarning ? "⚠ " : ""}Tips{tipCount > 0 ? ` (${tipCount})` : ""}
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={!onApply}
            title="Apply this shade to the active wall"
            className="btn btn-sm"
          >
            Apply
          </button>
        </div>
      </div>

      <div className="hv-studio-dock-recent">
        <Mono>Recent</Mono>
        {recentShades && recentShades.length > 0 ? (
          <div className="hv-studio-dock-recent-list">
            {recentShades.map((s) => (
              <button
                key={s.code}
                type="button"
                onClick={() => onSelectShade(s)}
                title={`${s.name}${codeLabel(s.code) ? ` · ${codeLabel(s.code)}` : ""}${triedCodes.has(s.code) ? " · tried on this wall" : ""}`}
                aria-label={`Apply ${s.name} again`}
                className={`hv-studio-dock-recent-swatch ${selectedCode === s.code ? "is-current" : ""}`}
                style={{ background: s.hex }}
              />
            ))}
          </div>
        ) : (
          <span className="hv-studio-dock-recent-empty">Colours you try will appear here</span>
        )}
      </div>
    </div>
  );
}

const PALETTE_ROLES = ["Main", "Accent", "Trim"] as const;

/**
 * One suggestion card, shared by "Room palettes", "Claude's picks" and the
 * shop's combos: three fixed role slots (Main / Accent / Trim) holding three
 * colours. Tap a swatch to put that colour on the active wall; DRAG a swatch
 * onto another role slot to swap the two colours' roles — palette A/B/C can
 * become C/B/A before "Apply all". Pointer-based so it works with both mouse
 * and touch: a mostly-horizontal press-and-move starts the drag, a vertical
 * one stays a scroll (swatches are `touch-action: pan-y`).
 */
function PaletteTrioCard({
  title,
  rationale,
  trio,
  onSelect,
  onApplyCombo,
  codeLabel,
  applyAllTitle,
}: {
  title: ReactNode;
  rationale?: string | null;
  trio: ReadonlyArray<PaintShade | undefined>;
  onSelect: (shade: PaintShade) => void;
  onApplyCombo: (shades: ReadonlyArray<PaintShade | undefined>) => void;
  codeLabel: (code: string) => string | null;
  applyAllTitle: string;
}) {
  // order[slot] = index into `trio` of the colour currently in that role slot.
  const [order, setOrder] = useState<number[]>([0, 1, 2]);
  // New shades (shuffle / re-ask / different combo) → back to the suggested roles.
  const trioKey = trio.map((s) => s?.code ?? "").join("|");
  useEffect(() => {
    setOrder([0, 1, 2]);
  }, [trioKey]);
  const arranged = order.map((i) => trio[i]);

  // Live drag: source slot, pointer position (for the floating colour ghost)
  // and the slot currently under the pointer. `overRef` mirrors `drag.over`
  // so pointer-up reads the latest target without re-registering listeners.
  const [drag, setDrag] = useState<{ from: number; x: number; y: number; over: number | null } | null>(null);
  const overRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const startPress = (slot: number) => (down: React.PointerEvent<HTMLButtonElement>) => {
    if (!arranged[slot]) return;
    if (down.pointerType === "mouse" && down.button !== 0) return;
    const startX = down.clientX;
    const startY = down.clientY;
    const pointerId = down.pointerId;
    let dragging = false;
    suppressClickRef.current = false;
    overRef.current = null;

    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!dragging) {
        if (Math.hypot(dx, dy) < 8) return;
        // A clearly vertical move is a scroll, not a role swap — let it go.
        if (Math.abs(dy) > Math.abs(dx) * 1.2) {
          cleanup();
          return;
        }
        dragging = true;
        suppressClickRef.current = true; // the pending click must not apply the shade
      }
      const el = typeof document.elementFromPoint === "function"
        ? document.elementFromPoint(e.clientX, e.clientY)
        : null;
      const slotEl = el instanceof Element ? el.closest("[data-trio-slot]") : null;
      const within = slotEl && rootRef.current ? rootRef.current.contains(slotEl) : false;
      const overSlot = within ? Number((slotEl as HTMLElement).dataset.trioSlot) : NaN;
      const over = Number.isInteger(overSlot) && overSlot !== slot ? overSlot : null;
      overRef.current = over;
      setDrag({ from: slot, x: e.clientX, y: e.clientY, over });
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      if (dragging) {
        const target = overRef.current;
        if (target !== null && target !== slot) {
          setOrder((o) => {
            const next = [...o];
            [next[slot], next[target]] = [next[target]!, next[slot]!];
            return next;
          });
        }
        setDrag(null);
      }
      cleanup();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const dragShade = drag ? arranged[drag.from] : undefined;

  return (
    <div ref={rootRef} className="hv-ai-card">
      <div className="hv-ai-card-name">{title}</div>
      {rationale && <p className="hv-ai-card-rationale">{rationale}</p>}
      <div className="hv-ai-trio">
        {arranged.map((s, slot) => {
          if (!s) return null;
          const code = codeLabel(s.code);
          const isSource = drag?.from === slot;
          const isTarget = drag?.over === slot;
          return (
            <button
              key={`${slot}-${s.code}`}
              type="button"
              data-trio-slot={slot}
              className={`hv-ai-swatch${isSource ? " is-drag-source" : ""}${isTarget ? " is-drop-target" : ""}`}
              onPointerDown={startPress(slot)}
              onClick={() => {
                if (suppressClickRef.current) {
                  suppressClickRef.current = false;
                  return;
                }
                onSelect(s);
              }}
              title={`${s.name}${code ? ` · ${code}` : ""} — tap for the active wall, drag onto another role to swap`}
              aria-label={`${PALETTE_ROLES[slot]}: ${s.name}${code ? ` (${code})` : ""}. Tap to apply to the active wall, drag onto another role to swap.`}
            >
              <span aria-hidden className="hv-ai-swatch-color" style={{ background: s.hex }} />
              <span className="hv-ai-swatch-role">{PALETTE_ROLES[slot]}</span>
              <span className="hv-ai-swatch-name">{s.name}</span>
              {code && <span className="hv-ai-swatch-code">{code}</span>}
            </button>
          );
        })}
      </div>
      <div className="hv-ai-card-actions">
        <button type="button" onClick={() => onApplyCombo(arranged)} className="btn btn-sm" title={applyAllTitle}>
          Apply all
        </button>
      </div>
      {drag && dragShade &&
        createPortal(
          <span
            className="hv-ai-drag-ghost"
            style={{ left: drag.x, top: drag.y, background: dragShade.hex }}
            aria-hidden
          />,
          document.body,
        )}
    </div>
  );
}

function AISuggestPanel({
  onSelect,
  catalogue,
  regions,
  activeRegionId,
  onApplyToRegion,
  baseHex,
  hideCodes = false,
  encodeCode,
  onFetchAiPalettes,
  shopCombos,
  outdoor = false,
}: {
  onSelect: (shade: PaintShade) => void;
  catalogue: ReadonlyArray<PaintShade>;
  regions?: ReadonlyArray<RegionLite>;
  activeRegionId?: string;
  onApplyToRegion?: (regionId: string, shade: PaintShade) => void;
  /** Colour already on the active wall — anchors every palette when present. */
  baseHex?: string;
  hideCodes?: boolean;
  encodeCode?: (code: string) => string;
  /** Claude palettes for THIS photo (1 AI preview per ask); hidden when absent. */
  onFetchAiPalettes?: () => Promise<AiRecommendationResponse>;
  /** The shop's predefined combinations; absent/empty hides the section. */
  shopCombos?: ReadonlyArray<RetailerCombo>;
  /** Outdoor photo → the shop's EXTERIOR combos lead, interior ones otherwise. */
  outdoor?: boolean;
}) {
  // Suggestions are anchored to a snapshot taken when the tab opens. Applying a
  // colour changes the wall — but must NOT rebuild the cards under the user's
  // finger, so the cards only change on "Shuffle" or the explicit rebuild chip
  // that appears once the wall colour has moved on.
  const [snap, setSnap] = useState<{
    baseHex?: string;
    regions: ReadonlyArray<RegionLite>;
    variant: number;
  }>(() => ({ baseHex, regions: regions ?? [], variant: 0 }));

  const codeLabel = (code: string) => (hideCodes ? (encodeCode ? encodeCode(code) : null) : code);

  const stale = (baseHex ?? "") !== (snap.baseHex ?? "");
  const palettes = useMemo(
    () => generatePalettes(catalogue, snap.baseHex, snap.variant),
    [catalogue, snap.baseHex, snap.variant],
  );
  const rebuild = () => setSnap({ baseHex, regions: regions ?? [], variant: 0 });
  const shuffle = () => setSnap((s) => ({ ...s, variant: s.variant + 1 }));

  // "Apply all" puts the whole palette on the room at once: main → main wall,
  // accent → accent wall, trim → trim — each to its matching region. Falls
  // back to the active wall only when we can't map regions (e.g. no per-region
  // apply available, or the project has a single surface). Targets the LIVE
  // regions, not the snapshot, so paint always lands on the real walls.
  const applyCombo = (shades: ReadonlyArray<PaintShade | undefined>) => {
    const byKind = (k: RegionKind) => regions?.find((r) => r.kind === k);
    const main = byKind("MAIN_WALL") ?? regions?.find((r) => r.id === activeRegionId) ?? regions?.[0];
    const targets: Array<[RegionLite | undefined, PaintShade | undefined]> = [
      [main, shades[0]],
      [byKind("ACCENT_WALL"), shades[1]],
      [byKind("TRIM"), shades[2]],
    ];
    let applied = false;
    if (onApplyToRegion) {
      for (const [region, shade] of targets) {
        if (region && shade) {
          onApplyToRegion(region.id, shade);
          applied = true;
        }
      }
    }
    if (!applied && shades[0]) onSelect(shades[0]); // single-surface / no mapping → active wall
  };

  const showPairings =
    Boolean(snap.baseHex) && Boolean(activeRegionId) && Boolean(onApplyToRegion) && snap.regions.length > 0;

  return (
    <div className="hv-ai-panel">
      {shopCombos && shopCombos.length > 0 && (
        <ShopPicksSection
          combos={shopCombos}
          outdoor={outdoor}
          catalogue={catalogue}
          onSelect={onSelect}
          onApplyCombo={applyCombo}
          hideCodes={hideCodes}
          encodeCode={encodeCode}
        />
      )}

      {onFetchAiPalettes && (
        <ClaudePicksSection
          fetchPalettes={onFetchAiPalettes}
          catalogue={catalogue}
          onSelect={onSelect}
          onApplyCombo={applyCombo}
          hideCodes={hideCodes}
          encodeCode={encodeCode}
        />
      )}

      {/* The free, local Room palettes need the catalogue; Claude's picks above
          do not, so an empty/loading catalogue only blanks THIS half. */}
      {palettes.length === 0 && (
        <p className="hv-studio-empty">The catalogue is still loading — palettes will appear here.</p>
      )}

      {palettes.length > 0 && stale && (
        <button
          type="button"
          onClick={rebuild}
          className="hv-ai-rebuild"
          title="The wall colour changed since these were built"
        >
          ↺ Wall colour changed — rebuild suggestions around it
        </button>
      )}

      {palettes.length > 0 && (
        <>
          <div className="hv-ai-head">
            <Mono>Room palettes</Mono>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={shuffle}
              title="Different suggestions with the same rules"
            >
              ↻ Shuffle
            </button>
          </div>
          <p className="hv-ai-intro">
            {snap.baseHex ? (
              <>
                Built around the colour on your wall
                <span
                  aria-hidden
                  style={{ display: "inline-block", width: 10, height: 10, background: snap.baseHex, border: "1px solid var(--rule-strong)", borderRadius: 3, margin: "0 4px", verticalAlign: "-1px" }}
                />
                — every swatch is a real catalogue shade. Drag a colour onto another
                role (say, Main onto Trim) to swap them before applying.
              </>
            ) : (
              "Pick a colour first and the palettes build around it — every swatch is a real catalogue shade. Drag a colour onto another role to swap them before applying."
            )}
          </p>
          <div className="hv-ai-cards">
            {palettes.map((p, i) => (
              <PaletteTrioCard
                // Claude names aren't guaranteed unique — the index keeps two
                // same-named palettes from colliding and dropping a card.
                key={`${i}-${p.name}`}
                title={p.name}
                rationale={p.rationale}
                trio={[p.main, p.accent, p.trim]}
                onSelect={onSelect}
                onApplyCombo={applyCombo}
                codeLabel={codeLabel}
                applyAllTitle="Apply the whole palette — main, accent and trim — across the room"
              />
            ))}
          </div>
        </>
      )}

      {showPairings && (
        <CoordinateSuggestions
          baseHex={snap.baseHex!}
          activeRegionId={activeRegionId!}
          regions={snap.regions}
          catalogue={catalogue}
          onApplyToRegion={onApplyToRegion!}
          hideCodes={hideCodes}
          encodeCode={encodeCode}
        />
      )}
    </div>
  );
}

/**
 * "Claude's picks" — palettes generated by Claude Vision from the actual project
 * photo (backend POST /recommendations). Unlike the free Room palettes below
 * (local catalogue math), each ask costs one AI preview from the shop's monthly
 * quota, so NOTHING is fetched until the retailer explicitly asks. A 402 (out
 * of previews / unsubscribed) gets its own message; every other failure keeps
 * the button usable for a retry — a failed run is refunded server-side.
 */
function ClaudePicksSection({
  fetchPalettes,
  catalogue,
  onSelect,
  onApplyCombo,
  hideCodes = false,
  encodeCode,
}: {
  fetchPalettes: () => Promise<AiRecommendationResponse>;
  catalogue: ReadonlyArray<PaintShade>;
  onSelect: (shade: PaintShade) => void;
  onApplyCombo: (shades: ReadonlyArray<PaintShade | undefined>) => void;
  hideCodes?: boolean;
  encodeCode?: (code: string) => string;
}) {
  const codeLabel = (code: string) => (hideCodes ? (encodeCode ? encodeCode(code) : null) : code);
  const [loading, setLoading] = useState(false);
  const [combos, setCombos] = useState<AiColorCombo[] | null>(null);
  const [error, setError] = useState<{ message: string; quota: boolean } | null>(null);

  // Prefer the real catalogue entry for a matched code (correct LRV/finishes);
  // fall back to a shade built from the payload so the swatch still applies.
  const byCode = useMemo(() => {
    const m = new Map<string, PaintShade>();
    for (const s of catalogue) m.set(s.code, s);
    return m;
  }, [catalogue]);

  const toShade = useCallback(
    (matched: AiMatchedShade | null | undefined): PaintShade | undefined => {
      if (!matched?.shadeCode) return undefined;
      return (
        byCode.get(matched.shadeCode) ??
        mapToPaintShade({
          shadeCode: matched.shadeCode,
          name: matched.name,
          hexCode: matched.hexCode,
          shadeFamily: matched.shadeFamily,
          brandName: matched.brand,
        })
      );
    },
    [byCode],
  );

  const ask = () => {
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetchPalettes();
        setCombos(res.combinations ?? []);
      } catch (err) {
        if (err instanceof HttpError && err.status === 402) {
          setError({ message: err.message, quota: true });
        } else {
          setError({
            message: err instanceof Error ? err.message : "Could not fetch suggestions.",
            quota: false,
          });
        }
      } finally {
        setLoading(false);
      }
    })();
  };

  const cards = useMemo(
    () =>
      (combos ?? [])
        .map((c) => ({
          combo: c,
          trio: [toShade(c.primaryShade), toShade(c.accentShade), toShade(c.trimShade)] as const,
        }))
        .filter(({ trio }) => trio.some(Boolean)),
    [combos, toShade],
  );

  return (
    <div style={{ marginBottom: 28, paddingBottom: 24, borderBottom: "1px solid var(--rule)" }}>
      <div className="hv-ai-head">
        <Mono brass>Claude&rsquo;s picks · from your photo</Mono>
        <button
          type="button"
          className="btn btn-sm"
          onClick={ask}
          disabled={loading}
          title="Claude looks at the room photo and suggests three palettes matched to real catalogue shades. Each ask uses one AI preview."
        >
          {loading ? "Asking…" : combos ? "Ask again · 1 preview" : "Ask Claude · 1 preview"}
        </button>
      </div>
      {!combos && !loading && !error && (
        <p className="hv-ai-intro">
          Palettes tuned to this exact photo — its light, furnishings and mood. Each ask uses one
          AI preview from your monthly quota; the Room palettes below stay free.
        </p>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error.quota
            ? "You're out of images this month. Buy an extra image (₹50), upgrade your plan, or wait for the reset — the free Room palettes below still work."
            : error.message}
        </p>
      )}
      {combos && cards.length === 0 && !loading && (
        <p className="hv-studio-empty">Claude couldn&rsquo;t match catalogue shades for this photo — try again.</p>
      )}
      {cards.length > 0 && (
        <div className="hv-ai-cards">
          {cards.map(({ combo, trio }, i) => (
            <PaletteTrioCard
              // Combo names aren't guaranteed unique — the index keeps two
              // same-named combos from colliding and dropping a card.
              key={`${i}-${combo.name}`}
              title={combo.name}
              rationale={combo.rationale}
              trio={trio}
              onSelect={onSelect}
              onApplyCombo={onApplyCombo}
              codeLabel={codeLabel}
              applyAllTitle="Apply the whole palette — main, accent and trim — across the room"
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * "From your shop" — combinations the retailer predefined in their portal
 * (three shades in main/accent/trim order, tagged Interior or Exterior). The
 * combos matching the photo's setting lead; the rest follow with their tag so
 * a shopper browsing an interior can still peek at the exterior sets. Applying
 * works exactly like the other suggestion cards: tap a swatch for the active
 * wall, or "Apply all" to dress the whole room.
 */
function ShopPicksSection({
  combos,
  outdoor = false,
  catalogue,
  onSelect,
  onApplyCombo,
  hideCodes = false,
  encodeCode,
}: {
  combos: ReadonlyArray<RetailerCombo>;
  outdoor?: boolean;
  catalogue: ReadonlyArray<PaintShade>;
  onSelect: (shade: PaintShade) => void;
  onApplyCombo: (shades: ReadonlyArray<PaintShade | undefined>) => void;
  hideCodes?: boolean;
  encodeCode?: (code: string) => string;
}) {
  const codeLabel = (code: string) => (hideCodes ? (encodeCode ? encodeCode(code) : null) : code);
  // Prefer the real catalogue entry for a code (correct LRV/finishes drive the
  // dock tips); fall back to a shade built from the combo so it still applies
  // even if the catalogue was re-imported since the retailer saved it.
  const byCode = useMemo(() => {
    const m = new Map<string, PaintShade>();
    for (const s of catalogue) m.set(s.code, s);
    return m;
  }, [catalogue]);

  const toShade = useCallback(
    (s: { code: string; name: string; hex: string }): PaintShade =>
      byCode.get(s.code) ??
      mapToPaintShade({ shadeCode: s.code, name: s.name, hexCode: s.hex }),
    [byCode],
  );

  const wanted = outdoor ? "EXTERIOR" : "INTERIOR";
  const sorted = useMemo(
    () => [...combos].sort((a, b) => Number(b.scope === wanted) - Number(a.scope === wanted)),
    [combos, wanted],
  );
  const shopName = combos[0]?.organizationName;

  return (
    <div style={{ marginBottom: 28, paddingBottom: 24, borderBottom: "1px solid var(--rule)" }}>
      <div className="hv-ai-head">
        <Mono brass>{shopName ? `${shopName} recommends` : "Your shop recommends"}</Mono>
      </div>
      <p className="hv-ai-intro">
        Combinations your paint shop put together — tap a shade for the active wall, drag a
        colour onto another role to swap them, or apply all three across the room.
      </p>
      <div className="hv-ai-cards">
        {sorted.map((combo) => (
          <PaletteTrioCard
            key={combo.id}
            title={
              <>
                {combo.name}
                <span className="mono" style={{ marginLeft: 8, fontSize: 10, letterSpacing: ".14em", color: "var(--fg-mute)", textTransform: "uppercase" }}>
                  {combo.scope === "EXTERIOR" ? "Exterior" : "Interior"}
                </span>
              </>
            }
            trio={combo.shades.slice(0, 3).map(toShade)}
            onSelect={onSelect}
            onApplyCombo={onApplyCombo}
            codeLabel={codeLabel}
            applyAllTitle="Apply the whole combination — main, accent and trim — across the room"
          />
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
  onEditWall,
  onDeleteWall,
  masksRemaining,
}: {
  regions?: ReadonlyArray<RegionLite>;
  activeRegionId?: string;
  onSelectRegion?: (id: string) => void;
  onAddWall?: () => void;
  onEditWall?: (id: string) => void;
  onDeleteWall?: (id: string) => void;
  masksRemaining?: number;
}) {
  const list = regions ?? [];
  // On narrow screens the chips overflow into a horizontal scroll with no
  // scrollbar — fade the clipped edge so a half-visible "+ Wall" reads as
  // "scroll for more", not as a broken layout. The data attribute drives the
  // CSS mask and updates as the user scrolls or the panel resizes.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [overflowRight, setOverflowRight] = useState(false);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () =>
      setOverflowRight(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [list.length]);

  if (list.length === 0) return null;
  const addDisabled = masksRemaining !== undefined && masksRemaining <= 0;
  return (
    <div className="hv-studio-region-strip">
      <div
        className="hv-studio-region-strip-scroll"
        ref={scrollerRef}
        data-overflow-right={overflowRight || undefined}
      >
        {list.map((r) => {
          const isActive = r.id === activeRegionId;
          // Only hand-drawn walls can be removed — AI-detected ones have no ✕.
          const canDelete = Boolean(r.custom && onDeleteWall);
          // Any region with a mask can be REFINED — this is how AI-detected walls
          // get fixed (an edge that overshoots, half a pillar the AI missed).
          const canEdit = Boolean(r.hasMask && onEditWall);
          return (
            <div
              key={r.id}
              className={`hv-studio-region-chip ${isActive ? "is-active" : ""}`}
            >
              <button
                type="button"
                onClick={() => onSelectRegion?.(r.id)}
                aria-pressed={isActive}
                className="hv-studio-region-chip-select"
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
              {canEdit && (
                <button
                  type="button"
                  className="hv-studio-region-chip-edit"
                  onClick={() => onEditWall?.(r.id)}
                  aria-label={`Fix the shape of ${r.label}`}
                  title={`Fix the shape of ${r.label} — refine what the AI outlined`}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  className="hv-studio-region-chip-del"
                  onClick={() => onDeleteWall?.(r.id)}
                  aria-label={`Delete ${r.label}`}
                  title={`Delete ${r.label} (you can re-draw it any time)`}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
                    <path d="M6 6l12 12M6 18L18 6" />
                  </svg>
                </button>
              )}
            </div>
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

function FilterIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 5h16" />
      <path d="M7 12h10" />
      <path d="M10 19h4" />
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
