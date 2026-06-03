"use client";

import { useMemo, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { SHADES } from "@/lib/shades";
import { t } from "@/lib/i18n";
import { CustomMatchPanel } from "./color-wheel";
import { CoordinateSuggestions, type RegionLite } from "./coordinate-suggestions";
import type { ColorFamily, PaintShade, UiLocale, UiVariant } from "@/lib/types";

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
  variant?: UiVariant;
  locale?: UiLocale;
  /** Shades fetched from the backend; falls back to the bundled sample. */
  shades?: ReadonlyArray<PaintShade>;
  // --- Coordinate suggestions ("complete the look") ---
  /** Applied colour of the active region; drives the pairing suggestions. */
  baseHex?: string;
  activeRegionId?: string;
  regions?: ReadonlyArray<RegionLite>;
  /** Apply a coordinating shade to a specific region (not just the active one). */
  onApplyToRegion?: (regionId: string, shade: PaintShade) => void;
}

export function ShadeGrid({
  selected,
  onSelect,
  onApplyExact,
  activeShade,
  activeRegionLabel,
  variant = "premium",
  locale = "en",
  shades,
  baseHex,
  activeRegionId,
  regions,
  onApplyToRegion,
}: ShadeGridProps) {
  const isClassic = variant === "classic";
  const [family, setFamily] = useState<(typeof FAMILIES)[number]>("All");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("Catalogue");
  const [section, setSection] = useState<Section>("top50");

  const catalogue = useMemo<ReadonlyArray<PaintShade>>(
    () => (shades && shades.length > 0 ? shades : SHADES),
    [shades],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalogue.filter((s) => {
      if (family !== "All" && s.family !== family) return false;
      if (!q) return true;
      return s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q) || s.hex.toLowerCase().includes(q);
    });
  }, [catalogue, family, query]);

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
    if (!isClassic) return tabId;
    if (tabId === "Catalogue") return t(locale, "shades.tab.catalogue");
    if (tabId === "AI Suggest") return t(locale, "shades.tab.suggest");
    if (tabId === "Custom") return "Custom";
    return t(locale, "shades.tab.regions");
  };

  const showCoordinate =
    Boolean(baseHex) && Boolean(activeRegionId) && Boolean(onApplyToRegion) && (regions?.length ?? 0) > 0;

  return (
    <div
      className={`hv-shade-grid ${isClassic ? "is-classic" : ""}`}
      style={{ display: "flex", flexDirection: "column", borderLeft: "1px solid var(--rule)", height: "100%", minHeight: 0 }}
    >
      <div
        role="tablist"
        style={{
          borderBottom: "1px solid var(--rule)",
          display: "flex",
          background: isClassic ? "var(--surface)" : undefined,
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
                padding: isClassic ? "12px 0" : "16px 0",
                fontFamily: isClassic ? "var(--sans, system-ui)" : "var(--serif)",
                fontStyle: !isClassic && isActive ? "italic" : "normal",
                fontWeight: isClassic ? (isActive ? 600 : 500) : 400,
                fontSize: isClassic ? 13 : 15,
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
          <div style={{ padding: isClassic ? 16 : 20, borderBottom: "1px solid var(--rule)", flexShrink: 0 }}>
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                border: isClassic ? "1px solid var(--rule-strong)" : undefined,
                borderRadius: isClassic ? 6 : 0,
                borderBottom: isClassic ? "1px solid var(--rule-strong)" : "1px solid var(--fg)",
                padding: isClassic ? "8px 12px" : "0 0 8px 0",
                background: isClassic ? "var(--surface)" : "transparent",
              }}
            >
              <span
                aria-hidden
                style={{
                  fontFamily: isClassic ? "var(--sans, system-ui)" : "var(--serif)",
                  fontStyle: isClassic ? "normal" : "italic",
                  fontSize: 14,
                  color: "var(--fg-mute)",
                }}
              >
                {isClassic ? <SearchIcon /> : "⌕"}
              </span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={isClassic ? t(locale, "shades.search") : "shade, code, or hex…"}
                aria-label={isClassic ? t(locale, "shades.search") : "Search shades"}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "var(--fg)",
                  fontFamily: isClassic ? "var(--sans, system-ui)" : "var(--serif)",
                  fontStyle: isClassic ? "normal" : "italic",
                  fontSize: isClassic ? 14 : 16,
                  padding: 0,
                }}
              />
            </div>
          </div>

          <div style={{ padding: isClassic ? 12 : 16, borderBottom: "1px solid var(--rule)", flexShrink: 0 }}>
            {isClassic ? (
              <span
                style={{
                  display: "block",
                  marginBottom: 8,
                  font: "600 11px/1 var(--sans, system-ui)",
                  letterSpacing: ".06em",
                  textTransform: "uppercase",
                  color: "var(--fg-mute)",
                }}
              >
                {t(locale, "shades.family")}
              </span>
            ) : (
              <Mono style={{ marginBottom: 10, display: "block" }}>Family</Mono>
            )}
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {FAMILIES.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFamily(f)}
                  style={{
                    padding: isClassic ? "6px 10px" : "6px 10px",
                    ...(isClassic
                      ? { font: "500 12px/1 var(--sans, system-ui)" }
                      : {
                          font: "400 9.5px/1 var(--mono)",
                          letterSpacing: ".18em",
                          textTransform: "uppercase",
                        }),
                    border: "1px solid " + (family === f ? "var(--accent)" : "var(--rule)"),
                    borderRadius: isClassic ? 999 : 0,
                    color: family === f ? "var(--accent)" : "var(--fg-mute)",
                    background: family === f && isClassic ? "rgba(29,78,216,.06)" : "transparent",
                    cursor: "pointer",
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* TOP 50 ↔ BY COMPANY toggle */}
          <div
            style={{
              padding: isClassic ? "12px 16px" : "14px 20px",
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
                ["top50", isClassic ? "Top 50" : "Top 50"],
                ["company", isClassic ? "By company" : "By company"],
              ] as ReadonlyArray<readonly [Section, string]>).map(([key, lbl]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSection(key)}
                  aria-pressed={section === key}
                  style={{
                    padding: isClassic ? "6px 12px" : "6px 12px",
                    border: "1px solid " + (section === key ? "var(--accent)" : "var(--rule)"),
                    borderRadius: isClassic ? 999 : 0,
                    color: section === key ? "var(--accent)" : "var(--fg-mute)",
                    background: section === key && isClassic ? "rgba(29,78,216,.06)" : "transparent",
                    cursor: "pointer",
                    ...(isClassic
                      ? { font: "500 12px/1 var(--sans, system-ui)" }
                      : { font: "400 9.5px/1 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase" }),
                  }}
                >
                  {lbl}
                </button>
              ))}
            </div>
            {isClassic ? (
              <span style={{ font: "400 12px/1 var(--sans, system-ui)", color: "var(--fg-mute)" }}>
                {section === "top50"
                  ? `${top.length} of ${shown.length}`
                  : `${byCompany.length} ${byCompany.length === 1 ? "brand" : "brands"}`}
              </span>
            ) : (
              <Mono>
                {section === "top50"
                  ? `${top.length} / ${shown.length}`
                  : `${byCompany.length} ${byCompany.length === 1 ? "brand" : "brands"}`}
              </Mono>
            )}
          </div>

          {/* Scrolling colour area — fixed-size swatches, the IMAGE never resizes. */}
          <div style={{ padding: isClassic ? 16 : 20, flex: 1, minHeight: 0, overflow: "auto" }}>
            {shown.length === 0 ? (
              <p style={{ font: "300 italic 14px/1.4 var(--serif)", color: "var(--fg-mute)" }}>
                No shades match. Clear the search or family filter.
              </p>
            ) : section === "top50" ? (
              <SwatchGrid shades={top} selected={selected} onSelect={onSelect} isClassic={isClassic} />
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
                          ...(isClassic
                            ? { font: "600 14px/1 var(--sans, system-ui)" }
                            : { font: "300 italic 17px/1 var(--serif)" }),
                          color: "var(--fg)",
                        }}
                      >
                        {brand}
                      </span>
                      <Mono>{list.length}</Mono>
                    </div>
                    <SwatchGrid shades={list} selected={selected} onSelect={onSelect} isClassic={isClassic} />
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
                variant={variant}
              />
            )}

            {activeRegionLabel && (
              <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 8 }}>
                {!isClassic && (
                  <span style={{ color: "var(--accent)" }} aria-hidden>
                    ⁂
                  </span>
                )}
                <span
                  style={{
                    ...(isClassic
                      ? { font: "400 13px/1.3 var(--sans, system-ui)", color: "var(--fg-mute)" }
                      : { font: "300 italic 13px/1.3 var(--serif)", color: "var(--fg-mute)" }),
                  }}
                >
                  {isClassic
                    ? t(locale, "shades.activeRegion", { label: activeRegionLabel })
                    : `applies to ${activeRegionLabel}`}
                </span>
              </div>
            )}
          </div>
        </>
      )}

      {tab === "AI Suggest" && (
        <AISuggestPanel onSelect={onSelect} variant={variant} locale={locale} catalogue={catalogue} />
      )}

      {tab === "Custom" && (
        <CustomMatchPanel
          onSelect={onSelect}
          onApplyExact={onApplyExact}
          catalogue={catalogue}
          variant={variant}
          locale={locale}
          activeRegionLabel={activeRegionLabel}
        />
      )}

      {tab === "Regions" && <RegionsListPanel selected={selected} variant={variant} locale={locale} />}

      <SelectedShadeDetail shade={activeShade} variant={variant} locale={locale} />
    </div>
  );
}

/** A scrolling block of fixed-size square swatches. */
function SwatchGrid({
  shades,
  selected,
  onSelect,
  isClassic,
}: {
  shades: ReadonlyArray<PaintShade>;
  selected?: string;
  onSelect: (shade: PaintShade) => void;
  isClassic: boolean;
}) {
  const tile = isClassic ? 50 : 54;
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
          title={`${s.name} · ${s.code}`}
          aria-label={`${s.name}, code ${s.code}`}
          style={{
            background: s.hex,
            width: "100%",
            height: tile,
            border: "none",
            cursor: "pointer",
            padding: 0,
            outline: selected === s.code ? "2px solid var(--accent)" : "none",
            outlineOffset: isClassic ? 2 : 3,
            borderRadius: isClassic ? 4 : 0,
          }}
        />
      ))}
    </div>
  );
}

function SelectedShadeDetail({
  shade,
  variant,
  locale,
}: {
  shade?: PaintShade;
  variant: UiVariant;
  locale: UiLocale;
}) {
  const isClassic = variant === "classic";
  if (!shade) {
    return (
      <div
        style={{
          borderTop: "1px solid var(--rule)",
          padding: isClassic ? 16 : 22,
          background: "var(--surface-soft)",
          flexShrink: 0,
        }}
      >
        {isClassic ? (
          <>
            <span
              style={{
                display: "block",
                font: "600 11px/1 var(--sans, system-ui)",
                letterSpacing: ".06em",
                textTransform: "uppercase",
                color: "var(--fg-mute)",
              }}
            >
              No colour selected
            </span>
            <p
              style={{
                font: "400 13px/1.5 var(--sans, system-ui)",
                color: "var(--fg-soft)",
                margin: "6px 0 0",
              }}
            >
              {t(locale, "shades.selectedDetail.empty")}
            </p>
          </>
        ) : (
          <>
            <Mono>No shade selected</Mono>
            <p
              style={{
                font: "300 italic 14px/1.4 var(--serif)",
                color: "var(--fg-mute)",
                margin: "8px 0 0",
              }}
            >
              Pick a swatch above. It paints the active region in real time.
            </p>
          </>
        )}
      </div>
    );
  }
  return (
    <div
      style={{
        borderTop: "1px solid var(--rule)",
        padding: isClassic ? 16 : 22,
        background: "var(--surface-soft)",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <div
          style={{
            width: isClassic ? 48 : 64,
            height: isClassic ? 48 : 64,
            background: shade.hex,
            border: "1px solid var(--rule-strong)",
            borderRadius: isClassic ? 6 : 0,
            flexShrink: 0,
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 }}>
          <span
            style={{
              fontFamily: isClassic ? "var(--sans, system-ui)" : "var(--serif)",
              fontWeight: isClassic ? 600 : 400,
              fontSize: isClassic ? 16 : 22,
              lineHeight: 1.2,
              color: "var(--fg)",
            }}
          >
            {shade.name}
          </span>
          {isClassic ? (
            <span style={{ font: "400 13px/1.4 var(--sans, system-ui)", color: "var(--fg-mute)" }}>
              {shade.code} · {shade.hex} · LRV {shade.lrv}
            </span>
          ) : (
            <Mono>{shade.code} · {shade.hex} · LRV {shade.lrv}</Mono>
          )}
          <span
            style={{
              ...(isClassic
                ? { font: "400 13px/1.3 var(--sans, system-ui)", color: "var(--fg-mute)" }
                : { font: "300 italic 13px/1.3 var(--serif)", color: "var(--fg-mute)" }),
            }}
          >
            {shade.finishes.map((f) => f.toLowerCase()).join(" · ")}
          </span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button
          type="button"
          style={{
            padding: isClassic ? "8px 12px" : 0,
            ...(isClassic
              ? {
                  font: "500 12px/1 var(--sans, system-ui)",
                  border: "1px solid var(--rule-strong)",
                  borderRadius: 6,
                  background: "var(--surface)",
                  color: "var(--fg)",
                }
              : {
                  font: "400 11px/1 var(--mono)",
                  letterSpacing: ".18em",
                  textTransform: "uppercase",
                  color: "var(--fg)",
                  borderBottom: "1px solid var(--fg)",
                  paddingBottom: 2,
                  background: "transparent",
                  border: "none",
                }),
            cursor: "pointer",
          }}
        >
          {isClassic ? t(locale, "shades.findSimilar") : "Find similar →"}
        </button>
        <button
          type="button"
          style={{
            padding: isClassic ? "8px 12px" : 0,
            ...(isClassic
              ? {
                  font: "500 12px/1 var(--sans, system-ui)",
                  border: "1px solid var(--rule-strong)",
                  borderRadius: 6,
                  background: "var(--surface)",
                  color: "var(--fg)",
                }
              : {
                  font: "400 11px/1 var(--mono)",
                  letterSpacing: ".18em",
                  textTransform: "uppercase",
                  color: "var(--fg-mute)",
                  background: "transparent",
                  border: "none",
                }),
            cursor: "pointer",
          }}
        >
          {isClassic ? t(locale, "shades.addToProject") : "Add to project"}
        </button>
      </div>
    </div>
  );
}

function AISuggestPanel({
  onSelect,
  variant,
  locale,
  catalogue,
}: {
  onSelect: (shade: PaintShade) => void;
  variant: UiVariant;
  locale: UiLocale;
  catalogue: ReadonlyArray<PaintShade>;
}) {
  const isClassic = variant === "classic";
  const combos = isClassic
    ? [
        { name: "Quiet morning", rationale: "Soft ivory main, sage accent, slate trim.", shades: [pickShade(catalogue, 0), pickShade(catalogue, 14), pickShade(catalogue, 16)] },
        { name: "Warm afternoon", rationale: "Earthy and warm; reads well in sun.", shades: [pickShade(catalogue, 5), pickShade(catalogue, 12), pickShade(catalogue, 0)] },
        { name: "Cool evening", rationale: "For studies and reading rooms.", shades: [pickShade(catalogue, 17), pickShade(catalogue, 15), pickShade(catalogue, 3)] },
      ]
    : [
        { name: "Counter Quiet", rationale: "Ivory main, sage accent, slate trim — a Belgavi morning.", shades: [pickShade(catalogue, 0), pickShade(catalogue, 14), pickShade(catalogue, 16)] },
        { name: "Spice Veranda", rationale: "Earthbound and warm; reads well in afternoon sun.", shades: [pickShade(catalogue, 5), pickShade(catalogue, 12), pickShade(catalogue, 0)] },
        { name: "Twilight Atelier", rationale: "For studies and reading rooms — cool, low LRV.", shades: [pickShade(catalogue, 17), pickShade(catalogue, 15), pickShade(catalogue, 3)] },
      ];
  return (
    <div style={{ padding: isClassic ? 16 : 20, flex: 1, minHeight: 0, overflow: "auto" }}>
      {isClassic ? (
        <span
          style={{
            display: "block",
            marginBottom: 14,
            font: "600 11px/1 var(--sans, system-ui)",
            letterSpacing: ".06em",
            textTransform: "uppercase",
            color: "var(--fg-mute)",
          }}
        >
          Three suggestions
        </span>
      ) : (
        <Mono style={{ display: "block", marginBottom: 14 }}>Three suggestions · Claude Sonnet</Mono>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {combos.map((c) => (
          <div
            key={c.name}
            style={{
              border: "1px solid var(--rule)",
              padding: isClassic ? 14 : 16,
              borderRadius: isClassic ? 8 : 0,
              background: isClassic ? "var(--surface)" : "transparent",
            }}
          >
            <div
              style={{
                ...(isClassic
                  ? { font: "600 14px/1.2 var(--sans, system-ui)", color: "var(--fg)" }
                  : { font: "300 italic 18px/1.1 var(--serif)", color: "var(--fg)" }),
              }}
            >
              {c.name}
            </div>
            <p
              style={{
                ...(isClassic
                  ? { font: "400 13px/1.45 var(--sans, system-ui)" }
                  : { font: "300 italic 13px/1.4 var(--serif)" }),
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
                    borderRadius: isClassic ? 4 : 0,
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
                className={isClassic ? "btn btn-sm" : undefined}
                style={
                  isClassic
                    ? undefined
                    : {
                        font: "400 10px/1 var(--mono)",
                        letterSpacing: ".22em",
                        textTransform: "uppercase",
                        color: "var(--fg)",
                        background: "transparent",
                        border: "1px solid var(--rule-strong)",
                        padding: "6px 10px",
                        cursor: "pointer",
                      }
                }
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
  selected,
  variant,
  locale,
}: {
  selected?: string;
  variant: UiVariant;
  locale: UiLocale;
}) {
  const isClassic = variant === "classic";
  return (
    <div style={{ padding: isClassic ? 16 : 20, flex: 1, minHeight: 0, overflow: "auto" }}>
      {isClassic ? (
        <>
          <span
            style={{
              display: "block",
              marginBottom: 10,
              font: "600 11px/1 var(--sans, system-ui)",
              letterSpacing: ".06em",
              textTransform: "uppercase",
              color: "var(--fg-mute)",
            }}
          >
            Detected walls
          </span>
          <p style={{ font: "400 13px/1.5 var(--sans, system-ui)", color: "var(--fg-mute)" }}>
            We detect each wall in the photo. Click <strong>+ {t(locale, "atelier.control.addRegion")}</strong> to
            mark one we missed. {selected ? `Now painting with ${selected}.` : ""}
          </p>
        </>
      ) : (
        <>
          <Mono style={{ display: "block", marginBottom: 14 }}>Defined regions</Mono>
          <p style={{ font: "300 italic 13px/1.4 var(--serif)", color: "var(--fg-mute)" }}>
            Regions are auto-detected from your photograph. Use the Draw tool to add a manual region.{" "}
            {selected ? `Currently painting with ${selected}.` : ""}
          </p>
        </>
      )}
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
