// @vitest-environment jsdom
/**
 * "Suggested for this room" — the photo-based scheme section on the AI Suggest
 * tab. Nothing may be fetched until the retailer clicks Ask; results map onto
 * the room's regions via Apply all; a 402 shows the closed-window message instead of a
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
  { code: "HV-101", name: "Catalogue Fog", hex: "#d9c7ae", family: "Neutrals", lrv: 60, brand: "Sample palette", finishes: [] },
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
      primaryShade: { id: 1, shadeCode: "HV-101", name: "Catalogue Fog", hexCode: "#d9c7ae" },
      accentHex: "#a9714b",
      // NOT in the catalogue — must still apply via the constructed fallback.
      accentShade: { id: 2, shadeCode: "HV-202", name: "Terracotta Ray", hexCode: "#a9714b", brand: "Sample palette" },
      trimHex: "#4a3527",
      trimShade: { id: 3, shadeCode: "HV-303", name: "Deep Walnut", hexCode: "#4a3527" },
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

describe("Suggested colours (AI Suggest tab)", () => {
  it("fetches nothing until Ask is clicked, then applies a whole palette to the mapped regions", async () => {
    const user = userEvent.setup();
    const fetchPalettes = vi.fn(async () => RESPONSE);
    const { onApplyToRegion } = renderGrid({ onFetchAiPalettes: fetchPalettes });

    await user.click(screen.getByRole("tab", { name: "AI Suggest" }));
    expect(fetchPalettes).not.toHaveBeenCalled(); // costs a preview — never automatic

    await user.click(screen.getByRole("button", { name: /Suggest colours/ }));
    expect(await screen.findByText("Morning Chai")).toBeInTheDocument();
    expect(fetchPalettes).toHaveBeenCalledTimes(1);

    // Apply all → primary lands on the MAIN_WALL region, accent + trim on theirs.
    const applyAll = screen.getAllByRole("button", { name: "Apply all" })[0]!;
    await user.click(applyAll);
    const calls = onApplyToRegion.mock.calls;
    expect(calls.map(([regionId]) => regionId)).toEqual(["main", "accent", "trim"]);
    // Catalogue hit resolved to the real entry; the unmatched one fell back.
    expect(calls[0]![1]).toMatchObject({ code: "HV-101", lrv: 60 });
    expect(calls[1]![1]).toMatchObject({ code: "HV-202", hex: "#a9714b" });
  });

  it("shows the closed-window message on 402 instead of a generic error", async () => {
    const user = userEvent.setup();
    const fetchPalettes = vi.fn(async () => {
      throw new HttpError(402, "This project's access window has closed.");
    });
    renderGrid({ onFetchAiPalettes: fetchPalettes });

    await user.click(screen.getByRole("tab", { name: "AI Suggest" }));
    await user.click(screen.getByRole("button", { name: /Suggest colours/ }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/access window has closed/),
    );
    // The button stays usable for a retry after the reset/upgrade.
    expect(screen.getByRole("button", { name: /Suggest colours/ })).toBeEnabled();
  });

  it("hides the section entirely when no fetcher is provided (guest / unsaved project)", async () => {
    const user = userEvent.setup();
    renderGrid();
    await user.click(screen.getByRole("tab", { name: "AI Suggest" }));
    expect(screen.queryByRole("button", { name: /Suggest colours/ })).not.toBeInTheDocument();
  });
});

/**
 * Company scope — the studio topbar picks the company and hands this panel the
 * shades to work from, so the panel itself carries no company filter at all (it
 * used to carry two, one on Colours and a separate one on AI Suggest, each with
 * its own answer). Two brands with distinct name tokens ("Zephyr" = Sample
 * palette, "Quartz" = Berger) let us assert the scope purely from the swatch
 * labels the cards render.
 */
const TWO_BRAND_SHADES: PaintShade[] = [
  { code: "HV-1", name: "Blush Zephyr", hex: "#d98c8c", family: "Reds", lrv: 45, brand: "Sample palette", finishes: [] },
  { code: "HV-2", name: "Sun Zephyr", hex: "#d9c78c", family: "Yellows", lrv: 62, brand: "Sample palette", finishes: [] },
  { code: "HV-3", name: "Leaf Zephyr", hex: "#8cd98c", family: "Greens", lrv: 58, brand: "Sample palette", finishes: [] },
  { code: "HV-4", name: "Sky Zephyr", hex: "#8cc7d9", family: "Blues", lrv: 55, brand: "Sample palette", finishes: [] },
  { code: "HV-5", name: "Plum Zephyr", hex: "#c78cd9", family: "Purples", lrv: 40, brand: "Sample palette", finishes: [] },
  { code: "HV-6", name: "Chalk Zephyr", hex: "#f4f1ea", family: "Whites", lrv: 88, brand: "Sample palette", finishes: [] },
  { code: "BG-1", name: "Blush Quartz", hex: "#cf7f7f", family: "Reds", lrv: 42, brand: "Berger", finishes: [] },
  { code: "BG-2", name: "Sun Quartz", hex: "#cfbf7f", family: "Yellows", lrv: 60, brand: "Berger", finishes: [] },
  { code: "BG-3", name: "Leaf Quartz", hex: "#7fcf7f", family: "Greens", lrv: 56, brand: "Berger", finishes: [] },
  { code: "BG-4", name: "Sky Quartz", hex: "#7fbfcf", family: "Blues", lrv: 53, brand: "Berger", finishes: [] },
  { code: "BG-5", name: "Plum Quartz", hex: "#bf7fcf", family: "Purples", lrv: 38, brand: "Berger", finishes: [] },
  { code: "BG-6", name: "Chalk Quartz", hex: "#f2eee6", family: "Whites", lrv: 86, brand: "Berger", finishes: [] },
];

describe("Company scope", () => {
  it("draws Room palettes only from the shades it is handed", async () => {
    const user = userEvent.setup();
    // What the topbar hands down when Berger is chosen: one company's shades.
    const berger = TWO_BRAND_SHADES.filter((s) => s.brand === "Berger");
    render(<ShadeGrid onSelect={vi.fn()} shades={berger} />);

    await user.click(screen.getByRole("tab", { name: "AI Suggest" }));

    expect(screen.queryAllByRole("button", { name: /Quartz/ }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("button", { name: /Zephyr/ })).toHaveLength(0);
  });

  it("keeps the Colours grid on the same company as the palettes", async () => {
    const berger = TWO_BRAND_SHADES.filter((s) => s.brand === "Berger");
    render(<ShadeGrid onSelect={vi.fn()} shades={berger} />);

    // Catalogue is the tab on open — no interaction needed.
    expect(screen.queryAllByRole("button", { name: /Quartz/ }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("button", { name: /Zephyr/ })).toHaveLength(0);
  });

  it("carries no company filter of its own — the topbar owns that choice", async () => {
    const user = userEvent.setup();
    render(<ShadeGrid onSelect={vi.fn()} shades={TWO_BRAND_SHADES} />);

    // Neither on Colours (behind the Filters drawer)…
    await user.click(screen.getByRole("button", { name: /Filters/ }));
    expect(screen.queryByRole("button", { name: "Berger" })).not.toBeInTheDocument();
    // …nor on AI Suggest, where a second, independent one used to live.
    await user.click(screen.getByRole("tab", { name: "AI Suggest" }));
    expect(screen.queryByRole("button", { name: "Berger" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sample palette" })).not.toBeInTheDocument();
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

/**
 * A swatch is labelled with the WALL it is going on, not with a role vocabulary the
 * customer never chose. The fixture's trim wall is called "Border", which is the point:
 * whatever the room calls a surface is what the card calls it, so nobody has to hold a
 * translation in their head while judging a colour.
 */
describe("Palette card role swap (drag a colour onto another wall)", () => {
  const originalElementFromPoint = document.elementFromPoint;
  afterEach(() => {
    document.elementFromPoint = originalElementFromPoint;
  });

  it("dragging the main wall's colour onto the border swaps the two before Apply all", async () => {
    const user = userEvent.setup();
    const fetchPalettes = vi.fn(async () => RESPONSE);
    const { onApplyToRegion } = renderGrid({ onFetchAiPalettes: fetchPalettes });

    await user.click(screen.getByRole("tab", { name: "AI Suggest" }));
    await user.click(screen.getByRole("button", { name: /Suggest colours/ }));
    await screen.findByText("Morning Chai");

    const mainSwatch = screen.getAllByRole("button", { name: /^Main wall: Catalogue Fog/ })[0]!;
    const trimSwatch = screen.getAllByRole("button", { name: /^Border: Deep Walnut/ })[0]!;

    // jsdom has no layout — point the hit test at the Trim slot ourselves.
    document.elementFromPoint = () => trimSwatch;

    fireEvent.pointerDown(mainSwatch, { pointerId: 7, clientX: 10, clientY: 10, button: 0 });
    act(() => {
      firePointer("pointermove", { pointerId: 7, clientX: 60, clientY: 12 }); // passes the 8px threshold, horizontal
      firePointer("pointermove", { pointerId: 7, clientX: 90, clientY: 12 });
      firePointer("pointerup", { pointerId: 7, clientX: 90, clientY: 12 });
    });

    // Swapped in place: the main wall now holds Deep Walnut, the border Catalogue Fog.
    expect(screen.getAllByRole("button", { name: /^Main wall: Deep Walnut/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /^Border: Catalogue Fog/ }).length).toBeGreaterThan(0);

    // Apply all delivers the SWAPPED arrangement to the mapped regions.
    await user.click(screen.getAllByRole("button", { name: "Apply all" })[0]!);
    const byRegion = new Map(onApplyToRegion.mock.calls.map(([regionId, shade]) => [regionId, shade]));
    expect(byRegion.get("main")).toMatchObject({ code: "HV-303" });
    expect(byRegion.get("trim")).toMatchObject({ code: "HV-101" });
    expect(byRegion.get("accent")).toMatchObject({ code: "HV-202" });
  });

  it("a plain tap still applies the swatch to the active wall (no accidental swap)", async () => {
    const user = userEvent.setup();
    const fetchPalettes = vi.fn(async () => RESPONSE);
    const { onSelect } = renderGrid({ onFetchAiPalettes: fetchPalettes });

    await user.click(screen.getByRole("tab", { name: "AI Suggest" }));
    await user.click(screen.getByRole("button", { name: /Suggest colours/ }));
    await screen.findByText("Morning Chai");

    await user.click(screen.getAllByRole("button", { name: /^Main wall: Catalogue Fog/ })[0]!);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ code: "HV-101" }));
  });
});
