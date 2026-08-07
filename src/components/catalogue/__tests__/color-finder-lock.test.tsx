// @vitest-environment jsdom
/**
 * The colour finder on a plan that doesn't include it.
 *
 * The page used to vanish for exactly the shops who had never seen the tool — a
 * free counter was told "not included" on a dashboard and left to imagine the
 * rest. It opens locked instead: the real chrome, an honest badge, and the
 * subscription case made at the moment they reach for it. Nothing is matched and
 * no photo is read while it is locked; the backend refuses the same work, so this
 * is the courteous half of a rule enforced elsewhere.
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PaintShade } from "@/lib/types";
import { ColorFinder } from "../color-finder";

vi.mock("@/components/shared/phone-handoff", () => ({
  PhoneHandoff: () => <div data-testid="phone-handoff" />,
}));

const SHADES: PaintShade[] = [
  { code: "AP-1", name: "Blush Zephyr", hex: "#d98c8c", family: "Reds", lrv: 45, brand: "Asian Paints", finishes: [] },
  { code: "AP-2", name: "Sun Zephyr", hex: "#d9c78c", family: "Yellows", lrv: 62, brand: "Asian Paints", finishes: [] },
];

const dropZone = () =>
  screen.getByRole("button", { name: /Colour matching is on the paid plans|Choose or drop a photograph/ });

describe("Colour finder — locked by the shop's plan", () => {
  it("shows the tool rather than hiding it, and says it is shut", () => {
    render(<ColorFinder shades={SHADES} locked />);

    // The page still explains what the tool does — that is the whole point of
    // showing it to a shop that has never had it.
    expect(screen.getByText(/click anywhere on it to sample a colour/)).toBeInTheDocument();
    expect(screen.getByText("On the paid plans")).toBeInTheDocument();
    expect(screen.getByText("Colour matching is on the paid plans")).toBeInTheDocument();
  });

  it("holds the pitch back until they reach for it", () => {
    render(<ColorFinder shades={SHADES} locked />);
    // Arriving to read the page is not asking to be sold to.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("pitches the subscription when the drop zone is pressed", async () => {
    const user = userEvent.setup();
    render(<ColorFinder shades={SHADES} locked />);

    await user.click(dropZone());

    const pitch = screen.getByRole("status");
    expect(pitch).toHaveTextContent("Colour matching is on the paid plans");
    expect(screen.getByRole("link", { name: /Choose a plan/ })).toHaveAttribute("href", "/plan");
    expect(screen.getByRole("link", { name: /Compare the plans/ })).toHaveAttribute("href", "/pricing");
  });

  it("pitches on a dropped photograph too, and reads nothing", async () => {
    render(<ColorFinder shades={SHADES} locked />);
    const file = new File(["x"], "room.png", { type: "image/png" });

    fireEvent.drop(dropZone(), { dataTransfer: { files: [file] } });

    expect(screen.getByRole("status")).toBeInTheDocument();
    // No canvas mounted means no photo was decoded or sampled.
    expect(document.querySelector("canvas")).toBeNull();
  });

  it("keeps the free plan's own case in the pitch, not just the upsell", async () => {
    const user = userEvent.setup();
    render(<ColorFinder shades={SHADES} locked />);
    await user.click(dropZone());

    expect(screen.getByRole("status")).toHaveTextContent(/Your free plan keeps everything else/);
  });

  it("lets the pitch be waved away", async () => {
    const user = userEvent.setup();
    render(<ColorFinder shades={SHADES} locked />);
    await user.click(dropZone());

    await user.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does not offer the phone hand-off, which would only fail later", () => {
    render(<ColorFinder shades={SHADES} locked />);
    expect(screen.queryByTestId("phone-handoff")).not.toBeInTheDocument();
  });
});

describe("Colour finder — unlocked", () => {
  it("carries no lock, no badge and no pitch", () => {
    render(<ColorFinder shades={SHADES} />);

    expect(screen.queryByText("On the paid plans")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText("Drop a photograph here")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose or drop a photograph" })).toBeInTheDocument();
  });
});
