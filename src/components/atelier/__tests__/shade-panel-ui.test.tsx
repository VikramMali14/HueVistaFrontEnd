// @vitest-environment jsdom
/**
 * The studio's colour panel, on the three points where its chrome used to get in
 * the way of the work:
 *
 *   - the Catalogue tab opened on a "Top 50" that ranked nothing;
 *   - Room palettes could only be built around a colour already ON a wall, so
 *     browsing cost a decision;
 *   - the Custom tab printed the hex back at a counter that never reads in hex.
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PaintShade } from "@/lib/types";
import { ShadeGrid } from "../shade-grid";

/** Two companies, each spanning the wheel, so palettes have somewhere to go. */
const shade = (
  code: string,
  name: string,
  hex: string,
  family: string,
  lrv: number,
  brand: string,
): PaintShade => ({ code, name, hex, family, lrv, brand, finishes: [] });

const CATALOGUE: PaintShade[] = [
  shade("AP-1", "Blush Zephyr", "#d98c8c", "Reds", 45, "Asian Paints"),
  shade("AP-2", "Sun Zephyr", "#d9c78c", "Yellows", 62, "Asian Paints"),
  shade("AP-3", "Leaf Zephyr", "#8cd98c", "Greens", 58, "Asian Paints"),
  shade("AP-4", "Sky Zephyr", "#8cc7d9", "Blues", 55, "Asian Paints"),
  shade("AP-5", "Plum Zephyr", "#c78cd9", "Purples", 40, "Asian Paints"),
  shade("AP-6", "Chalk Zephyr", "#f4f1ea", "Whites", 88, "Asian Paints"),
  shade("BG-1", "Blush Quartz", "#cf7f7f", "Reds", 42, "Berger"),
  shade("BG-2", "Sun Quartz", "#cfbf7f", "Yellows", 60, "Berger"),
  shade("BG-3", "Leaf Quartz", "#7fcf7f", "Greens", 56, "Berger"),
  shade("BG-4", "Sky Quartz", "#7fbfcf", "Blues", 53, "Berger"),
  shade("BG-5", "Plum Quartz", "#bf7fcf", "Purples", 38, "Berger"),
  shade("BG-6", "Chalk Quartz", "#f2eee6", "Whites", 86, "Berger"),
];

/**
 * The colours the Room-palette cards are currently showing, as a stable string.
 * Reading the SWATCH CODES rather than the card titles is what makes "shuffle
 * gave me something else" testable — the scheme names repeat across rolls, the
 * shades they land on do not.
 */
function paletteFingerprint(): string {
  return screen
    .getAllByRole("button", { name: /^(Main|Accent|Trim):/ })
    .map((b) => b.getAttribute("aria-label"))
    .join("|");
}

const anchorInput = () => screen.getByLabelText("Colour the palettes are built around");

describe("Catalogue tab — grouped by company, full stop", () => {
  it("offers no Top 50 view to switch to", () => {
    render(<ShadeGrid onSelect={vi.fn()} shades={CATALOGUE} />);

    expect(screen.queryByRole("button", { name: "Top 50" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "By company" })).not.toBeInTheDocument();
  });

  it("groups every shade under its company without being asked", () => {
    render(<ShadeGrid onSelect={vi.fn()} shades={CATALOGUE} />);

    // Both company headings, and shades from both, on the tab as it opens.
    expect(screen.getByText("Asian Paints")).toBeInTheDocument();
    expect(screen.getByText("Berger")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Zephyr/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /Quartz/ }).length).toBeGreaterThan(0);
  });

  it("says how much of the catalogue is on screen", () => {
    render(<ShadeGrid onSelect={vi.fn()} shades={CATALOGUE} />);
    expect(screen.getByText("12 colours across 2 companies")).toBeInTheDocument();
  });
});

describe("Room palettes — the colour they are built around", () => {
  it("builds around a colour picked here, with no wall painted at all", async () => {
    const user = userEvent.setup();
    render(<ShadeGrid onSelect={vi.fn()} shades={CATALOGUE} />);
    await user.click(screen.getByRole("tab", { name: "AI Suggest" }));

    const before = paletteFingerprint();
    expect(before).not.toBe("");

    fireEvent.change(anchorInput(), { target: { value: "#2244cc" } });

    await waitFor(() => expect(paletteFingerprint()).not.toBe(before));
    expect(screen.getByText(/the colour you picked/)).toBeInTheDocument();
  });

  it("shuffles around the picked colour, not the one on the wall", async () => {
    const user = userEvent.setup();
    render(
      <ShadeGrid onSelect={vi.fn()} shades={CATALOGUE} baseHex="#d98c8c" />,
    );
    await user.click(screen.getByRole("tab", { name: "AI Suggest" }));

    fireEvent.change(anchorInput(), { target: { value: "#2244cc" } });
    await waitFor(() => expect(screen.getByText(/the colour you picked/)).toBeInTheDocument());

    // Shuffling re-rolls; the anchor it re-rolls around is the picked one, which
    // is why the swatch still reads it back after the roll.
    const beforeShuffle = paletteFingerprint();
    await user.click(screen.getByRole("button", { name: /Shuffle/ }));
    await waitFor(() => expect(paletteFingerprint()).not.toBe(beforeShuffle));
    expect(anchorInput()).toHaveValue("#2244cc");
    expect(screen.getByText(/the colour you picked/)).toBeInTheDocument();
  });

  it("offers the way back to the wall colour once you have wandered off it", async () => {
    const user = userEvent.setup();
    render(
      <ShadeGrid onSelect={vi.fn()} shades={CATALOGUE} baseHex="#d98c8c" />,
    );
    await user.click(screen.getByRole("tab", { name: "AI Suggest" }));

    // Following the wall: nothing to go back to.
    expect(screen.queryByRole("button", { name: /Back to the colour on your wall/ })).not.toBeInTheDocument();

    fireEvent.change(anchorInput(), { target: { value: "#2244cc" } });
    const back = await screen.findByRole("button", { name: /Back to the colour on your wall/ });

    await user.click(back);
    await waitFor(() => expect(anchorInput()).toHaveValue("#d98c8c"));
    expect(screen.getByText(/the colour on your wall/)).toBeInTheDocument();
  });

  it("seeds the swatch from the wall colour when there is one", async () => {
    const user = userEvent.setup();
    render(<ShadeGrid onSelect={vi.fn()} shades={CATALOGUE} baseHex="#8cc7d9" />);
    await user.click(screen.getByRole("tab", { name: "AI Suggest" }));

    expect(anchorInput()).toHaveValue("#8cc7d9");
  });
});

describe("Palette card actions", () => {
  it("keeps Apply all and Add to PDF as two separate presses", async () => {
    const user = userEvent.setup();
    const onAddComboToPdf = vi.fn();
    render(
      <ShadeGrid
        onSelect={vi.fn()}
        shades={CATALOGUE}
        baseHex="#d98c8c"
        onAddComboToPdf={onAddComboToPdf}
      />,
    );
    await user.click(screen.getByRole("tab", { name: "AI Suggest" }));

    const card = screen.getAllByRole("button", { name: "Apply all" })[0]!.closest(".hv-ai-card")!;
    const actions = within(card as HTMLElement);
    expect(actions.getByRole("button", { name: "Apply all" })).toBeInTheDocument();
    expect(actions.getByRole("button", { name: "Add to PDF" })).toBeInTheDocument();
  });
});

describe("Custom colour — gone", () => {
  /**
   * The panel used to carry a third tab: a colour wheel that applied any hex exactly.
   *
   * It is removed because the product's output is a colour BOARD — a sheet of codes
   * somebody carries to a counter and buys paint against. A hand-picked hex has no code,
   * so it printed as "Custom colour" with a swatch and nothing to order, and on the wall
   * it was a promise the shop could not keep: the mixing machine works from the
   * catalogue, not from a screen.
   *
   * Asserted rather than merely deleted, because the failure mode of removing a tab is
   * leaving a way back to it — a "Find similar" button, a deep link, a keyboard path —
   * and every one of those lands the user on a panel that no longer exists.
   */
  it("offers only the two tabs that end in a buyable shade", () => {
    render(<ShadeGrid onSelect={vi.fn()} shades={CATALOGUE} />);

    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Colours",
      "AI Suggest",
    ]);
    expect(screen.queryByRole("tab", { name: "Custom" })).not.toBeInTheDocument();
  });

  it("leaves no route back to the picker from a selected shade", () => {
    render(<ShadeGrid onSelect={vi.fn()} shades={CATALOGUE} activeShade={CATALOGUE[0]} />);

    expect(screen.queryByRole("button", { name: "Find similar" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Pick a colour")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Colour code")).not.toBeInTheDocument();
  });
});
