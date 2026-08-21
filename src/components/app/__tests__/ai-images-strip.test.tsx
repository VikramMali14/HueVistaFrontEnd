// @vitest-environment jsdom
/**
 * The strip of recent pictures at the foot of Projects & credits.
 *
 * It shows up to four. Three in a four-column shelf left a quarter of the row empty,
 * which reads as a picture that failed to load rather than as a shelf with room on it —
 * so the space carries the one thing somebody looking at their pictures wants next.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { MyRender } from "@/lib/types";

vi.mock("@/lib/api", () => ({ api: { listMyRenders: vi.fn() } }));

import { AiImagesStrip } from "../ai-images-strip";
import { api as realApi } from "@/lib/api";

const api = vi.mocked(realApi);

function image(id: string, projectName: string): MyRender {
  return {
    id,
    projectId: `prj-${id}`,
    projectName,
    status: "READY",
    imageUrl: `/renders/${id}.png`,
    timeOfDay: "DAY",
    borderMode: "KEEP_ORIGINAL",
    lighting: "NATURAL",
    furnishing: "KEEP",
    style: "MODERN",
    shades: [],
    createdAt: "2026-06-20T10:00:00+05:30",
  };
}

beforeEach(() => vi.clearAllMocks());

describe("AiImagesStrip", () => {
  it("fills the spare slot with the way to make another", async () => {
    api.listMyRenders.mockResolvedValue([image("a", "Hall"), image("b", "Bedroom")]);
    render(<AiImagesStrip />);

    const more = await screen.findByRole("link", { name: "Make another AI image" });
    expect(more).toHaveAttribute("href", "/render");
    // Priced where it is offered: an image is bought with a credit, and a tile that only
    // said "make another" would be inviting a click into a payment nobody was warned of.
    expect(screen.getByText("1 credit")).toBeInTheDocument();
  });

  it("gives the row up to the pictures once it is full", async () => {
    // Four is the whole shelf. Pushing a fifth tile in would drop a real picture for a
    // link that is already one line below in "See all".
    api.listMyRenders.mockResolvedValue(
      ["a", "b", "c", "d", "e"].map((id, i) => image(id, `Room ${i + 1}`)),
    );
    render(<AiImagesStrip />);

    await screen.findByText("Room 1");
    expect(screen.queryByRole("link", { name: "Make another AI image" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /See all 5/ })).toBeInTheDocument();
  });

  it("shows nothing at all to an account that has made none", async () => {
    // The page already has an empty state above this one; a second would be two ways of
    // saying the same nothing.
    api.listMyRenders.mockResolvedValue([]);
    const { container } = render(<AiImagesStrip />);

    await waitFor(() => expect(api.listMyRenders).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
