// @vitest-environment jsdom
/**
 * The paint plan: which of a room's surfaces are being painted, and what each one is.
 *
 * Two things were wrong and they were the same thing seen from two ends. A room's
 * regions are everything anybody found or drew — detection returns what it sees, the
 * Mask Studio adds what the customer outlines — and the studio treated all of them as
 * walls to paint. So somebody who marked out ten surfaces to get the shapes right and
 * wanted three of them coloured had no way to say so; and every suggestion came back as
 * a fixed main/accent/trim trio however many walls the room actually had, which left a
 * customer with one feature wall holding three colours and no idea which was theirs.
 *
 * The plan answers both. Tick the walls you are painting, say what each one is, and a
 * combination is exactly that many colours — one per wall, each labelled with the wall
 * it is going on.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PaintShade } from "@/lib/types";
import { ShadeGrid } from "../shade-grid";
import type { RegionLite } from "../coordinate-suggestions";

afterEach(cleanup);

const shade = (code: string, name: string, hex: string, family: string, lrv: number): PaintShade => ({
  code, name, hex, family, lrv, brand: "Asian Paints", finishes: [],
});

/** Wide enough round the wheel that a five-colour scheme has somewhere to go. */
const CATALOGUE: PaintShade[] = [
  shade("AP-1", "Blush", "#d98c8c", "Reds", 45),
  shade("AP-2", "Sun", "#d9c78c", "Yellows", 62),
  shade("AP-3", "Leaf", "#8cd98c", "Greens", 58),
  shade("AP-4", "Sky", "#8cc7d9", "Blues", 55),
  shade("AP-5", "Plum", "#c78cd9", "Purples", 40),
  shade("AP-6", "Chalk", "#f4f1ea", "Whites", 88),
  shade("AP-7", "Clay", "#b07a4e", "Browns", 35),
  shade("AP-8", "Slate", "#6b7480", "Greys", 30),
  shade("AP-9", "Moss", "#5d7048", "Greens", 28),
  shade("AP-10", "Rose", "#c98f9b", "Reds", 50),
  shade("AP-11", "Sand", "#ded2b8", "Yellows", 72),
  shade("AP-12", "Ink", "#2f3540", "Greys", 12),
];

const wall = (id: string, kind: RegionLite["kind"], label: string, extra: Partial<RegionLite> = {}): RegionLite => ({
  id, kind, label, hex: "#ffffff", applied: false, ...extra,
});

function renderGrid(regions: RegionLite[], overrides: Partial<Parameters<typeof ShadeGrid>[0]> = {}) {
  const onSelect = vi.fn();
  const onApplyToRegion = vi.fn();
  const onSetWallInPlan = vi.fn();
  const onSetWallRole = vi.fn();
  render(
    <ShadeGrid
      onSelect={onSelect}
      shades={CATALOGUE}
      regions={regions}
      activeRegionId={regions[0]?.id}
      baseHex="#A47148"
      onApplyToRegion={onApplyToRegion}
      onSetWallInPlan={onSetWallInPlan}
      onSetWallRole={onSetWallRole}
      {...overrides}
    />,
  );
  return { onSelect, onApplyToRegion, onSetWallInPlan, onSetWallRole };
}

/** The first suggestion card in the "Room palettes" section. */
function firstCard(): HTMLElement {
  const cards = document.querySelectorAll(".hv-ai-card");
  expect(cards.length).toBeGreaterThan(0);
  return cards[0] as HTMLElement;
}

/** How many colours that card is offering. */
function swatchCount(): number {
  return firstCard().querySelectorAll(".hv-ai-swatch").length;
}

describe("A combination is as long as the room's list of walls", () => {
  it.each([1, 2, 3, 4, 5])("offers %i colours for %i walls being painted", async (n) => {
    const kinds: ReadonlyArray<RegionLite["kind"]> = [
      "MAIN_WALL", "ACCENT_WALL", "OTHER_WALL", "OTHER_WALL", "TRIM",
    ];
    const regions = Array.from({ length: n }, (_, i) => wall(`w${i}`, kinds[i]!, `Wall ${i + 1}`));
    const user = userEvent.setup();
    renderGrid(regions);

    await user.click(screen.getByRole("tab", { name: "AI Suggest" }));
    expect(swatchCount()).toBe(n);
  });

  it("says out loud how many colours it is offering, and why", async () => {
    const user = userEvent.setup();
    renderGrid([
      wall("a", "MAIN_WALL", "Back wall"),
      wall("b", "ACCENT_WALL", "Chimney breast"),
    ]);

    await user.click(screen.getByRole("tab", { name: "AI Suggest" }));
    expect(
      screen.getByText(/Each combination is 2 colours — one for each of the 2 walls/),
    ).toBeInTheDocument();
  });

  /**
   * The count follows the plan, not the room. This is the whole ask: mark ten surfaces
   * so the shapes are right, paint three.
   */
  it("counts only the walls that are ticked", async () => {
    const user = userEvent.setup();
    renderGrid([
      wall("a", "MAIN_WALL", "Back wall"),
      wall("b", "ACCENT_WALL", "Chimney breast"),
      wall("c", "OTHER_WALL", "Side wall", { inPlan: false }),
      wall("d", "TRIM", "Skirting", { inPlan: false }),
    ]);

    await user.click(screen.getByRole("tab", { name: "AI Suggest" }));
    expect(swatchCount()).toBe(2);
  });

  /**
   * A room with nothing marked out yet is not the same as a room told to paint nothing.
   * The first should still see schemes — they are the reason to mark a wall at all.
   */
  it("still shows the classic trio before any wall exists", async () => {
    const user = userEvent.setup();
    renderGrid([]);

    await user.click(screen.getByRole("tab", { name: "AI Suggest" }));
    expect(swatchCount()).toBe(3);
  });

  it("builds nothing, and says why, when every wall has been unticked", async () => {
    const user = userEvent.setup();
    renderGrid([
      wall("a", "MAIN_WALL", "Back wall", { inPlan: false }),
      wall("b", "TRIM", "Skirting", { inPlan: false }),
    ]);

    await user.click(screen.getByRole("tab", { name: "AI Suggest" }));
    expect(document.querySelectorAll(".hv-ai-card")).toHaveLength(0);
    expect(screen.getByText(/None of this room's walls are ticked/)).toBeInTheDocument();
  });
});

describe("Each colour says which wall it is going on", () => {
  it("labels every swatch with the customer's own wall name", async () => {
    const user = userEvent.setup();
    renderGrid([
      wall("a", "MAIN_WALL", "Back wall"),
      wall("b", "ACCENT_WALL", "Chimney breast"),
      wall("c", "TRIM", "Skirting"),
    ]);

    await user.click(screen.getByRole("tab", { name: "AI Suggest" }));
    const card = within(firstCard());
    expect(card.getByText("Back wall")).toBeInTheDocument();
    expect(card.getByText("Chimney breast")).toBeInTheDocument();
    expect(card.getByText("Skirting")).toBeInTheDocument();
  });

  /** Apply all is a zip down the card: colour i onto wall i, and onto nothing else. */
  it("puts one colour on each ticked wall and leaves the rest alone", async () => {
    const user = userEvent.setup();
    const { onApplyToRegion } = renderGrid([
      wall("a", "MAIN_WALL", "Back wall"),
      wall("b", "ACCENT_WALL", "Chimney breast"),
      wall("c", "OTHER_WALL", "Side wall", { inPlan: false }),
    ]);

    await user.click(screen.getByRole("tab", { name: "AI Suggest" }));
    await user.click(within(firstCard()).getByRole("button", { name: "Apply all" }));

    const painted = onApplyToRegion.mock.calls.map(([id]) => id);
    expect(painted).toEqual(["a", "b"]);
    // Two walls, two DIFFERENT colours — never one colour twice.
    const codes = onApplyToRegion.mock.calls.map(([, s]) => s.code);
    expect(new Set(codes).size).toBe(2);
  });
});

describe("Plan walls — the panel", () => {
  it("says how many walls are being painted before it is even opened", () => {
    renderGrid([
      wall("a", "MAIN_WALL", "Back wall"),
      wall("b", "ACCENT_WALL", "Chimney breast"),
      wall("c", "OTHER_WALL", "Side wall", { inPlan: false }),
    ]);

    expect(screen.getByText(/Painting/)).toHaveTextContent(
      "Painting 2 walls of 3 · combinations come in 2 colours",
    );
  });

  it("takes a wall out of the scheme without deleting it", async () => {
    const user = userEvent.setup();
    const { onSetWallInPlan } = renderGrid([
      wall("a", "MAIN_WALL", "Back wall"),
      wall("b", "ACCENT_WALL", "Chimney breast"),
    ]);

    await user.click(screen.getByRole("button", { name: "Plan walls" }));
    await user.click(screen.getByRole("checkbox", { name: /Chimney breast/ }));

    expect(onSetWallInPlan).toHaveBeenCalledWith("b", false);
  });

  it("changes what a wall is in the scheme", async () => {
    const user = userEvent.setup();
    const { onSetWallRole } = renderGrid([
      wall("a", "MAIN_WALL", "Back wall"),
      wall("b", "OTHER_WALL", "Chimney breast"),
    ]);

    await user.click(screen.getByRole("button", { name: "Plan walls" }));
    const rows = screen.getAllByRole("combobox");
    await user.selectOptions(rows[1]!, "ACCENT_WALL");

    expect(onSetWallRole).toHaveBeenCalledWith("b", "ACCENT_WALL");
  });

  /** The order the colours arrive in, written down — "one colour each" without saying
   *  WHICH colour answers half the question. */
  it("spells out the order the colours are handed out in", async () => {
    const user = userEvent.setup();
    renderGrid([
      wall("c", "TRIM", "Skirting"),
      wall("a", "MAIN_WALL", "Back wall"),
      wall("b", "ACCENT_WALL", "Chimney breast"),
    ]);

    await user.click(screen.getByRole("button", { name: "Plan walls" }));
    expect(
      screen.getByText("In order: Back wall → Chimney breast → Skirting."),
    ).toBeInTheDocument();
  });

  it("offers no plan at all on a project whose walls are not the user's to change", () => {
    renderGrid([wall("a", "MAIN_WALL", "Back wall")], {
      onSetWallInPlan: undefined,
      onSetWallRole: undefined,
    });

    expect(screen.queryByRole("button", { name: "Plan walls" })).not.toBeInTheDocument();
  });
});
