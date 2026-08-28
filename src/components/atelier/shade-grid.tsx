"use client";

import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Mono, Note } from "@/components/ui/eyebrow";
import { SHADES } from "@/lib/shades";
import {
  closenessRating,
  DARK_ROOM_LRV,
  fadeSaferAlternatives,
  fanDeckNeighbors,
  lighterSteps,
  lightShift,
  LIGHT_SHIFT_BADGE,
  pairCeilingAndTrim,
  sunFadeRisk,
} from "@/lib/color-science";
import { PARENT_FAMILIES, parentFamilyOf } from "@/lib/colour-families";
import { UndertoneTag } from "@/components/catalogue/undertone-tag";
import { SHADE_ACCURACY_TEXT } from "@/components/shared/accuracy-note";
import { generatePalettes } from "@/lib/palettes";
import { mapToPaintShade } from "@/lib/shade-mapping";
import { crossBrandLookup, type CrossBrandLookup } from "@/lib/cross-brand";
import { HttpError } from "@/lib/http-error";
import { CoordinateSuggestions, type RegionLite } from "./coordinate-suggestions";
import type {
  AiColorCombo,
  AiMatchedShade,
  AiRecommendationResponse,
  PaintShade,
  RegionKind,
  RetailerCombo,
} from "@/lib/types";

/**
 * The two ways a colour gets CHOSEN here, plus the one way it gets chosen again.
 *
 * "Your Selection" is the third and it is not a browser at all — it replays the
 * combinations a locked project already handed over. See OPEN_TABS/LOCKED_TABS below.
 *
 * There used to be a third, "Custom": a colour wheel that applied any hex the user
 * landed on, exactly. It has been removed, and the reason is that the product's whole
 * output is a colour BOARD — a sheet of codes somebody carries to a counter and buys
 * paint against. A hand-picked hex has no code, so it printed as "Custom colour" with a
 * swatch and nothing to order; and on the wall it was a promise the shop could not keep,
 * because the mixing machine works from the catalogue, not from a screen. The nearest
 * genuine version of what people wanted it for — "something like this, but real" — is
 * the catalogue search and AI Suggest, both of which return shades that can actually be
 * bought.
 */
type Tab = "Catalogue" | "AI Suggest" | "Your Selection";

/**
 * Which tabs exist depends on whether the project is still LIVE.
 *
 * A live room gets the two ways of choosing a colour. A locked one — closed, or past
 * its window — gets exactly one: the colours this customer already chose. Browsing
 * 10,000 shades and asking the AI for more are both offers to repaint, and a locked
 * project refuses every repaint on the server; leaving them on screen was an invitation
 * to spend ten minutes picking a shade that could never be applied. What the customer
 * still has a real use for is their OWN selection — the combinations off their colour
 * boards — so that becomes the whole panel until the project is bought open again, at
 * which point the live tabs come straight back.
 */
const OPEN_TABS: ReadonlyArray<Tab> = ["Catalogue", "AI Suggest"];
const LOCKED_TABS: ReadonlyArray<Tab> = ["Your Selection"];

// Light/Medium/Dark quick filter, in LRV terms a painter would recognise.
const TONES = ["All", "Light", "Medium", "Dark"] as const;
type Tone = (typeof TONES)[number];
const toneOf = (lrv: number): Exclude<Tone, "All"> =>
  lrv >= 55 ? "Light" : lrv >= 25 ? "Medium" : "Dark";

// The Catalogue tab groups by company, full stop. There used to be a "Top 50"
// view beside it, which was simply the first fifty rows of whatever the filters
// left — an arbitrary slice that read as a recommendation it had never earned,
// and which hid the brand a shade belongs to at the moment that matters most.
//
// With a 10k+ catalogue a company can hold thousands of shades — mounting them all
// at once freezes the panel. Each company starts with one screenful and grows in
// steps as the user asks for more.
const COMPANY_INITIAL = 48;
const COMPANY_STEP = 240;

// Long enough that a code being typed doesn't fire a lookup per keystroke — the same
// pause the counter's code converter waits for.
const LOOKUP_DEBOUNCE_MS = 350;

/**
 * One combination the customer was handed on a colour board, in the shape this panel
 * renders. The studio maps the backend's `ProjectCombo` into it, so the panel never has
 * to know how a board is stored: it is handed real `PaintShade`s and, where the wall it
 * sat on still exists, the region to put each one back onto.
 */
export interface SelectionCombo {
  id: string;
  /** What the board called it ("Board 1 · Option 2" when it had no title of its own). */
  title: string;
  entries: ReadonlyArray<SelectionEntry>;
}

export interface SelectionEntry {
  /** The studio region this colour was on, when that wall still exists. */
  regionId?: string;
  /** The wall's name as the board printed it — the swatch's label. */
  regionLabel?: string;
  shade: PaintShade;
}

interface ShadeGridProps {
  selected?: string;
  onSelect: (shade: PaintShade) => void;
  /** Apply a picked colour exactly (Custom tab), without snapping to a shade. */
  activeShade?: PaintShade;
  activeRegionLabel?: string;
  /** Whether the active region currently has a colour on it (drives "Keep original"). */
  activeApplied?: boolean;
  /** Remove the colour from the active region so it renders unpainted. */
  onKeepOriginal?: () => void;
  /** Shades fetched from the backend; falls back to the bundled sample. */
  shades?: ReadonlyArray<PaintShade>;
  /**
   * EVERY shade the caller may see, before the studio's company picker narrowed
   * {@link shades} down to what is on screen.
   *
   * Only search reads it, and only to answer a code the panel is not showing: a
   * customer arrives with an Asian Paints number, the shop is showing HueVista, and
   * "no shades match" is a true statement about the wrong catalogue. Nothing from
   * here is ever rendered as a swatch — the grid stays exactly what the picker
   * chose — so scoping the panel still means what it says.
   *
   * Absent = the same list as {@link shades}, which simply makes the cross-reference
   * find nothing rather than misbehave.
   */
  allShades?: ReadonlyArray<PaintShade>;
  /**
   * Ask the public catalogue what colour a code names, when {@link allShades} cannot
   * say — the shop is set up for one company and the customer's card is another's.
   *
   * That is the ordinary case, not the edge one: a shop's catalogue is narrowed to
   * what it may sell, so the codes it CANNOT read are exactly the ones customers walk
   * in holding. The reply is used for its colour alone; what gets offered back is
   * still only shades from this panel's own catalogue.
   *
   * Absent (or failing) simply means the search answers from what is already loaded.
   */
  onLookupCode?: (code: string) => Promise<ReadonlyArray<PaintShade>>;
  // --- Coordinate suggestions ("complete the look") ---
  /** Applied colour of the active region; drives the pairing suggestions. */
  baseHex?: string;
  activeRegionId?: string;
  regions?: ReadonlyArray<RegionLite>;
  /** Apply a coordinating shade to a specific region (not just the active one). */
  onApplyToRegion?: (regionId: string, shade: PaintShade) => void;
  /** Guest mode: hide real shade codes (guests pick by colour; the shop reads codes). */
  hideCodes?: boolean;
  /** The shop hides paint names: swatches, tooltips and the dock show the colour and
   *  its code only. Usually paired with a code scheme — printing the manufacturer's
   *  name beside the shop's own number gives away exactly what the number hides. */
  hideNames?: boolean;
  /**
   * False when the paint COMPANY must not be attributed to individual shades — every
   * customer, guest and painter. The panel then renders one flat list instead of
   * per-company sections, because a section HEADING is an attribution: it names the
   * company of every swatch beneath it just as plainly as a label on each chip would.
   *
   * Filtering BY company is unaffected and deliberately so — that lives in the studio's
   * own picker above this panel, and a customer needs it, since they will be buying
   * from a shop that stocks some companies and not others.
   */
  showBrands?: boolean;
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
  /** Snapshot the room onto the colour-board PDF once a palette has been applied. The
   *  apply happens here; the caller only has to capture. Absent = no button. */
  onAddComboToPdf?: () => void;
  /** The shop's predefined combinations (AI Suggest tab). Absent/empty = hidden. */
  shopCombos?: ReadonlyArray<RetailerCombo>;
  /**
   * The combinations this project already handed over — the "Your Selection" tab.
   *
   * Empty on a live project, where nothing has been committed to yet and the two
   * browsing tabs are the point. The studio loads them only once the project locks.
   */
  selectionCombos?: ReadonlyArray<SelectionCombo>;
  /**
   * The project is locked (closed, or its window lapsed), so the two browsing tabs are
   * replaced by "Your Selection" rather than sitting there offering repaints the server
   * refuses. Flips back to false the moment the project is bought open again.
   */
  selectionOnly?: boolean;
  /** Why the panel is showing only the saved selection — the studio's own view-only
   *  wording, so the two never drift apart. */
  selectionNote?: string | null;
  /** No photo yet, so there is nothing for a colour to land on. The panel stays
   *  on screen but goes quiet: dimmed, not operable, and saying why. */
  awaitingPhoto?: boolean;
  /** Send the user to the uploader — wired to the gate's button and to Apply. */
  onNeedPhoto?: () => void;
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
/**
 * Does this shade answer the typed query?
 *
 * Search has to match what is ON SCREEN. Under a shop's pattern the encoded code
 * is the only one shown, so matching the manufacturer's alone would make the one
 * code the user can read the one code that finds nothing. Names are searchable
 * only while they are visible — matching a name the shop hides would answer
 * questions about it the shop chose not to answer.
 *
 * An empty query matches everything, so the grid is the whole catalogue until
 * someone types.
 */
export function matchesQuery(
  shade: { name: string; code: string; hex: string },
  query: string,
  {
    hideCodes = false,
    hideNames = false,
    encodeCode,
  }: { hideCodes?: boolean; hideNames?: boolean; encodeCode?: (code: string) => string } = {},
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (encodeCode && encodeCode(shade.code).toLowerCase().includes(q)) return true;
  if (!hideNames && shade.name.toLowerCase().includes(q)) return true;
  if (!hideCodes && shade.code.toLowerCase().includes(q)) return true;
  return shade.hex.toLowerCase().includes(q);
}

export function ShadeGrid({
  selected,
  onSelect,
  activeShade,
  activeRegionLabel,
  activeApplied = false,
  onKeepOriginal,
  shades,
  allShades,
  onLookupCode,
  baseHex,
  activeRegionId,
  regions,
  onApplyToRegion,
  hideCodes = false,
  hideNames = false,
  showBrands = true,
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
  onAddComboToPdf,
  shopCombos,
  selectionCombos,
  selectionOnly = false,
  selectionNote,
  awaitingPhoto = false,
  onNeedPhoto,
}: ShadeGridProps) {
  const [family, setFamily] = useState<string>("All");
  const [tone, setTone] = useState<Tone>("All");
  const [query, setQuery] = useState("");
  const tabs = selectionOnly ? LOCKED_TABS : OPEN_TABS;
  /**
   * The tab that is showing, and the one the user last pressed — not the same thing.
   *
   * Locking and reopening both happen UNDER this panel: a project can close while it is
   * open on screen, and a reopen purchase drops it straight back to live without a
   * remount. Either way the pressed tab may no longer be one of the tabs, so what SHOWS
   * is resolved on every render rather than corrected afterwards by an effect — an
   * effect leaves one frame in which the panel renders a tab it is no longer offering.
   *
   * Keeping the press rather than overwriting it means a customer who was on Colours
   * when the project locked is back on Colours the moment they buy it open.
   */
  const [pressedTab, setTab] = useState<Tab>("Catalogue");
  const tab = tabs.includes(pressedTab) ? pressedTab : tabs[0]!;
  // Family/depth pills live behind a toggle so the fixed header stays compact;
  // the button shows how many filters are currently narrowing the grid.
  //
  // Company is deliberately NOT one of them any more. It used to be a pill row
  // here AND a second, separate pill row inside AI Suggest, each remembering its
  // own answer — so "show me Asian Paints" had to be said twice and was still not
  // true of the Custom tab. It is now one picker in the studio topbar, which scopes
  // the `shades` this panel is handed, so all three tabs agree by construction.
  const [filtersOpen, setFiltersOpen] = useState(false);
  // How many swatches each company section currently shows (keyed by brand name).
  const [companyVisible, setCompanyVisible] = useState<Record<string, number>>({});
  // Seed colour for the Custom (nearest-match) panel, set by a shade's "Find similar".
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

  // Family pills are the NORMALISED parents, not the raw vendor strings.
  //
  // Each paint company ships its own family vocabulary, and pouring them all into
  // one row produced about forty peers containing "Blue" and "Blues", "Grey" and
  // "Greys", "Earth Tones" and "Earths" — the same idea listed twice because two
  // companies spell it differently, and picking one silently excluded the other
  // company's shades of that exact colour. The catalogue page has mapped these to
  // nine parents since it was built; the studio was the screen still showing the
  // raw merge.
  const families = useMemo(() => {
    const present = new Set(catalogue.map((s) => parentFamilyOf(s.family)));
    return ["All", ...PARENT_FAMILIES.filter((f) => present.has(f))];
  }, [catalogue]);

  const shown = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return catalogue.filter((s) => {
      if (family !== "All" && parentFamilyOf(s.family) !== family) return false;
      if (tone !== "All" && toneOf(s.lrv) !== tone) return false;
      return matchesQuery(s, q, { hideCodes, hideNames, encodeCode });
    });
  }, [catalogue, family, tone, deferredQuery, encodeCode, hideCodes, hideNames]);

  /**
   * A code from a company that isn't on screen, answered in the companies that are.
   *
   * Read against the WHOLE catalogue rather than the filtered grid, on purpose: the
   * search box's own filters (company, family, depth) are precisely what hid the
   * shade the customer's code names, so re-applying them here would hide the answer
   * too. It is scored against `catalogue` — the picker's scope — because what the
   * band offers has to be something this shop can actually sell.
   */
  const [pickedCandidate, setPickedCandidate] = useState<string | null>(null);
  /**
   * Reading one company's code into another's is a SHOP's capability, and it stops at
   * the same line every other code question stops at.
   *
   * A viewer who may not read manufacturer codes may not read them sideways either.
   * Left ungated, this band handed a customer the one answer the whole HV-code scheme
   * exists to withhold: type manufacturer codes until one comes back "the same colour"
   * as the HV code on your board, and you have decoded it — which is precisely what
   * `/api/shades/decode` refuses to anyone who is not a shop. The grid's own search has
   * always drawn this line (`matchesQuery` stops matching the manufacturer's code the
   * moment the shop replaces it); a band that answered anyway would simply be the same
   * leak one element up the page.
   *
   * `hideCodes` is the studio's existing answer to "may this viewer read real codes" —
   * false only for shop staff, and false for everyone while it is still unknown.
   */
  const mayCrossReference = !hideCodes;
  const localRef = useMemo<CrossBrandLookup | null>(
    () =>
      mayCrossReference
        ? crossBrandLookup(deferredQuery, catalogue, allShades ?? catalogue)
        : null,
    [mayCrossReference, deferredQuery, catalogue, allShades],
  );

  /**
   * The same question asked of the public catalogue, for the codes this caller's own
   * catalogue cannot read.
   *
   * A shop is served only the companies it may sell, so the codes it holds no answer
   * for are precisely the ones customers arrive with — a card from the company down
   * the road. Only the COLOUR comes back; what gets offered is still worked out
   * against `catalogue`, so the panel can never suggest paint this shop cannot mix.
   *
   * Deliberately last: the local catalogue is authoritative and free, so the network
   * is touched only once it has drawn a blank.
   */
  const [remote, setRemote] = useState<{ code: string; shades: ReadonlyArray<PaintShade> } | null>(null);
  const remoteSeq = useRef(0);
  useEffect(() => {
    const code = deferredQuery.trim().toUpperCase();
    // A code is one token. Anything with a space in it is someone searching by name,
    // and asking the server to look it up as a code would be a request per pause.
    if (!mayCrossReference || !onLookupCode || localRef) return;
    if (code.length < 2 || code.length > 24 || /\s/.test(code)) return;
    const mine = ++remoteSeq.current;
    const t = setTimeout(() => {
      onLookupCode(code)
        .then((hits) => {
          // A slower earlier lookup must not overwrite a newer answer: on this panel a
          // stale result is the wrong colour, not merely a stale screen.
          if (remoteSeq.current === mine) setRemote({ code, shades: hits });
        })
        // Silent: search still answers from the loaded catalogue, and a failed
        // background lookup is not something to interrupt someone browsing with.
        .catch(() => {});
    }, LOOKUP_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [mayCrossReference, deferredQuery, onLookupCode, localRef]);

  const crossRef = useMemo<CrossBrandLookup | null>(() => {
    if (localRef) return localRef;
    if (!remote || remote.code !== deferredQuery.trim().toUpperCase()) return null;
    return crossBrandLookup(remote.code, catalogue, remote.shades);
  }, [localRef, remote, deferredQuery, catalogue]);

  // A company chosen out of an ambiguous code doesn't survive the next query.
  useEffect(() => setPickedCandidate(null), [deferredQuery]);
  /**
   * The ambiguous case, once the user has said which company they meant: re-run the
   * lookup against that one company's copy of the code, so the answer below is scored
   * from the right colour rather than from whichever company sorted first.
   */
  const resolvedRef = useMemo<CrossBrandLookup | null>(() => {
    if (!crossRef || crossRef.kind !== "ambiguous" || !pickedCandidate) return crossRef;
    const picked = crossRef.candidates.find((c) => c.brand === pickedCandidate);
    if (!picked) return crossRef;
    return crossBrandLookup(picked.code, catalogue, [picked]);
  }, [crossRef, pickedCandidate, catalogue]);

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

  const activeFilterCount = (family !== "All" ? 1 : 0) + (tone !== "All" ? 1 : 0);
  const clearFilters = () => {
    setFamily("All");
    setTone("All");
  };

  const tabLabel = (tabId: Tab) =>
    tabId === "Catalogue" ? "Colours" : tabId === "AI Suggest" ? "AI Suggest" : "Your Selection";

  const tabIcon = (tabId: Tab) =>
    tabId === "Catalogue" ? <PaletteIcon /> : tabId === "AI Suggest" ? <SparkleIcon /> : <BookmarkIcon />;

  return (
    <div className={`hv-studio-panel${awaitingPhoto ? " is-awaiting-photo" : ""}`}>
      {/* Before a photo exists the whole panel used to be live: search, filters,
          the wall selector, all 10,062 shades, AI Suggest with "Apply all", the
          custom picker. Picking Wine Sensation and pressing Apply did nothing at
          all — no toast, no error, no hint. Now the reason is on screen and the
          controls below it are genuinely inert, so nothing can be pressed and
          silently ignored. */}
      {awaitingPhoto && (
        <div className="hv-studio-gate" role="status">
          <p className="hv-studio-gate-text">
            Add a photo of the room first — colours need a wall to land on.
          </p>
          {onNeedPhoto && (
            <button type="button" className="btn btn-sm" onClick={onNeedPhoto}>
              Add a photo
            </button>
          )}
        </div>
      )}
      <div className="hv-studio-tabs" role="tablist" inert={awaitingPhoto || undefined}>
        {tabs.map((tabId) => {
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
        <div className="hv-studio-filter-bar" inert={awaitingPhoto || undefined}>
          <div className="hv-studio-filter-row">
            <div className="hv-studio-search">
              <span aria-hidden style={{ color: "var(--fg-mute)", display: "inline-flex" }}>
                <SearchIcon />
              </span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  mayCrossReference ? "Search by name, or any company's code" : "Search by name or code"
                }
                aria-label={
                  mayCrossReference
                    ? "Search by name, or a code from any company"
                    : "Search by name or code"
                }
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
            <Note>
              {shown.length} {shown.length === 1 ? "colour" : "colours"} across{" "}
              {byCompany.length} {byCompany.length === 1 ? "company" : "companies"}
            </Note>
          </div>
        </div>
      )}

      {/* A real box (not display:contents) so the dimming below can apply to it.
          RegionStrip renders nothing when there are no walls, which is exactly
          the case this gate covers, so the wrapper collapses to zero height. */}
      <div inert={awaitingPhoto || undefined}>
      <RegionStrip
        regions={regions}
        activeRegionId={activeRegionId}
        onSelectRegion={onSelectRegion}
        onAddWall={onAddWall}
        onEditWall={onEditWall}
        onDeleteWall={onDeleteWall}
        masksRemaining={masksRemaining}
      />
      </div>

      <div className="hv-studio-scroll" ref={scrollRef} inert={awaitingPhoto || undefined}>
        {tab === "Catalogue" && (
          <>
            {resolvedRef && (
              <CrossBrandBand
                lookup={resolvedRef}
                onSelect={onSelect}
                onPickCandidate={setPickedCandidate}
                hideCodes={hideCodes}
                hideNames={hideNames}
                showBrands={showBrands}
                encodeCode={encodeCode}
              />
            )}
            {shown.length === 0 ? (
              <p className="hv-studio-empty">
                {/* The cross-reference is the answer in this case, so saying "no shades
                    match" over the top of it would be telling the user their search
                    failed while its result sits directly above. */}
                {resolvedRef
                  ? "Nothing on screen carries that code itself — the closest colours are above."
                  : "No shades match. Clear the search, family or depth filter."}
              </p>
            ) : (
              <div className="hv-studio-by-company">
                {byCompany.map(({ brand, list }) => (
                  <CompanySection
                    key={brand}
                    brand={showBrands ? brand : null}
                    list={list}
                    visible={companyVisible[brand] ?? COMPANY_INITIAL}
                    onShowMore={showMoreOfCompany}
                    groupKey={brand}
                    selected={selected}
                    onSelect={onSelect}
                    hideCodes={hideCodes}
                    hideNames={hideNames}
                    encodeCode={encodeCode}
                  />
                ))}
              </div>
            )}
            {/* At the foot of the shade list, where somebody has just chosen a
                colour from a screen. Small and quiet, but it is here rather than
                only in the terms, because this is the moment it matters. */}
            {shown.length > 0 && (
              <p className="hv-studio-fineprint">{SHADE_ACCURACY_TEXT}</p>
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
        hideNames={hideNames}
            encodeCode={encodeCode}
            onFetchAiPalettes={onFetchAiPalettes}
            onAddComboToPdf={onAddComboToPdf}
            shopCombos={shopCombos}
            outdoor={outdoor}
          />
        )}

        {tab === "Your Selection" && (
          <SelectionPanel
            combos={selectionCombos}
            note={selectionNote}
            regions={regions}
            activeRegionId={activeRegionId}
            onSelect={onSelect}
            onApplyToRegion={onApplyToRegion}
            hideCodes={hideCodes}
            hideNames={hideNames}
            encodeCode={encodeCode}
          />
        )}

      </div>

      <SelectionDock
        shade={activeShade}
        catalogue={catalogue}
        outdoor={outdoor}
        onSelectShade={onSelect}
        onApply={activeShade ? () => onSelect(activeShade) : undefined}
        onKeepOriginal={onKeepOriginal}
        canKeepOriginal={activeApplied}
        activeRegionLabel={activeRegionLabel}
        hideCodes={hideCodes}
        hideNames={hideNames}
        encodeCode={encodeCode}
        clashNote={clashNote}
        recentShades={recentShades}
        triedShades={triedShades}
        selectedCode={selected}
        awaitingPhoto={awaitingPhoto}
        onNeedPhoto={onNeedPhoto}
      />
    </div>
  );
}

/**
 * The dock's second line: the shade's code and its company, or the family alone
 * when the shop hides both. Falls back exactly as the joined string it replaced
 * did — an empty code AND an empty brand leave the family, and a shop hiding
 * names leaves nothing rather than printing the family it also hides.
 */
function DockMeta({ code, brand, family }: { code: string | null; brand: string | null; family: string }) {
  if (!code && !brand) return <>{family}</>;
  return (
    <>
      {code && <span className="shade-code">{code}</span>}
      {code && brand ? " · " : null}
      {brand}
    </>
  );
}

/** A scrolling block of rectangular colour tiles. */
function SwatchGrid({
  shades,
  selected,
  onSelect,
  hideCodes = false,
  hideNames = false,
  encodeCode,
}: {
  shades: ReadonlyArray<PaintShade>;
  selected?: string;
  onSelect: (shade: PaintShade) => void;
  hideCodes?: boolean;
  hideNames?: boolean;
  encodeCode?: (code: string) => string;
}) {
  const codeLabel = (code: string) => (hideCodes ? (encodeCode ? encodeCode(code) : null) : code);
  // With names hidden the code becomes the colour's only handle, so it stands in for
  // the name rather than leaving the swatch with no label at all.
  const nameLabel = (s: { name: string; code: string }) =>
    hideNames ? (codeLabel(s.code) ?? "") : s.name;
  return (
    <div className="hv-studio-swatches">
      {shades.map((s) => {
        const code = codeLabel(s.code);
        return (
          <button
            key={s.code}
            type="button"
            onClick={() => onSelect(s)}
            title={hideNames ? (code ?? "Colour") : code ? `${s.name} · ${code}` : s.name}
            aria-label={hideNames ? `Colour ${code ?? s.hex}` : code ? `${s.name}, code ${code}` : s.name}
            className={`hv-studio-swatch ${selected === s.code ? "is-selected" : ""}`}
          >
            <span className="hv-studio-swatch-color" style={{ background: s.hex }} />
            <span className="hv-studio-swatch-name">{nameLabel(s)}</span>
            {/* The code is what gets written on the bill, so it is on the tile
                rather than one click away. Hidden only when the shop has turned
                codes off AND has no substitute encoding to show — and when names
                are hidden the code has already been promoted into the name slot,
                so printing it twice would be noise. */}
            {code && !hideNames && <span className="hv-studio-swatch-code">{code}</span>}
          </button>
        );
      })}
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
  groupKey,
  selected,
  onSelect,
  hideCodes,
  hideNames,
  encodeCode,
}: {
  /** The heading to print, or null when this viewer may not be told the company. */
  brand: string | null;
  list: ReadonlyArray<PaintShade>;
  visible: number;
  onShowMore: (brand: string, next: number) => void;
  /** The company this group actually is — the key "show more" counts against, kept
   *  separate from `brand` so hiding the heading does not merge every group's counter. */
  groupKey: string;
  selected?: string;
  onSelect: (shade: PaintShade) => void;
  hideCodes?: boolean;
  hideNames?: boolean;
  encodeCode?: (code: string) => string;
}) {
  const slice = useMemo(
    () => (list.length > visible ? list.slice(0, visible) : list),
    [list, visible],
  );
  return (
    <div>
      {/* The heading names the company of every swatch under it, so for a viewer who
          may not be told the company it goes entirely — leaving the count, which is
          still worth having and gives away nothing. */}
      <div className="hv-studio-brand-head">
        {brand && <span>{brand}</span>}
        <Mono>{slice.length < list.length ? `${slice.length} of ${list.length}` : list.length}</Mono>
      </div>
      <SwatchGrid shades={slice} selected={selected} onSelect={onSelect} hideCodes={hideCodes} hideNames={hideNames} encodeCode={encodeCode} />
      {slice.length < list.length && (
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          style={{ margin: "8px 16px 4px" }}
          onClick={() => onShowMore(groupKey, visible + COMPANY_STEP)}
        >
          Show {Math.min(COMPANY_STEP, list.length - slice.length)} more
        </button>
      )}
    </div>
  );
});

/**
 * "You typed a code we don't stock — here is what we do."
 *
 * Sits at the head of the Colours tab whenever the search box holds a code belonging
 * to a company the panel isn't showing. The customer designed their room against
 * whatever card was to hand; the shop in front of them sells something else. Without
 * this the search says "no shades match", which is true of the catalogue on screen and
 * useless to the person holding the code.
 *
 * Each row is a real swatch: tapping it paints the wall, exactly like tapping one in
 * the grid below. The point is not to report a lookup, it is to get the colour onto
 * the photo.
 *
 * Two things it will not do. It never quotes a near miss as if it were the colour —
 * "the same colour" and "close" are printed apart, because a wall painted on the
 * strength of a confusion between them is the wrong wall. And it obeys the panel's own
 * disclosure rules: with `showBrands` off no company is named here either, since a
 * band that attributes the very shades the grid deliberately leaves unattributed would
 * simply be the leak moved up the page.
 */
function CrossBrandBand({
  lookup,
  onSelect,
  onPickCandidate,
  hideCodes = false,
  hideNames = false,
  showBrands = true,
  encodeCode,
}: {
  lookup: CrossBrandLookup;
  onSelect: (shade: PaintShade) => void;
  /** Answer to "which company's code is this?" when several share it. */
  onPickCandidate: (brand: string) => void;
  hideCodes?: boolean;
  hideNames?: boolean;
  showBrands?: boolean;
  encodeCode?: (code: string) => string;
}) {
  const codeLabel = (code: string) => (hideCodes ? (encodeCode ? encodeCode(code) : null) : code);
  const nameLabel = (s: { name: string; code: string }) =>
    hideNames ? (codeLabel(s.code) ?? "") : s.name;

  if (lookup.kind === "ambiguous") {
    return (
      <section className="hv-studio-xref" aria-label={`More than one match for ${lookup.query}`}>
        <Mono>Which one?</Mono>
        <p className="hv-studio-xref-lead">
          {/* A guess here would name a real shade from the wrong company, which reads
              exactly like a right answer. With companies hidden the same question is
              asked about the colours themselves, which the customer can see. */}
          {showBrands
            ? `More than one company uses “${lookup.query}”. Which one is on the colour board?`
            : `More than one colour carries “${lookup.query}”. Which one is on the colour board?`}
        </p>
        <div className="hv-studio-xref-choices">
          {lookup.candidates.map((c) => (
            <button
              key={c.brand}
              type="button"
              className="hv-studio-xref-choice"
              onClick={() => onPickCandidate(c.brand)}
            >
              <span aria-hidden className="hv-studio-xref-dot" style={{ background: c.hex }} />
              {showBrands ? c.brand : nameLabel(c) || c.hex}
            </button>
          ))}
        </div>
      </section>
    );
  }

  const { source, matches, query, viaHvCode } = lookup;
  // What the user typed, not what we resolved: the box shows their input, and two
  // disagreeing reads of the same code look like a bug rather than a translation.
  const typed = viaHvCode ? query : showBrands ? `${source.brand} ${query}` : query;
  const sourceName = hideNames ? null : source.name;

  return (
    <section className="hv-studio-xref" aria-label={`Colours similar to ${typed}`}>
      <Mono>Similar to {typed}</Mono>
      <div className="hv-studio-xref-source">
        <span aria-hidden className="hv-studio-xref-dot" style={{ background: source.hex }} />
        <span className="hv-studio-xref-source-text">
          {typed}
          {sourceName ? ` · ${sourceName}` : ""}
        </span>
      </div>
      <p className="hv-studio-xref-lead">
        {matches.length === 1
          ? "The nearest colour on screen:"
          : "The nearest colour in each company on screen:"}
      </p>
      <div className="hv-studio-xref-matches">
        {matches.map(({ shade, deltaE, exact }) => {
          const code = codeLabel(shade.code);
          const closeness = exact ? "The same colour" : closenessRating(deltaE);
          return (
            <button
              key={`${shade.brand}-${shade.code}`}
              type="button"
              className="hv-studio-xref-match"
              onClick={() => onSelect(shade)}
              aria-label={`Apply ${nameLabel(shade) || "colour"}${code ? `, code ${code}` : ""}${
                showBrands ? `, ${shade.brand}` : ""
              } — ${closeness.toLowerCase()} to ${typed}`}
            >
              <span aria-hidden className="hv-studio-xref-chip" style={{ background: shade.hex }} />
              <span className="hv-studio-xref-match-text">
                <span className="hv-studio-xref-match-name">
                  {nameLabel(shade) || "Colour"}
                  {code && !hideNames ? ` · ${code}` : ""}
                </span>
                <span className="hv-studio-xref-match-note">
                  {showBrands ? `${shade.brand} · ` : ""}
                  {closeness}
                  {/* ΔE only where it qualifies a near miss. Printed beside "the same
                      colour" it would read as a hedge on an answer that has none. */}
                  {exact ? "" : ` · ΔE ${deltaE}`}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

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
  onApply,
  onKeepOriginal,
  canKeepOriginal = false,
  activeRegionLabel,
  hideCodes = false,
  hideNames = false,
  encodeCode,
  clashNote,
  recentShades,
  triedShades,
  selectedCode,
  awaitingPhoto = false,
  onNeedPhoto,
}: {
  shade?: PaintShade;
  catalogue: ReadonlyArray<PaintShade>;
  outdoor?: boolean;
  /** Applies any shade (steppers, warning alternatives and the recent strip use this). */
  onSelectShade: (shade: PaintShade) => void;
  onApply?: () => void;
  /** Remove the colour from the active region so it renders unpainted. */
  onKeepOriginal?: () => void;
  /** Only offer "Keep original" when the active region actually has a colour. */
  canKeepOriginal?: boolean;
  activeRegionLabel?: string;
  hideCodes?: boolean;
  hideNames?: boolean;
  encodeCode?: (code: string) => string;
  clashNote?: string | null;
  recentShades?: ReadonlyArray<PaintShade>;
  triedShades?: ReadonlyArray<PaintShade>;
  selectedCode?: string;
  /** No photo yet — Apply becomes the way to go and get one. */
  awaitingPhoto?: boolean;
  onNeedPhoto?: () => void;
}) {
  const [tipsOpen, setTipsOpen] = useState(false);

  // The tips panel floats over the grid now, so it needs the escape hatch every
  // overlay needs — the toggle button alone is not enough for a keyboard user
  // who has tabbed down into the tips themselves.
  useEffect(() => {
    if (!tipsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTipsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tipsOpen]);

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
  // With names hidden the code becomes the colour's only handle, so it stands in for
  // the name rather than leaving the swatch with no label at all.
  const nameLabel = (s: { name: string; code: string }) =>
    hideNames ? (codeLabel(s.code) ?? "") : s.name;

  const altChip = (s: PaintShade) => (
    <button
      key={s.code}
      type="button"
      onClick={() => onSelectShade(s)}
      title={hideNames ? (codeLabel(s.code) ?? "Colour") : codeLabel(s.code) ? `${s.name} · ${codeLabel(s.code)}` : s.name}
      className="hv-studio-chip"
    >
      <span aria-hidden className="hv-studio-chip-dot" style={{ background: s.hex }} />
      {nameLabel(s)}
    </button>
  );

  return (
    <div className="hv-studio-dock">
      {tipsOpen && canOpenTips && (
        <div className="hv-studio-dock-tips" id="hv-studio-tips">
          {shade && (
            <div className="hv-studio-dock-tips-row">
              <UndertoneTag hex={shade.hex} prefix />
              {shiftsInLamplight && shift && (
                <span
                  title="This colour changes noticeably under a warm evening bulb"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "400 12px/1 var(--mono)", letterSpacing: ".12em", textTransform: "uppercase", color: "var(--fg-mute)" }}
                >
                  <span aria-hidden style={{ width: 14, height: 8, borderRadius: 2, background: `linear-gradient(90deg, ${shade.hex} 50%, ${shift.warmHex} 50%)`, border: "1px solid var(--rule-strong)" }} />
                  shifts in lamplight
                </span>
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
                Deep {hideCodes || hideNames ? "shades like this" : `shades like ${shade.name}`} fade faster in
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
                    Ceiling: {nameLabel(pairing.ceiling)}{!hideNames && codeLabel(pairing.ceiling.code) ? ` · ${codeLabel(pairing.ceiling.code)}` : ""}
                  </span>
                )}
                {pairing.trim && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 7, font: "400 12px/1.2 var(--sans)", color: "var(--fg-soft)" }}>
                    <span aria-hidden style={{ width: 16, height: 16, borderRadius: 4, background: pairing.trim.hex, border: "1px solid var(--rule-strong)" }} />
                    Trim: {nameLabel(pairing.trim)}{!hideNames && codeLabel(pairing.trim.code) ? ` · ${codeLabel(pairing.trim.code)}` : ""}
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
          <span className="hv-studio-dock-name">{shade ? (nameLabel(shade) || "Colour") : "No colour selected"}</span>
          {/* Two different kinds of content share this slot. A code · brand pair is
              a label, and reads well as mono-caps. The empty-state hint is a
              sentence, and as mono-caps it clipped to "TAP ANY SWATCH — IT PAINTS
              THE ACT…" — so it gets sentence case and room to wrap.

              Within the label the code is its own element rather than a piece of
              a joined string: it is the part that has to survive being read off a
              screen at arm's length, so it takes the .shade-code face (an
              unambiguous zero) while the brand keeps the mono-caps. */}
          <span className={`hv-studio-dock-meta${shade ? "" : " is-hint"}`}>
            {shade ? (
              <DockMeta
                code={codeLabel(shade.code)}
                brand={hideNames ? null : shade.brand}
                family={hideNames ? "" : shade.family}
              />
            ) : (
              "Tap any swatch — it paints the active wall"
            )}
          </span>
        </div>
        <div className="hv-studio-dock-btns">
          {/* Fan-deck steppers: flip through the strip like a paper shade card. */}
          <button
            type="button"
            onClick={() => lighter && onSelectShade(lighter)}
            disabled={!lighter}
            title={lighter ? `One step lighter${nameLabel(lighter) ? `: ${nameLabel(lighter)}` : ""}` : "No lighter step in this family"}
            aria-label={lighter ? `Apply one step lighter${nameLabel(lighter) ? `, ${nameLabel(lighter)}` : ""}` : "No lighter step"}
            className="hv-studio-step"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => darker && onSelectShade(darker)}
            disabled={!darker}
            title={darker ? `One step darker${nameLabel(darker) ? `: ${nameLabel(darker)}` : ""}` : "No darker step in this family"}
            aria-label={darker ? `Apply one step darker${nameLabel(darker) ? `, ${nameLabel(darker)}` : ""}` : "No darker step"}
            className="hv-studio-step"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={() => setTipsOpen((o) => !o)}
            disabled={!canOpenTips}
            aria-expanded={tipsOpen}
            aria-controls="hv-studio-tips"
            title={canOpenTips ? "Advice for this colour: pairings, light and warnings" : "Pick a colour to see tips"}
            className={`hv-studio-dock-tipsbtn ${hasWarning ? "has-warn" : ""} ${tipsOpen ? "is-open" : ""}`}
          >
            {hasWarning ? "⚠ " : ""}Tips{tipCount > 0 ? ` (${tipCount})` : ""}
          </button>
          {/* With no photo this button used to be fully enabled and do nothing
              when pressed. It now says what is missing and goes and gets it. */}
          <button
            type="button"
            onClick={awaitingPhoto ? onNeedPhoto : onApply}
            disabled={awaitingPhoto ? !onNeedPhoto : !onApply}
            title={awaitingPhoto ? "Add a photo of the room, then colours can go on its walls" : "Apply this shade to the active wall"}
            className="btn btn-sm"
          >
            {awaitingPhoto ? "Add a photo first" : "Apply"}
          </button>
        </div>
      </div>

      {/* Leave a wall out of the scheme: strip its colour so the original
          surface shows through, instead of being forced to paint every region. */}
      {onKeepOriginal && canKeepOriginal && (
        <button
          type="button"
          onClick={onKeepOriginal}
          className="hv-studio-dock-keep"
          title={
            activeRegionLabel
              ? `Leave ${activeRegionLabel} unpainted — show the original surface`
              : "Leave this wall unpainted"
          }
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M5.6 5.6l12.8 12.8" />
          </svg>
          Keep {activeRegionLabel ?? "this wall"} unpainted
        </button>
      )}

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
 * Put a whole palette on the room at once, by ROLE: first colour → main wall, second →
 * accent, third → trim. Falls back to the active wall when the regions can't be mapped
 * (no per-region apply available, or a room with a single surface), so "Apply all"
 * always does something visible rather than silently landing nowhere.
 *
 * Shared by every card that has an "Apply all": the AI suggestions, the shop's picks and
 * the customer's own saved selection. Those cards differ in where their colours come
 * from, not in what applying three of them at once means.
 */
function applyShadesByRole(
  shades: ReadonlyArray<PaintShade | undefined>,
  {
    regions,
    activeRegionId,
    onApplyToRegion,
    onSelect,
  }: {
    regions?: ReadonlyArray<RegionLite>;
    activeRegionId?: string;
    onApplyToRegion?: (regionId: string, shade: PaintShade) => void;
    onSelect: (shade: PaintShade) => void;
  },
): void {
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
}

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
  onAddComboToPdf,
  codeLabel,
  nameLabel,
  applyAllTitle,
}: {
  title: ReactNode;
  rationale?: string | null;
  trio: ReadonlyArray<PaintShade | undefined>;
  onSelect: (shade: PaintShade) => void;
  onApplyCombo: (shades: ReadonlyArray<PaintShade | undefined>) => void;
  /** Apply the palette AND snapshot it onto the colour-board PDF. Absent where the board
   *  isn't available (guests, no canvas yet), in which case no button is rendered. */
  onAddComboToPdf?: (shades: ReadonlyArray<PaintShade | undefined>) => void;
  codeLabel: (code: string) => string | null;
  /** The colour's display name — empty when the shop hides paint names. */
  nameLabel: (shade: { name: string; code: string }) => string;
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
              title={`${nameLabel(s) || "Colour"}${code ? ` · ${code}` : ""} — tap for the active wall, drag onto another role to swap`}
              aria-label={`${PALETTE_ROLES[slot]}: ${nameLabel(s) || "colour"}${code ? ` (${code})` : ""}. Tap to apply to the active wall, drag onto another role to swap.`}
            >
              <span aria-hidden className="hv-ai-swatch-color" style={{ background: s.hex }} />
              <span className="hv-ai-swatch-role">{PALETTE_ROLES[slot]}</span>
              <span className="hv-ai-swatch-name">{nameLabel(s)}</span>
              {code && <span className="hv-ai-swatch-code">{code}</span>}
            </button>
          );
        })}
      </div>
      <div className="hv-ai-card-actions">
        <button type="button" onClick={() => onApplyCombo(arranged)} className="btn btn-sm" title={applyAllTitle}>
          Apply all
        </button>
        {/* One step, not three: the palette a counter likes is almost always the one they
            want on the customer's sheet, and making them apply it, hunt for the board tray
            and press Add lost that intent somewhere between the clicks. */}
        {onAddComboToPdf && (
          <button
            type="button"
            onClick={() => onAddComboToPdf(arranged)}
            className="btn btn-sm"
            title="Apply this palette and put it straight on the colour-board PDF"
          >
            Add to PDF
          </button>
        )}
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

/**
 * "Your Selection" — the only colour tab a LOCKED project has.
 *
 * When a project closes (or its window lapses) the catalogue and the AI suggestions go
 * away, because both are offers to repaint and the server refuses every repaint on a
 * locked project. What survives is the thing the customer actually finished with: the
 * combinations printed on their colour boards, each one still on its own walls.
 *
 * It reads like the AI Suggest cards on purpose — same card, same swatches, same
 * "Apply all" — because it is the same gesture. The difference is where the colours come
 * from and where they land: a board recorded WHICH wall each colour was on, so a
 * two-colour combination goes back onto its two walls and a three-colour one onto its
 * three, in one press, exactly as the customer last saw the room. Tapping one swatch
 * puts that single colour on its own wall.
 *
 * Applying here repaints the picture on screen and nothing else. The project stays
 * locked and nothing is saved — the studio's own view-only banner says so, and this
 * panel repeats it once above the cards rather than letting a customer press Apply and
 * wonder whether they have just changed something they had finished with.
 */
function SelectionPanel({
  combos,
  note,
  regions,
  activeRegionId,
  onSelect,
  onApplyToRegion,
  hideCodes = false,
  hideNames = false,
  encodeCode,
}: {
  combos?: ReadonlyArray<SelectionCombo>;
  note?: string | null;
  regions?: ReadonlyArray<RegionLite>;
  activeRegionId?: string;
  onSelect: (shade: PaintShade) => void;
  onApplyToRegion?: (regionId: string, shade: PaintShade) => void;
  hideCodes?: boolean;
  hideNames?: boolean;
  encodeCode?: (code: string) => string;
}) {
  const codeLabel = (code: string) => (hideCodes ? (encodeCode ? encodeCode(code) : null) : code);
  const nameLabel = (s: { name: string; code: string }) =>
    hideNames ? (codeLabel(s.code) ?? "") : s.name;

  // A wall the board named is only a target if it is still IN the room. A region
  // deleted since the board was printed leaves its colour on the card — it was part of
  // the combination — but sends it to the role fallback rather than to an id that no
  // longer resolves.
  const liveRegionId = (entry: SelectionEntry) =>
    entry.regionId && regions?.some((r) => r.id === entry.regionId) ? entry.regionId : undefined;

  /**
   * Put a whole saved combination back on the room in one press.
   *
   * By the RECORDED wall wherever the board knew it, which is what makes this exact
   * rather than approximate: the customer sees the room as they left it, not a fresh
   * guess at which colour belongs where. Anything the board couldn't place — an older
   * board with no region on it, or a wall since deleted — falls through to the same
   * main/accent/trim mapping every other "Apply all" uses.
   */
  const applyCombo = (combo: SelectionCombo) => {
    const placed: SelectionEntry[] = [];
    const unplaced: SelectionEntry[] = [];
    for (const entry of combo.entries) (liveRegionId(entry) ? placed : unplaced).push(entry);

    if (onApplyToRegion) {
      for (const entry of placed) onApplyToRegion(liveRegionId(entry)!, entry.shade);
    }
    // Nothing could be placed by name → the whole combination goes through the roles.
    // Some placed, some not → only the leftovers do, and they must not overwrite a wall
    // the board named, so the already-painted regions are held out of the mapping.
    if (unplaced.length > 0) {
      const taken = new Set(placed.map((e) => liveRegionId(e)));
      applyShadesByRole(
        unplaced.map((e) => e.shade),
        {
          regions: regions?.filter((r) => !taken.has(r.id)),
          activeRegionId,
          onApplyToRegion,
          onSelect,
        },
      );
    }
  };

  if (!combos || combos.length === 0) {
    return (
      <div className="hv-ai-panel">
        <p className="hv-studio-empty">
          No colours were saved on this project, so there is nothing to show here. The room
          above is exactly as it was left.
        </p>
      </div>
    );
  }

  return (
    <div className="hv-ai-panel">
      <div className="hv-ai-head">
        <Mono brass>Colours you chose</Mono>
      </div>
      <p className="hv-ai-card-rationale" style={{ marginTop: 0, marginBottom: 14 }}>
        {note ?? "This project is view-only."} Applying a combination here repaints the
        preview so you can look at it again — it doesn&apos;t change anything saved.
      </p>
      <div className="hv-ai-cards">
        {combos.map((combo) => (
          <div key={combo.id} className="hv-ai-card">
            <div className="hv-ai-card-name">{combo.title}</div>
            <div className="hv-ai-trio">
              {combo.entries.map((entry, i) => {
                const code = codeLabel(entry.shade.code);
                const name = nameLabel(entry.shade);
                // The wall the board printed it against, so a customer reads their own
                // room ("Back wall") rather than a role vocabulary they never chose.
                // Falls back to Main/Accent/Trim for a board that recorded no wall.
                const where = entry.regionLabel ?? PALETTE_ROLES[i] ?? "Colour";
                const target = liveRegionId(entry);
                return (
                  <button
                    key={`${combo.id}-${i}-${entry.shade.code}`}
                    type="button"
                    className="hv-ai-swatch"
                    onClick={() =>
                      target && onApplyToRegion
                        ? onApplyToRegion(target, entry.shade)
                        : onSelect(entry.shade)
                    }
                    title={`${name || "Colour"}${code ? ` · ${code}` : ""} — tap to put it back on ${
                      target ? where : "the active wall"
                    }`}
                    aria-label={`${where}: ${name || "colour"}${code ? ` (${code})` : ""}. Tap to apply.`}
                  >
                    <span aria-hidden className="hv-ai-swatch-color" style={{ background: entry.shade.hex }} />
                    <span className="hv-ai-swatch-role">{where}</span>
                    <span className="hv-ai-swatch-name">{name}</span>
                    {code && <span className="hv-ai-swatch-code">{code}</span>}
                  </button>
                );
              })}
            </div>
            <div className="hv-ai-card-actions">
              <button
                type="button"
                onClick={() => applyCombo(combo)}
                className="btn btn-sm"
                title="Put this whole combination back on the room"
              >
                Apply all
              </button>
            </div>
          </div>
        ))}
      </div>
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
  hideNames = false,
  encodeCode,
  onFetchAiPalettes,
  onAddComboToPdf,
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
  hideNames?: boolean;
  encodeCode?: (code: string) => string;
  /** Claude palettes for THIS photo; hidden when absent. */
  onFetchAiPalettes?: () => Promise<AiRecommendationResponse>;
  /** Snapshot the room onto the colour-board PDF, once a palette has been applied. */
  onAddComboToPdf?: () => void;
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
  // Whether the seed colour was chosen here rather than read off the wall. It
  // only changes what the panel SAYS it built around — but saying "the colour on
  // your wall" about a colour the user picked in this header is just wrong.
  const [seedPicked, setSeedPicked] = useState(false);

  const codeLabel = (code: string) => (hideCodes ? (encodeCode ? encodeCode(code) : null) : code);
  // With names hidden the code becomes the colour's only handle, so it stands in for
  // the name rather than leaving the swatch with no label at all.
  const nameLabel = (s: { name: string; code: string }) =>
    hideNames ? (codeLabel(s.code) ?? "") : s.name;

  const stale = (baseHex ?? "") !== (snap.baseHex ?? "");
  // `catalogue` arrives already scoped to the company chosen in the studio topbar,
  // so the generated palettes and the coordinate pairings below are within that
  // company by construction — there is no second filter to keep in step with it.
  const palettes = useMemo(
    () => generatePalettes(catalogue, snap.baseHex, snap.variant),
    [catalogue, snap.baseHex, snap.variant],
  );
  const rebuild = () => {
    setSnap({ baseHex, regions: regions ?? [], variant: 0 });
    setSeedPicked(false);
  };
  const shuffle = () => setSnap((s) => ({ ...s, variant: s.variant + 1 }));
  // Re-seed the palettes on a colour chosen right here, so a counter can explore
  // "what would go with THIS?" without first having to paint it on a wall. The
  // variant resets, so the first set you see is the scheme's best answer for the
  // new colour rather than wherever the shuffle had got to for the old one.
  const reseed = (hex: string) => {
    setSnap((s) => ({ ...s, baseHex: hex, variant: 0 }));
    setSeedPicked(true);
  };
  // <input type="color"> demands a full #rrggbb and silently shows black for
  // anything else; palettes can also be seeded from nothing at all.
  const seedValue = snap.baseHex && /^#[0-9a-fA-F]{6}$/.test(snap.baseHex) ? snap.baseHex : "#C8C2B8";

  // "Apply all" puts the whole palette on the room at once: main → main wall,
  // accent → accent wall, trim → trim — each to its matching region. Targets the
  // LIVE regions, not the snapshot, so paint always lands on the real walls.
  const applyCombo = (shades: ReadonlyArray<PaintShade | undefined>) =>
    applyShadesByRole(shades, { regions, activeRegionId, onApplyToRegion, onSelect });

  // Apply, then hand off to the caller to capture. Sequencing the two here rather than
  // in each section keeps "what Apply all does" in exactly one place.
  const addComboToPdf = onAddComboToPdf
    ? (shades: ReadonlyArray<PaintShade | undefined>) => {
        applyCombo(shades);
        onAddComboToPdf();
      }
    : undefined;

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
        hideNames={hideNames}
          encodeCode={encodeCode}
        />
      )}

      {onFetchAiPalettes && (
        <SuggestedColoursSection
          onAddComboToPdf={addComboToPdf}
          fetchPalettes={onFetchAiPalettes}
          catalogue={catalogue}
          onSelect={onSelect}
          onApplyCombo={applyCombo}
          hideCodes={hideCodes}
        hideNames={hideNames}
          encodeCode={encodeCode}
        />
      )}

      {/* The free, local Room palettes need the catalogue; the suggestions above
          do not, so an empty/loading catalogue only blanks THIS half. */}
      {palettes.length === 0 && (
        <p className="hv-studio-empty">The catalogue is still loading — palettes will appear here.</p>
      )}

      {/* The same chip covers both ways the palettes can drift from the room: the
          wall was repainted under them, or the seed above was set by hand. Either
          way the way back is the same — rebuild on what the wall actually shows. */}
      {palettes.length > 0 && stale && (
        <button
          type="button"
          onClick={rebuild}
          className="hv-ai-rebuild"
          title={
            seedPicked
              ? "Go back to building these around the room itself"
              : "The wall colour changed since these were built"
          }
        >
          {seedPicked
            ? baseHex
              ? "↺ Back to the colour on your wall"
              : "↺ Back to the starting palettes"
            : "↺ Wall colour changed — rebuild suggestions around it"}
        </button>
      )}

      {palettes.length > 0 && (
        <>
          <div className="hv-ai-head">
            <Mono>Room palettes</Mono>
            <div className="hv-ai-head-tools">
              {/* The colour the palettes are built from, editable in place. It used
                  to be read-only — whatever was on the active wall — so "shuffle"
                  could only ever reshuffle around that one colour. */}
              <label className="hv-ai-seed" title="The colour these palettes are built around — change it, then shuffle">
                <span className="hv-ai-seed-label">From</span>
                <input
                  type="color"
                  className="hv-ai-seed-input"
                  value={seedValue}
                  onChange={(e) => reseed(e.target.value)}
                  aria-label="Colour the palettes are built around"
                />
              </label>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={shuffle}
                title="Different suggestions around the same colour, with the same rules"
              >
                ↻ Shuffle
              </button>
            </div>
          </div>
          <p className="hv-ai-intro">
            {snap.baseHex ? (
              <>
                Built around {seedPicked ? "the colour you picked" : "the colour on your wall"}
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
                // `addComboToPdf`, not the raw prop: the raw one only captures, so the
                // board got the colours that were on the wall BEFORE the card was
                // pressed. Every "Add to PDF" applies its palette first.
                onAddComboToPdf={addComboToPdf}
                codeLabel={codeLabel}
                nameLabel={nameLabel}
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
        hideNames={hideNames}
          encodeCode={encodeCode}
        />
      )}
    </div>
  );
}

/**
 * "Suggested for this room" — schemes generated from the actual project photo
 * (backend POST /recommendations). Included in the project, like everything else
 * done inside one, so an ask is free; it is still not fetched until the retailer
 * explicitly asks, because it is a real model call. The only 402 left is a project
 * whose access window has closed, which gets its own message; every other failure
 * keeps the button usable for a retry.
 *
 * The UI names no vendor. Which model answers is our business and may change; a
 * shop wants to know the suggestions are real catalogue shades and cost nothing,
 * and putting a supplier's brand on the button told them neither.
 */
function SuggestedColoursSection({
  fetchPalettes,
  onAddComboToPdf,
  catalogue,
  onSelect,
  onApplyCombo,
  hideCodes = false,
  hideNames = false,
  encodeCode,
}: {
  fetchPalettes: () => Promise<AiRecommendationResponse>;
  onAddComboToPdf?: (shades: ReadonlyArray<PaintShade | undefined>) => void;
  catalogue: ReadonlyArray<PaintShade>;
  onSelect: (shade: PaintShade) => void;
  onApplyCombo: (shades: ReadonlyArray<PaintShade | undefined>) => void;
  hideCodes?: boolean;
  hideNames?: boolean;
  encodeCode?: (code: string) => string;
}) {
  const codeLabel = (code: string) => (hideCodes ? (encodeCode ? encodeCode(code) : null) : code);
  // With names hidden the code becomes the colour's only handle, so it stands in for
  // the name rather than leaving the swatch with no label at all.
  const nameLabel = (s: { name: string; code: string }) =>
    hideNames ? (codeLabel(s.code) ?? "") : s.name;
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
        <Mono brass>Suggested for this room</Mono>
        <button
          type="button"
          className="btn btn-sm"
          onClick={ask}
          disabled={loading}
          title="Looks at your photo and suggests three colour schemes, one colour per wall you have marked. Every suggestion is a real shade from your catalogue. Included — asking costs nothing."
        >
          {loading ? "Thinking…" : combos ? "Suggest again" : "Suggest colours"}
        </button>
      </div>
      {!combos && !loading && !error && (
        <p className="hv-ai-intro">
          Colour schemes picked for this photo — its light, its furniture, its mood.
          Included, so asking costs nothing extra.
        </p>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error.quota
            ? "This project's access window has closed. Reopen it to keep working on it — the free Room palettes below still work."
            : error.message}
        </p>
      )}
      {combos && cards.length === 0 && !loading && (
        <p className="hv-studio-empty">No matching shades came back for this photo — please try again.</p>
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
              onAddComboToPdf={onAddComboToPdf}
              codeLabel={codeLabel}
              nameLabel={nameLabel}
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
/**
 * Most of a shop's combinations shown per scope. Five is a shortlist; beyond that the
 * section stops reading as "our picks" and starts reading as a catalogue the customer
 * has to get past.
 */
const MAX_COMBOS_PER_SCOPE = 5;

function ShopPicksSection({
  combos,
  outdoor = false,
  catalogue,
  onSelect,
  onApplyCombo,
  hideCodes = false,
  hideNames = false,
  encodeCode,
}: {
  combos: ReadonlyArray<RetailerCombo>;
  outdoor?: boolean;
  catalogue: ReadonlyArray<PaintShade>;
  onSelect: (shade: PaintShade) => void;
  onApplyCombo: (shades: ReadonlyArray<PaintShade | undefined>) => void;
  hideCodes?: boolean;
  hideNames?: boolean;
  encodeCode?: (code: string) => string;
}) {
  const codeLabel = (code: string) => (hideCodes ? (encodeCode ? encodeCode(code) : null) : code);
  // With names hidden the code becomes the colour's only handle, so it stands in for
  // the name rather than leaving the swatch with no label at all.
  const nameLabel = (s: { name: string; code: string }) =>
    hideNames ? (codeLabel(s.code) ?? "") : s.name;
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

  const [open, setOpen] = useState(true);

  const wanted = outdoor ? "EXTERIOR" : "INTERIOR";
  /**
   * At most five per scope, the matching scope first.
   *
   * A shop with thirty saved combinations turned this section into a wall of cards the
   * customer scrolled past to reach anything else — the picks stopped being picks. Five
   * is a shortlist. Capping per SCOPE rather than overall matters: a shop heavy on
   * interior combos would otherwise push every exterior one off an outdoor photo, which
   * is exactly the photo those were saved for.
   */
  const sorted = useMemo(() => {
    const take = (scope: string) => combos.filter((c) => c.scope === scope).slice(0, MAX_COMBOS_PER_SCOPE);
    const other = wanted === "EXTERIOR" ? "INTERIOR" : "EXTERIOR";
    return [...take(wanted), ...take(other)];
  }, [combos, wanted]);
  const shopName = combos[0]?.organizationName;

  return (
    <div style={{ marginBottom: 28, paddingBottom: 24, borderBottom: "1px solid var(--rule)" }}>
      <div className="hv-ai-head">
        <Mono brass>{shopName ? `${shopName} recommends` : "Your shop recommends"}</Mono>
        {/* Open by default — these are the shop's own recommendations and the reason the
            tab exists. Collapsible because a customer who has chosen already wants the
            catalogue back, not a scroll past cards they have finished with. */}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide" : `Show ${sorted.length}`}
        </button>
      </div>
      {!open ? null : (
      <>
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
                <span className="mono" style={{ marginLeft: 8, fontSize: 12, letterSpacing: ".14em", color: "var(--fg-mute)", textTransform: "uppercase" }}>
                  {combo.scope === "EXTERIOR" ? "Exterior" : "Interior"}
                </span>
              </>
            }
            trio={combo.shades.slice(0, 3).map(toShade)}
            onSelect={onSelect}
            onApplyCombo={onApplyCombo}
            codeLabel={codeLabel}
                nameLabel={nameLabel}
            applyAllTitle="Apply the whole combination — main, accent and trim — across the room"
          />
        ))}
      </div>
      </>
      )}
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
          // Every wall can be removed now, drawn or detected. Detection routinely
          // finds surfaces nobody wants painted — an accent wall the customer is
          // keeping, a ceiling, a strip of floor — and while those had no ✕ they
          // stayed in the strip, the palette and the colour board for the life of
          // the room.
          const canDelete = Boolean(onDeleteWall);
          // The two are not equally cheap to undo: a hand-drawn wall is redrawn in
          // seconds, a detected one only comes back by re-running detection, which
          // costs a credit. So the detected ✕ asks first, and says why.
          const deleteNeedsConfirm = !r.custom;
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
                  onClick={() => {
                    if (
                      deleteNeedsConfirm
                      && !window.confirm(
                        `Remove "${r.label}" from this room?\n\n`
                        + "This wall was found by wall detection, so it can't be brought "
                        + "back without running detection again — which costs a credit. "
                        + "A wall you draw yourself is free to redraw.",
                      )
                    ) {
                      return;
                    }
                    onDeleteWall?.(r.id);
                  }}
                  aria-label={`Remove ${r.label}`}
                  title={
                    deleteNeedsConfirm
                      ? `Remove ${r.label} — found by detection, so bringing it back means running detection again`
                      : `Remove ${r.label} (you can re-draw it any time)`
                  }
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
                    <path d="M6 6l12 12M6 18L18 6" />
                  </svg>
                </button>
              )}
            </div>
          );
        })}
        {/* No handler, no chip — same rule the ✕ and the refine pencil already follow.
            It used to render whatever it was given and call `onAddWall?.()`, so a room
            whose walls are fixed (off the library shelf, or a locked project) showed a
            button that did nothing at all when pressed. */}
        {onAddWall && (
          <button
            type="button"
            onClick={onAddWall}
            disabled={addDisabled}
            title={addDisabled ? "You can add up to 3 walls" : "Draw a wall we missed"}
            className="hv-studio-add-wall-chip"
          >
            + Wall
          </button>
        )}
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

function BookmarkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
      <path d="M9 9h6" />
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
