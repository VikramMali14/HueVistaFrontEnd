// @vitest-environment jsdom
/**
 * "Claude's picks" — the quota-billed photo-palette section on the AI Suggest
 * tab. Nothing may be fetched until the retailer clicks Ask; results map onto
 * the room's regions via Apply all; a 402 shows the quota message instead of a
 * generic error; and the section is absent entirely when no fetcher is passed
 * (guests / unsaved projects).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
      expect(screen.getByRole("alert")).toHaveTextContent(/out of AI previews/),
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
