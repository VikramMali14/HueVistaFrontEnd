// @vitest-environment jsdom
/**
 * A customer walks in holding a code from a company this shop does not sell.
 *
 * Before this, the studio's search answered that with "No shades match" — a true
 * statement about the catalogue on screen and no use at all to the person holding
 * the code. The panel is handed the whole catalogue for search alone, so it can read
 * the code and answer in the companies it IS showing.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PaintShade } from "@/lib/types";
import { ShadeGrid } from "../shade-grid";

const shade = (
  code: string,
  name: string,
  hex: string,
  brand: string,
  hvCode?: string,
): PaintShade => ({ code, name, hex, brand, family: "Neutrals", lrv: 70, finishes: [], hvCode });

const ASIAN = shade("L124", "Ivory Mist", "#f3ece1", "Asian Paints", "HV0348");
const HUEVISTA = [
  shade("H101", "Ivory White", "#f3ece1", "HueVista"),
  shade("H900", "Deep Ink", "#101820", "HueVista"),
];
const ALL = [ASIAN, ...HUEVISTA];

const renderPanel = (props: Partial<React.ComponentProps<typeof ShadeGrid>> = {}) => {
  const onSelect = vi.fn();
  render(<ShadeGrid onSelect={onSelect} shades={HUEVISTA} allShades={ALL} {...props} />);
  return { onSelect };
};

const search = () => screen.getByLabelText(/Search by name, or a code from any company/i);

describe("searching another company's code in the studio", () => {
  it("answers with the nearest shade in the companies on screen", async () => {
    renderPanel();
    await userEvent.type(search(), "L124");

    // The band names what was typed, and answers with the shop's own shade.
    expect(await screen.findByText(/Similar to Asian Paints L124/i)).toBeInTheDocument();
    const match = screen.getByRole("button", { name: /Apply Ivory White, code H101, HueVista/i });
    // Identical colours, so it must say so outright rather than hedging.
    expect(match).toHaveAccessibleName(/the same colour to Asian Paints L124/i);
  });

  it("paints the wall from the band, not just reports the lookup", async () => {
    const { onSelect } = renderPanel();
    await userEvent.type(search(), "L124");
    await userEvent.click(await screen.findByRole("button", { name: /Apply Ivory White/i }));
    expect(onSelect).toHaveBeenCalledWith(HUEVISTA[0]);
  });

  it("reads the HueVista code off the customer's own board too", async () => {
    renderPanel();
    await userEvent.type(search(), "HV0348");
    // Echoed as the HV code they typed — not translated into the manufacturer's.
    expect(await screen.findByText(/Similar to HV0348/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Apply Ivory White/i })).toBeInTheDocument();
  });

  it("does not tell a customer which company a shade belongs to", async () => {
    renderPanel({ showBrands: false });
    await userEvent.type(search(), "L124");
    expect(await screen.findByText(/Similar to L124/i)).toBeInTheDocument();
    // The band is the one place that could re-attribute the shades the grid
    // deliberately leaves unattributed.
    expect(screen.queryByText(/HueVista/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Asian Paints/)).not.toBeInTheDocument();
  });

  it("asks which company rather than guessing when a code is shared", async () => {
    const nerolac = shade("L124", "Sea Foam", "#cfe3dd", "Nerolac");
    renderPanel({ allShades: [...ALL, nerolac] });
    await userEvent.type(search(), "L124");

    expect(await screen.findByText(/More than one company uses/i)).toBeInTheDocument();
    // Naming one would quote a real shade from the wrong company.
    expect(screen.queryByText(/Similar to/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Nerolac" }));
    // Answered from Nerolac's colour, so the near miss is scored against the sea
    // green — not against the ivory that happened to sort first.
    expect(await screen.findByText(/Similar to Nerolac L124/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Apply Ivory White/i })).toHaveAccessibleName(
      /not exact to Nerolac L124/i,
    );
  });

  it("reads a code from a company the shop was never given", async () => {
    // The ordinary shop: set up for HueVista alone, so its own catalogue holds no
    // Asian Paints at all and cannot read the card the customer walked in with.
    const onLookupCode = vi.fn().mockResolvedValue([ASIAN]);
    const onSelect = vi.fn();
    render(
      <ShadeGrid
        onSelect={onSelect}
        shades={HUEVISTA}
        allShades={HUEVISTA}
        onLookupCode={onLookupCode}
      />,
    );
    await userEvent.type(search(), "L124");

    expect(await screen.findByText(/Similar to Asian Paints L124/i)).toBeInTheDocument();
    expect(onLookupCode).toHaveBeenCalledWith("L124");
    // What comes back is used for its colour only — the offer is still the shop's own.
    await userEvent.click(screen.getByRole("button", { name: /Apply Ivory White/i }));
    expect(onSelect).toHaveBeenCalledWith(HUEVISTA[0]);
  });

  it("does not go to the network for something the catalogue already answers", async () => {
    const onLookupCode = vi.fn().mockResolvedValue([]);
    render(
      <ShadeGrid onSelect={vi.fn()} shades={HUEVISTA} allShades={ALL} onLookupCode={onLookupCode} />,
    );
    // A code the local catalogue reads, and a name — neither is a code lookup.
    await userEvent.type(search(), "L124");
    expect(await screen.findByText(/Similar to Asian Paints L124/i)).toBeInTheDocument();
    await userEvent.clear(search());
    await userEvent.type(search(), "ivory mist");
    await new Promise((r) => setTimeout(r, 600));
    expect(onLookupCode).not.toHaveBeenCalled();
  });

  it("keeps browsing usable when the lookup fails", async () => {
    const onLookupCode = vi.fn().mockRejectedValue(new Error("offline"));
    render(
      <ShadeGrid
        onSelect={vi.fn()}
        shades={HUEVISTA}
        allShades={HUEVISTA}
        onLookupCode={onLookupCode}
      />,
    );
    await userEvent.type(search(), "L124");
    await new Promise((r) => setTimeout(r, 600));
    // No band, no error shouted at someone who is only browsing — just the
    // ordinary empty result for a code this catalogue does not carry.
    expect(screen.queryByText(/Similar to/i)).not.toBeInTheDocument();
    expect(screen.getByText(/No shades match/i)).toBeInTheDocument();
  });

  it("stays out of the way when the grid is already the answer", async () => {
    renderPanel();
    await userEvent.type(search(), "Ivory");
    expect(screen.queryByText(/Similar to/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ivory White, code H101/i })).toBeInTheDocument();
  });
});
