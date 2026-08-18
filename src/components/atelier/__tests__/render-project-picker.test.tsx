// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { RenderableProject } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  api: { listRenderableProjects: vi.fn() },
}));

import { RenderProjectPicker } from "../render-project-picker";
import { api as realApi } from "@/lib/api";

const api = vi.mocked(realApi);

const ROOM: RenderableProject = {
  id: "p1",
  name: "Front bedroom",
  roomType: "BEDROOM",
  imageUrl: "https://cdn.test/original.jpg",
  cleanedImageUrl: "https://cdn.test/cleaned.jpg",
  closedAt: "2026-08-01T10:00:00",
  comboCount: 3,
};

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * The screen that answers "which room?" instead of asking it.
 *
 * `/render` with no room named used to be a dead end pointing back at the dashboard. What
 * is asserted here is the choice itself: the rooms the server offers, and — the detail
 * that is easy to get wrong — that a card shows the CLEANED photograph, because that is
 * what the image will be painted from unless the next screen is told otherwise.
 */
describe("RenderProjectPicker", () => {
  it("lists the finished rooms the server offers, with their combination counts", async () => {
    api.listRenderableProjects.mockResolvedValue([
      ROOM,
      { ...ROOM, id: "p2", name: "Stairwell", comboCount: 1 },
    ]);

    render(<RenderProjectPicker />);

    expect(await screen.findByText("Front bedroom")).toBeInTheDocument();
    expect(screen.getByText("Stairwell")).toBeInTheDocument();
    expect(screen.getByText(/3 combinations/)).toBeInTheDocument();
    // Singular, because "1 combinations" on the one screen whose job is to be picked from
    // is the kind of thing people notice.
    expect(screen.getByText(/1 combination ·/)).toBeInTheDocument();
  });

  it("links each room into its own render studio", async () => {
    api.listRenderableProjects.mockResolvedValue([ROOM]);

    render(<RenderProjectPicker />);

    expect(await screen.findByRole("link", { name: /Front bedroom/ }))
      .toHaveAttribute("href", "/render?project=p1");
  });

  /**
   * The thumbnail has to be the picture the image will actually be made from, or the room
   * somebody picked is not the room they get.
   */
  it("shows the cleaned photograph, and falls back to the original when there is none", async () => {
    api.listRenderableProjects.mockResolvedValue([
      ROOM,
      { ...ROOM, id: "p2", name: "Uncleaned", cleanedImageUrl: null },
    ]);

    render(<RenderProjectPicker />);

    await screen.findByText("Front bedroom");
    const images = screen.getAllByRole("presentation", { hidden: true }) as HTMLImageElement[];
    expect(images.map((i) => i.getAttribute("src"))).toEqual([
      "https://cdn.test/cleaned.jpg",
      "https://cdn.test/original.jpg",
    ]);
  });

  it("sends somebody with nothing finished to the studio rather than nowhere", async () => {
    api.listRenderableProjects.mockResolvedValue([]);

    render(<RenderProjectPicker />);

    expect(await screen.findByText(/Nothing finished yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Go to my rooms/ }))
      .toHaveAttribute("href", "/dashboard");
  });

  it("reports a failure rather than showing an empty shelf as if it were the truth", async () => {
    api.listRenderableProjects.mockRejectedValue(new Error("Network is down."));

    render(<RenderProjectPicker />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/Network is down/);
  });
});
