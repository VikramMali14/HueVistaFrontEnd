// @vitest-environment jsdom
/**
 * "Claude's picks" — the quota-billed photo-palette section on the AI Suggest
 * tab. Nothing may be fetched until the retailer clicks Ask; results map onto
 * the room's regions via Apply all; a 402 shows the quota message instead of a
 * generic error; and the section is absent entirely when no fetcher is passed
 * (guests / unsaved projects).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpError } from "@/lib/http-error";
import type { AiRecommendationResponse, PaintShade } from "@/lib/types";
import type { RegionLite } from "../coordinate-suggestions";
import { ShadeGrid } from "../shade-grid";

const SHADES: PaintShade[] = [
  { code: "AP-101", name: "Catalogue Fog", hex: "#d9c7ae", family: "Neutrals", lrv: 60, brand: "Asian Paints", finishes: [] },
];

const REGIONS: RegionLite[] = [
  { id: "main", kind: "MAIN_WALL", label: "Main wall", hex: "#ffffff", applied: false },
  { id: "accent", kind: "ACCENT_WALL", label: "Accent wall", hex: "#ffffff", applied: false },
  { id: "trim", kind: "TRIM", label: "Border", hex: "#ffffff", applied: false },
];

const RESPONSE: AiRecommendationResponse = {
  projectId: "prj_1",
  imageType: "INDOOR",
  combinations: [
    {
      name: "Morning Chai",
      rationale: "Warm neutrals for the light in this room.",
      primaryHex: "#d9c7ae",
      // Matches the catalogue entry above — must resolve to the REAL shade.
      primaryShade: { id: 1, shadeCode: "AP-101", name: "Catalogue Fog", hexCode: "#d9c7ae" },
      accentHex: "#a9714b",
      // NOT in the catalogue — must still apply via the constructed fallback.
      accentShade: { id: 2, shadeCode: "AP-202", name: "Terracotta Ray", hexCode: "#a9714b", brand: "Asian Paints" },
      trimHex: "#4a3527",
      trimShade: { id: 3, shadeCode: "AP-303", name: "Deep Walnut", hexCode: "#4a3527" },
    },
  ],
};

function renderGrid(overrides: Partial<Parameters<typeof ShadeGrid>[0]> = {}) {
  const onSelect = vi.fn();
  const onApplyToRegion = vi.fn();
  render(
    <ShadeGrid
      onSelect={onSelect}
      shades={SHADES}
      regions={REGIONS}
      activeRegionId="main"
      onApplyToRegion={onApplyToRegion}
      {...overrides}
    />,
  );
  return { onSelect, onApplyToRegion };
}

describe("Claude's picks (AI Suggest tab)", () => {
  it("fetches nothing until Ask is clicked, then applies a whole palette to the mapped regions", async () => {
    const user = userEvent.setup();
    const fetchPalettes = vi.fn(async () => RESPONSE);
    const { onApplyToRegion } = renderGrid({ onFetchAiPalettes: fetchPalettes });

    await user.click(screen.getByRole("tab", { name: "AI Suggest" }));
    expect(fetchPalettes).not.toHaveBeenCalled(); // costs a preview — never automatic

    await user.click(screen.getByRole("button", { name: /Ask Claude/ }));
    expect(await screen.findByText("Morning Chai")).toBeInTheDocument();
    expect(fetchPalettes).toHaveBeenCalledTimes(1);

    // Apply all → primary lands on the MAIN_WALL region, accent + trim on theirs.
    const applyAll = screen.getAllByRole("button", { name: "Apply all" })[0]!;
    await user.click(applyAll);
    const calls = onApplyToRegion.mock.calls;
    expect(calls.map(([regionId]) => regionId)).toEqual(["main", "accent", "trim"]);
    // Catalogue hit resolved to the real entry; the unmatched one fell back.
    expect(calls[0]![1]).toMatchObject({ code: "AP-101", lrv: 60 });
    expect(calls[1]![1]).toMatchObject({ code: "AP-202", hex: "#a9714b" });
  });

  it("shows the quota message on 402 instead of a generic error", async () => {
    const user = userEvent.setup();
    const fetchPalettes = vi.fn(async () => {
      throw new HttpError(402, "Monthly AI generation limit reached (60).");
    });
    renderGrid({ onFetchAiPalettes: fetchPalettes });

    await user.click(screen.getByRole("tab", { name: "AI Suggest" }));
    await user.click(screen.getByRole("button", { name: /Ask Claude/ }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/out of images/),
    );
    // The button stays usable for a retry after the reset/upgrade.
    expect(screen.getByRole("button", { name: /Ask Claude/ })).toBeEnabled();
  });

  it("hides the section entirely when no fetcher is provided (guest / unsaved project)", async () => {
    const user = userEvent.setup();
    renderGrid();
    await user.click(screen.getByRole("tab", { name: "AI Suggest" }));
    expect(screen.queryByRole("button", { name: /Ask Claude/ })).not.toBeInTheDocument();
  });
});

/**
 * Company filter (AI Suggest tab) — picking a company scopes the locally
 * generated Room palettes to that brand's shades. Two brands with distinct
 * name tokens ("Zephyr" = Asian Paints, "Quartz" = Berger) let us assert the
 * scope purely from the swatch labels the cards render.
 */
const TWO_BRAND_SHADES: PaintShade[] = [
  { code: "AP-1", name: "Blush Zephyr", hex: "#d98c8c", family: "Reds", lrv: 45, brand: "Asian Paints", finishes: [] },
  { code: "AP-2", name: "Sun Zephyr", hex: "#d9c78c", family: "Yellows", lrv: 62, brand: "Asian Paints", finishes: [] },
  { code: "AP-3", name: "Leaf Zephyr", hex: "#8cd98c", family: "Greens", lrv: 58, brand: "Asian Paints", finishes: [] },
  { code: "AP-4", name: "Sky Zephyr", hex: "#8cc7d9", family: "Blues", lrv: 55, brand: "Asian Paints", finishes: [] },
  { code: "AP-5", name: "Plum Zephyr", hex: "#c78cd9", family: "Purples", lrv: 40, brand: "Asian Paints", finishes: [] },
  { code: "AP-6", name: "Chalk Zephyr", hex: "#f4f1ea", family: "Whites", lrv: 88, brand: "Asian Paints", finishes: [] },
  { code: "BG-1", name: "Blush Quartz", hex: "#cf7f7f", family: "Reds", lrv: 42, brand: "Berger", finishes: [] },
  { code: "BG-2", name: "Sun Quartz", hex: "#cfbf7f", family: "Yellows", lrv: 60, brand: "Berger", finishes: [] },
  { code: "BG-3", name: "Leaf Quartz", hex: "#7fcf7f", family: "Greens", lrv: 56, brand: "Berger", finishes: [] },
  { code: "BG-4", name: "Sky Quartz", hex: "#7fbfcf", family: "Blues", lrv: 53, brand: "Berger", finishes: [] },
  { code: "BG-5", name: "Plum Quartz", hex: "#bf7fcf", family: "Purples", lrv: 38, brand: "Berger", finishes: [] },
  { code: "BG-6", name: "Chalk Quartz", hex: "#f2eee6", family: "Whites", lrv: 86, brand: "Berger", finishes: [] },
];

describe("Company filter (AI Suggest tab)", () => {
  it("scopes the generated Room palettes to the selected company's shades", async () => {
    const user = userEvent.setup();
    render(<ShadeGrid onSelect={vi.fn()} shades={TWO_BRAND_SHADES} />);

    await user.click(screen.getByRole("tab", { name: "AI Suggest" }));

    // Both companies are offered as pills; unfiltered, both brands' shades can
    // surface in the palettes.
    expect(screen.getByRole("button", { name: "Asian Paints" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Berger" })).toBeInTheDocument();
    expect(screen.queryAllByRole("button", { name: /Zephyr/ }).length).toBeGreaterThan(0);

    // Pick Berger → every palette swatch is now a Berger ("Quartz") shade.
    await user.click(screen.getByRole("button", { name: "Berger" }));
    expect(screen.queryAllByRole("button", { name: /Quartz/ }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("button", { name: /Zephyr/ })).toHaveLength(0);

    // Clearing the filter brings Asian Paints' shades back into the pool.
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.queryAllByRole("button", { name: /Zephyr/ }).length).toBeGreaterThan(0);
  });

  it("hides the company filter when the catalogue has a single brand", async () => {
    const user = userEvent.setup();
    render(<ShadeGrid onSelect={vi.fn()} shades={SHADES} />);
    await user.click(screen.getByRole("tab", { name: "AI Suggest" }));
    expect(screen.queryByRole("button", { name: "Asian Paints" })).not.toBeInTheDocument();
  });
});

describe("Keep original (leave a wall unpainted)", () => {
  it("offers to clear the active region's colour when it is painted", async () => {
    const user = userEvent.setup();
    const onKeepOriginal = vi.fn();
    render(
      <ShadeGrid
        onSelect={vi.fn()}
        shades={SHADES}
        regions={REGIONS}
        activeRegionId="main"
        activeRegionLabel="Main wall"
        activeApplied
        onKeepOriginal={onKeepOriginal}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Keep Main wall unpainted/ }));
    expect(onKeepOriginal).toHaveBeenCalledTimes(1);
  });

  it("hides the control when the active region has no colour to remove", () => {
    render(
      <ShadeGrid
        onSelect={vi.fn()}
        shades={SHADES}
        regions={REGIONS}
        activeRegionId="main"
        activeRegionLabel="Main wall"
        activeApplied={false}
        onKeepOriginal={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /unpainted/ })).not.toBeInTheDocument();
  });
});

/** Dispatch a window-level pointer event (the card's drag listeners live on
 *  window); jsdom's MouseEvent lacks pointerId, so it's defined by hand. */
function firePointer(type: string, opts: { pointerId: number; clientX: number; clientY: number }) {
  const Ctor = (window as unknown as { PointerEvent?: typeof MouseEvent }).PointerEvent ?? MouseEvent;
  const ev = new Ctor(type, { bubbles: true, cancelable: true, clientX: opts.clientX, clientY: opts.clientY });
  if ((ev as unknown as { pointerId?: number }).pointerId !== opts.pointerId) {
    Object.defineProperty(ev, "pointerId", { value: opts.pointerId });
  }
  window.dispatchEvent(ev);
}

describe("Palette card role swap (drag a colour onto another role)", () => {
  const originalElementFromPoint = document.elementFromPoint;
  afterEach(() => {
    document.elementFromPoint = originalElementFromPoint;
  });

  it("dragging Main onto Trim swaps the two colours before Apply all", async () => {
    const user = userEvent.setup();
    const fetchPalettes = vi.fn(async () => RESPONSE);
    const { onApplyToRegion } = renderGrid({ onFetchAiPalettes: fetchPalettes });

    await user.click(screen.getByRole("tab", { name: "AI Suggest" }));
    await user.click(screen.getByRole("button", { name: /Ask Claude/ }));
    await screen.findByText("Morning Chai");

    const mainSwatch = screen.getAllByRole("button", { name: /^Main: Catalogue Fog/ })[0]!;
    const trimSwatch = screen.getAllByRole("button", { name: /^Trim: Deep Walnut/ })[0]!;

    // jsdom has no layout — point the hit test at the Trim slot ourselves.
    document.elementFromPoint = () => trimSwatch;

    fireEvent.pointerDown(mainSwatch, { pointerId: 7, clientX: 10, clientY: 10, button: 0 });
    act(() => {
      firePointer("pointermove", { pointerId: 7, clientX: 60, clientY: 12 }); // passes the 8px threshold, horizontal
      firePointer("pointermove", { pointerId: 7, clientX: 90, clientY: 12 });
      firePointer("pointerup", { pointerId: 7, clientX: 90, clientY: 12 });
    });

    // Roles swapped in place: Main now holds Deep Walnut, Trim holds Catalogue Fog.
    expect(screen.getAllByRole("button", { name: /^Main: Deep Walnut/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /^Trim: Catalogue Fog/ }).length).toBeGreaterThan(0);

    // Apply all delivers the SWAPPED arrangement to the mapped regions.
    await user.click(screen.getAllByRole("button", { name: "Apply all" })[0]!);
    const byRegion = new Map(onApplyToRegion.mock.calls.map(([regionId, shade]) => [regionId, shade]));
    expect(byRegion.get("main")).toMatchObject({ code: "AP-303" });
    expect(byRegion.get("trim")).toMatchObject({ code: "AP-101" });
    expect(byRegion.get("accent")).toMatchObject({ code: "AP-202" });
  });

  it("a plain tap still applies the swatch to the active wall (no accidental swap)", async () => {
    const user = userEvent.setup();
    const fetchPalettes = vi.fn(async () => RESPONSE);
    const { onSelect } = renderGrid({ onFetchAiPalettes: fetchPalettes });

    await user.click(screen.getByRole("tab", { name: "AI Suggest" }));
    await user.click(screen.getByRole("button", { name: /Ask Claude/ }));
    await screen.findByText("Morning Chai");

    await user.click(screen.getAllByRole("button", { name: /^Main: Catalogue Fog/ })[0]!);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ code: "AP-101" }));
  });
});
