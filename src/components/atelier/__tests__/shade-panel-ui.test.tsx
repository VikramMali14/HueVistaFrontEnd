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

describe("Custom tab — no hex on screen", () => {
  it("drops the hex field entirely", async () => {
    const user = userEvent.setup();
    render(<ShadeGrid onSelect={vi.fn()} shades={CATALOGUE} onApplyExact={vi.fn()} />);
    await user.click(screen.getByRole("tab", { name: "Custom" }));

    expect(screen.queryByLabelText("Hex colour")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/#/)).not.toBeInTheDocument();
  });

  it("prints no hex code anywhere the user can read it", async () => {
    const user = userEvent.setup();
    render(<ShadeGrid onSelect={vi.fn()} shades={CATALOGUE} onApplyExact={vi.fn()} />);
    await user.click(screen.getByRole("tab", { name: "Custom" }));

    // Text content only: the colour swatch's own value attribute is how the
    // native picker works and is not something the user reads off the panel.
    const panel = document.querySelector(".hv-studio-scroll")!;
    expect(panel.textContent ?? "").not.toMatch(/#[0-9a-fA-F]{6}/);
  });

  it("still applies the picked colour exactly", async () => {
    const user = userEvent.setup();
    const onApplyExact = vi.fn();
    render(<ShadeGrid onSelect={vi.fn()} shades={CATALOGUE} onApplyExact={onApplyExact} />);
    await user.click(screen.getByRole("tab", { name: "Custom" }));

    fireEvent.change(screen.getByLabelText("Pick a colour"), { target: { value: "#2244cc" } });
    await user.click(screen.getByRole("button", { name: /Use this exact colour/ }));

    expect(onApplyExact).toHaveBeenCalledWith("#2244cc");
  });
});

/**
 * The way back in for the one customer a month who arrives with a code from a
 * brand sheet or an architect's note. Folded away, because the panel is built for
 * a counter where colours get pointed at — but reachable, because without it that
 * colour cannot be entered at all.
 */
describe("Custom tab — entering a code by hand", () => {
  const openCustom = async (user: ReturnType<typeof userEvent.setup>) => {
    render(<ShadeGrid onSelect={vi.fn()} shades={CATALOGUE} onApplyExact={vi.fn()} />);
    await user.click(screen.getByRole("tab", { name: "Custom" }));
  };

  it("keeps the field folded away until asked for", async () => {
    const user = userEvent.setup();
    await openCustom(user);

    expect(screen.queryByLabelText("Colour code")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enter a code" })).toBeInTheDocument();
  });

  it("opens the field, focused, when asked", async () => {
    const user = userEvent.setup();
    await openCustom(user);

    await user.click(screen.getByRole("button", { name: "Enter a code" }));

    const field = screen.getByLabelText("Colour code");
    expect(field).toBeInTheDocument();
    expect(field).toHaveFocus();
  });

  it("drives the colour from a typed code, with or without the hash", async () => {
    const user = userEvent.setup();
    const onApplyExact = vi.fn();
    render(<ShadeGrid onSelect={vi.fn()} shades={CATALOGUE} onApplyExact={onApplyExact} />);
    await user.click(screen.getByRole("tab", { name: "Custom" }));
    await user.click(screen.getByRole("button", { name: "Enter a code" }));

    const field = screen.getByLabelText("Colour code");
    await user.clear(field);
    await user.type(field, "A47148");

    // The swatch follows the code…
    expect(screen.getByLabelText("Pick a colour")).toHaveValue("#a47148");
    // …and applying uses it.
    await user.click(screen.getByRole("button", { name: /Use this exact colour/ }));
    expect(onApplyExact).toHaveBeenCalledWith("#A47148");
  });

  it("says what a code looks like only once something unusable is typed", async () => {
    const user = userEvent.setup();
    await openCustom(user);
    await user.click(screen.getByRole("button", { name: "Enter a code" }));

    const field = screen.getByLabelText("Colour code");
    await user.clear(field);
    // An empty field is a field just opened, not a mistake.
    expect(screen.queryByText(/Six digits or letters/)).not.toBeInTheDocument();

    await user.type(field, "zzz");
    expect(screen.getByText(/Six digits or letters/)).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");
  });

  it("folds away again, leaving no hex on screen", async () => {
    const user = userEvent.setup();
    await openCustom(user);
    await user.click(screen.getByRole("button", { name: "Enter a code" }));
    await user.click(screen.getByRole("button", { name: "Close the code field" }));

    expect(screen.queryByLabelText("Colour code")).not.toBeInTheDocument();
    const panel = document.querySelector(".hv-studio-scroll")!;
    expect(panel.textContent ?? "").not.toMatch(/#[0-9a-fA-F]{6}/);
  });
});
