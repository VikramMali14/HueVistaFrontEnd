// @vitest-environment jsdom
/**
 * "Your shop suggests" — the retailer-curated combinations on the AI Suggest
 * tab. Combos render with the shop's name; Apply all maps main/accent/trim onto
 * the room's regions (catalogue codes resolve to the real entries, unknown codes
 * fall back to the stored name+hex); exterior combos lead for outdoor photos;
 * and the section is absent entirely when the shop has none.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PaintShade, RetailerCombo } from "@/lib/types";
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

const COMBOS: RetailerCombo[] = [
  {
    id: "combo_int",
    organizationId: "org_1",
    organizationName: "Mehta Paints",
    name: "Warm evening hall",
    scope: "INTERIOR",
    shades: [
      // Matches the catalogue entry above — must resolve to the REAL shade.
      { code: "AP-101", name: "Catalogue Fog", hex: "#d9c7ae" },
      // NOT in the catalogue — must still apply via the constructed fallback.
      { code: "AP-999", name: "Retired Terracotta", hex: "#a9714b" },
      { code: "AP-998", name: "Retired Walnut", hex: "#4a3527" },
    ],
    createdAt: "2026-06-18T10:00:00+05:30",
  },
  {
    id: "combo_ext",
    organizationId: "org_1",
    organizationName: "Mehta Paints",
    name: "Laterite facade",
    scope: "EXTERIOR",
    shades: [
      { code: "AP-101", name: "Catalogue Fog", hex: "#d9c7ae" },
      { code: "AP-997", name: "Fern", hex: "#5b6c5b" },
      { code: "AP-996", name: "Pearl White", hex: "#f3eee4" },
    ],
    createdAt: "2026-06-12T10:00:00+05:30",
  },
];

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
      retailerCombos={COMBOS}
      {...overrides}
    />,
  );
  return { onSelect, onApplyToRegion };
}

describe("Shop picks (AI Suggest tab)", () => {
  it("renders the shop's combos and applies a whole combination to the mapped regions", async () => {
    const user = userEvent.setup();
    const { onApplyToRegion } = renderGrid();

    await user.click(screen.getByRole("tab", { name: "AI Suggest" }));
    expect(screen.getByText(/hand-picked by Mehta Paints/)).toBeInTheDocument();
    expect(screen.getByText("Warm evening hall")).toBeInTheDocument();

    // Apply all → slot 1 lands on MAIN_WALL, slots 2 + 3 on accent/trim.
    // Indoor default: the INTERIOR combo's card is listed first.
    const applyAll = screen.getAllByRole("button", { name: "Apply all" })[0]!;
    await user.click(applyAll);
    const calls = onApplyToRegion.mock.calls;
    expect(calls.map(([regionId]) => regionId)).toEqual(["main", "accent", "trim"]);
    // Catalogue hit resolved to the real entry; the unknown code fell back.
    expect(calls[0]![1]).toMatchObject({ code: "AP-101", lrv: 60 });
    expect(calls[1]![1]).toMatchObject({ code: "AP-999", hex: "#a9714b" });
  });

  it("lists exterior combos first for an outdoor photo", async () => {
    const user = userEvent.setup();
    renderGrid({ outdoor: true });

    await user.click(screen.getByRole("tab", { name: "AI Suggest" }));
    const names = screen
      .getAllByText(/Warm evening hall|Laterite facade/)
      .map((n) => n.textContent);
    expect(names[0]).toBe("Laterite facade");
  });

  it("hides the section entirely when the shop has no combos", async () => {
    const user = userEvent.setup();
    renderGrid({ retailerCombos: [] });
    await user.click(screen.getByRole("tab", { name: "AI Suggest" }));
    expect(screen.queryByText(/Your shop suggests/i)).not.toBeInTheDocument();
  });
});
