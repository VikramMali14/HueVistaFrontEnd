// @vitest-environment jsdom
/**
 * A LOCKED project's colour panel.
 *
 * Closing a project — or running out of days on it — used to leave the studio offering
 * both of its browsing tabs: the whole 10,000-shade catalogue and the AI suggestions,
 * neither of which could put a colour on the room, because the server refuses every
 * recolour on a locked project. The customer could spend ten minutes choosing a shade
 * that would never apply.
 *
 * Now a locked project shows exactly one tab — "Your Selection", the combinations off
 * its own colour boards — and buying it open again brings the browsing tabs straight
 * back.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PaintShade } from "@/lib/types";
import type { RegionLite } from "../coordinate-suggestions";
import { ShadeGrid, type SelectionCombo } from "../shade-grid";

const shade = (code: string, name: string, hex: string): PaintShade => ({
  code,
  name,
  hex,
  family: "Neutrals",
  lrv: 50,
  brand: "Asian Paints",
  finishes: [],
});

const CATALOGUE: PaintShade[] = [
  shade("AP-1", "Blush Zephyr", "#d98c8c"),
  shade("AP-2", "Sun Zephyr", "#d9c78c"),
  shade("AP-3", "Leaf Zephyr", "#8cd98c"),
];

const REGIONS: RegionLite[] = [
  { id: "r-main", kind: "MAIN_WALL", label: "Back wall", hex: "#ffffff", applied: false },
  { id: "r-accent", kind: "ACCENT_WALL", label: "Side wall", hex: "#ffffff", applied: false },
  { id: "r-trim", kind: "TRIM", label: "Trim", hex: "#ffffff", applied: false },
];

/** A three-colour board page, each colour on the wall the board recorded it against. */
const TRIO: SelectionCombo = {
  id: "combo-1",
  title: "Board 1 · Option 1",
  entries: [
    { regionId: "r-main", regionLabel: "Back wall", shade: CATALOGUE[0]! },
    { regionId: "r-accent", regionLabel: "Side wall", shade: CATALOGUE[1]! },
    { regionId: "r-trim", regionLabel: "Trim", shade: CATALOGUE[2]! },
  ],
};

/** Two colours, because plenty of rooms only ever had two walls painted. */
const PAIR: SelectionCombo = {
  id: "combo-2",
  title: "Board 1 · Option 2",
  entries: [
    { regionId: "r-main", regionLabel: "Back wall", shade: CATALOGUE[2]! },
    { regionId: "r-trim", regionLabel: "Trim", shade: CATALOGUE[0]! },
  ],
};

function renderPanel(props: Partial<React.ComponentProps<typeof ShadeGrid>> = {}) {
  const onSelect = vi.fn();
  const onApplyToRegion = vi.fn();
  const view = render(
    <ShadeGrid
      onSelect={onSelect}
      onApplyToRegion={onApplyToRegion}
      shades={CATALOGUE}
      regions={REGIONS}
      activeRegionId="r-main"
      {...props}
    />,
  );
  return { onSelect, onApplyToRegion, view };
}

const tabNames = () =>
  screen.getAllByRole("tab").map((t) => t.textContent?.trim());

describe("which tabs a project gets", () => {
  it("gives a live project the two browsing tabs and no selection tab", () => {
    renderPanel({ selectionCombos: [TRIO] });
    expect(tabNames()).toEqual(["Colours", "AI Suggest"]);
    expect(screen.queryByRole("tab", { name: /Your Selection/ })).toBeNull();
  });

  it("takes both browsing tabs away from a locked project", () => {
    renderPanel({ selectionOnly: true, selectionCombos: [TRIO] });
    expect(tabNames()).toEqual(["Your Selection"]);
    expect(screen.queryByRole("tab", { name: /Colours/ })).toBeNull();
    expect(screen.queryByRole("tab", { name: /AI Suggest/ })).toBeNull();
  });

  it("opens a locked project ON the selection, with no tab to press first", () => {
    renderPanel({ selectionOnly: true, selectionCombos: [TRIO] });
    expect(screen.getByRole("tab", { name: /Your Selection/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Board 1 · Option 1")).toBeInTheDocument();
  });

  it("brings the browsing tabs back when the project is bought open", () => {
    const { view } = renderPanel({ selectionOnly: true, selectionCombos: [TRIO] });
    expect(tabNames()).toEqual(["Your Selection"]);

    // A reopen purchase reloads the project under the panel — no remount.
    view.rerender(
      <ShadeGrid
        onSelect={vi.fn()}
        onApplyToRegion={vi.fn()}
        shades={CATALOGUE}
        regions={REGIONS}
        activeRegionId="r-main"
        selectionOnly={false}
        selectionCombos={[]}
      />,
    );
    expect(tabNames()).toEqual(["Colours", "AI Suggest"]);
    // ...and the panel lands on a tab that exists rather than going blank.
    expect(screen.getByRole("tab", { name: /Colours/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Blush Zephyr")).toBeInTheDocument();
  });

  it("closes a live project without leaving the panel on a tab that has gone", () => {
    const { view } = renderPanel({ selectionCombos: [] });
    expect(tabNames()).toEqual(["Colours", "AI Suggest"]);

    view.rerender(
      <ShadeGrid
        onSelect={vi.fn()}
        onApplyToRegion={vi.fn()}
        shades={CATALOGUE}
        regions={REGIONS}
        activeRegionId="r-main"
        selectionOnly
        selectionCombos={[TRIO]}
      />,
    );
    expect(screen.getByRole("tab", { name: /Your Selection/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});

describe("the saved selection itself", () => {
  it("names every colour by the wall the board put it on", () => {
    renderPanel({ selectionOnly: true, selectionCombos: [TRIO] });
    expect(
      screen.getByRole("button", { name: /^Back wall: Blush Zephyr \(AP-1\)/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Side wall: Sun Zephyr \(AP-2\)/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Trim: Leaf Zephyr \(AP-3\)/ })).toBeInTheDocument();
  });

  it("puts all three colours back on their own walls in one press", async () => {
    const user = userEvent.setup();
    const { onApplyToRegion } = renderPanel({ selectionOnly: true, selectionCombos: [TRIO] });

    await user.click(screen.getByRole("button", { name: "Apply all" }));

    expect(onApplyToRegion.mock.calls.map(([id, s]) => [id, (s as PaintShade).code])).toEqual([
      ["r-main", "AP-1"],
      ["r-accent", "AP-2"],
      ["r-trim", "AP-3"],
    ]);
  });

  it("applies a two-colour combination to its two walls and leaves the third alone", async () => {
    const user = userEvent.setup();
    const { onApplyToRegion } = renderPanel({ selectionOnly: true, selectionCombos: [PAIR] });

    await user.click(screen.getByRole("button", { name: "Apply all" }));

    expect(onApplyToRegion.mock.calls.map(([id, s]) => [id, (s as PaintShade).code])).toEqual([
      ["r-main", "AP-3"],
      ["r-trim", "AP-1"],
    ]);
    expect(onApplyToRegion.mock.calls.some(([id]) => id === "r-accent")).toBe(false);
  });

  it("offers each board page its own Apply all", async () => {
    const user = userEvent.setup();
    const { onApplyToRegion } = renderPanel({
      selectionOnly: true,
      selectionCombos: [TRIO, PAIR],
    });

    const cards = screen.getAllByRole("button", { name: "Apply all" });
    expect(cards).toHaveLength(2);

    await user.click(cards[1]!);
    expect(onApplyToRegion.mock.calls.map(([id]) => id)).toEqual(["r-main", "r-trim"]);
  });

  it("puts a single colour back on its own wall when its swatch is tapped", async () => {
    const user = userEvent.setup();
    const { onApplyToRegion, onSelect } = renderPanel({
      selectionOnly: true,
      selectionCombos: [TRIO],
    });

    await user.click(screen.getByRole("button", { name: /^Side wall: Sun Zephyr/ }));

    expect(onApplyToRegion).toHaveBeenCalledTimes(1);
    expect(onApplyToRegion.mock.calls[0]![0]).toBe("r-accent");
    expect((onApplyToRegion.mock.calls[0]![1] as PaintShade).code).toBe("AP-2");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("falls back to main/accent/trim for a board that recorded no walls", async () => {
    const user = userEvent.setup();
    const { onApplyToRegion } = renderPanel({
      selectionOnly: true,
      selectionCombos: [
        {
          id: "old-board",
          title: "Board 1 · Option 1",
          entries: CATALOGUE.map((s) => ({ shade: s })),
        },
      ],
    });

    // No region ids on the entries, so the swatches read as roles instead of walls.
    expect(screen.getByRole("button", { name: /^Main: Blush Zephyr/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Apply all" }));
    expect(onApplyToRegion.mock.calls.map(([id, s]) => [id, (s as PaintShade).code])).toEqual([
      ["r-main", "AP-1"],
      ["r-accent", "AP-2"],
      ["r-trim", "AP-3"],
    ]);
  });

  it("sends a colour whose wall has since been deleted to the active wall", async () => {
    const user = userEvent.setup();
    const { onApplyToRegion } = renderPanel({
      selectionOnly: true,
      regions: [REGIONS[0]!],
      selectionCombos: [
        {
          id: "combo-3",
          title: "Board 1 · Option 1",
          // r-accent is not in the room any more.
          entries: [{ regionId: "r-accent", regionLabel: "Side wall", shade: CATALOGUE[1]! }],
        },
      ],
    });

    await user.click(screen.getByRole("button", { name: "Apply all" }));
    expect(onApplyToRegion.mock.calls.map(([id, s]) => [id, (s as PaintShade).code])).toEqual([
      ["r-main", "AP-2"],
    ]);
  });

  it("says the preview is only a preview, in the studio's own words", () => {
    renderPanel({
      selectionOnly: true,
      selectionCombos: [TRIO],
      selectionNote: "This project has ended.",
    });
    expect(screen.getByText(/This project has ended\./)).toBeInTheDocument();
    expect(screen.getByText(/doesn't change anything saved/)).toBeInTheDocument();
  });

  it("explains itself rather than showing an empty tab when nothing was saved", () => {
    renderPanel({ selectionOnly: true, selectionCombos: [] });
    expect(screen.getByText(/No colours were saved on this project/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Apply all" })).toBeNull();
  });

  it("hides real codes from a guest, showing the shop's scheme instead", () => {
    renderPanel({
      selectionOnly: true,
      selectionCombos: [TRIO],
      hideCodes: true,
      encodeCode: (c) => `HV-${c}`,
    });
    const swatch = screen.getByRole("button", { name: /^Back wall: Blush Zephyr/ });
    expect(within(swatch).getByText("HV-AP-1")).toBeInTheDocument();
    expect(within(swatch).queryByText("AP-1")).toBeNull();
  });
});
