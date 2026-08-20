// @vitest-environment jsdom
/**
 * The shelf a customer opens to find the picture they paid for.
 *
 * These cases are about the four things that were wrong for the person using it, not
 * about the data — the data was always right. Saving a file that did not save, a
 * presigned link that had quietly expired behind a blank frame, shade codes that could
 * only be copied by retyping them, and a shelf with no way to find anything in it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MyRender } from "@/lib/types";
import { AiImages } from "../ai-images";
import { api } from "@/lib/api";
import { downloadRemoteImage } from "@/lib/download-image";

vi.mock("@/lib/api", () => ({
  api: { listMyRenders: vi.fn(), getMyShadeCodeScheme: vi.fn() },
}));
vi.mock("@/lib/download-image", () => ({ downloadRemoteImage: vi.fn() }));

function makeRender(overrides: Partial<MyRender> = {}): MyRender {
  return {
    id: "r-1",
    projectId: "p-1",
    projectName: "Sunlit living room",
    status: "READY",
    imageUrl: "/render-1.png",
    comboTitle: "Calm",
    timeOfDay: "DAY",
    borderMode: "KEEP_ORIGINAL",
    lighting: "NATURAL",
    furnishing: "KEEP",
    style: "MODERN",
    completedAt: "2026-08-20T10:00:00Z",
    shades: [
      { regionLabel: "Walls", shadeName: "Ivory Mist", shadeCode: "7112", hex: "#efe7d8" },
    ],
    ...overrides,
  } as MyRender;
}

const BEDROOM = makeRender({
  id: "r-2",
  projectId: "p-2",
  projectName: "Corner bedroom",
  imageUrl: "/render-2.png",
  shades: [{ regionLabel: "Walls", shadeName: "Deep Teal", shadeCode: "4021", hex: "#1f5a56" }],
});

/** Mount with a given shelf and wait for the load to land. */
async function shelf(list: MyRender[]) {
  vi.mocked(api.listMyRenders).mockResolvedValue(list);
  vi.mocked(api.getMyShadeCodeScheme).mockRejectedValue(new Error("no shop"));
  const view = render(<AiImages />);
  await waitFor(() => expect(screen.queryByText("Finding your images…")).not.toBeInTheDocument());
  return view;
}

const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(downloadRemoteImage).mockResolvedValue(true);
  Object.defineProperty(navigator, "clipboard", { value: clipboard, configurable: true });
});

describe("AiImages", () => {
  it("opens on the newest picture with its colours beside it", async () => {
    await shelf([makeRender(), BEDROOM]);

    expect(screen.getByRole("heading", { name: "Sunlit living room" })).toBeInTheDocument();
    expect(screen.getByText("Ivory Mist")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sunlit living room/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("saves the picture as a file named after the room", async () => {
    await shelf([makeRender()]);

    await userEvent.click(screen.getByRole("button", { name: "Download the image" }));

    // The old button was an anchor with `download` on a cross-origin href, which
    // browsers ignore: it navigated to a bare JPEG instead of saving anything.
    await waitFor(() =>
      expect(downloadRemoteImage).toHaveBeenCalledWith(
        "/render-1.png",
        "huevista-ai-image-sunlit-living-room-20260820",
      ),
    );
  });

  it("explains itself, rather than doing nothing, when the file cannot be saved", async () => {
    vi.mocked(downloadRemoteImage).mockResolvedValue(false);
    const open = vi.fn();
    vi.stubGlobal("open", open);
    await shelf([makeRender()]);

    await userEvent.click(screen.getByRole("button", { name: "Download the image" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/opened in a new tab/));
    expect(open).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("names the expiry, and offers the refresh, when an image stops loading", async () => {
    await shelf([makeRender()]);
    const stage = screen.getByAltText("Sunlit living room, rendered");

    // A presigned URL lasts about an hour; past that this is all the browser reports.
    stage.dispatchEvent(new Event("error"));

    const message = await screen.findByText(/re-issued every hour/);
    expect(message).toBeInTheDocument();
    // And the refresh actually re-signs them, rather than telling the reader to reload.
    await userEvent.click(screen.getByRole("button", { name: "Refresh my images" }));
    await waitFor(() => expect(api.listMyRenders).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(/re-issued every hour/)).not.toBeInTheDocument());
  });

  it("copies a shade the way it would be written to a painter", async () => {
    await shelf([makeRender()]);

    await userEvent.click(screen.getByRole("button", { name: /Copy Walls/ }));

    expect(clipboard.writeText).toHaveBeenCalledWith("Walls — Ivory Mist · Shade No. 7112");
    expect(await screen.findByText("Copied ✓")).toBeInTheDocument();
  });

  it("copies the whole table under the room's name", async () => {
    await shelf([makeRender()]);

    await userEvent.click(screen.getByRole("button", { name: "Copy all" }));

    expect(clipboard.writeText).toHaveBeenCalledWith(
      "Sunlit living room — colours\n• Walls — Ivory Mist · Shade No. 7112",
    );
  });

  it("searches by colour, not only by room name, and moves the open picture with it", async () => {
    // Six is the point at which the search box appears — below that the strip is the
    // index and a search box over four pictures is furniture.
    const many = [
      makeRender(),
      BEDROOM,
      ...Array.from({ length: 4 }, (_, i) =>
        makeRender({ id: `r-${i + 3}`, projectId: `p-${i + 3}`, projectName: `Room ${i + 3}` }),
      ),
    ];
    await shelf(many);

    await userEvent.type(screen.getByLabelText("Search your AI images"), "teal");

    const group = screen.getByRole("group", { name: "Your AI images" });
    expect(within(group).getAllByRole("button")).toHaveLength(1);
    // The detail pane must not be left showing a picture the shelf no longer lists.
    expect(screen.getByRole("heading", { name: "Corner bedroom" })).toBeInTheDocument();
  });

  it("offers a way back when a search matches nothing", async () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      makeRender({ id: `r-${i}`, projectId: `p-${i}`, projectName: `Room ${i}` }),
    );
    await shelf(many);

    await userEvent.type(screen.getByLabelText("Search your AI images"), "zzzz");

    await userEvent.click(screen.getByRole("button", { name: "Show all 6 images" }));
    expect(within(screen.getByRole("group", { name: "Your AI images" })).getAllByRole("button"))
      .toHaveLength(6);
  });

  it("keeps the empty state for an account that has made none", async () => {
    await shelf([]);

    expect(screen.getByText("No AI images yet.")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Your AI images" })).not.toBeInTheDocument();
  });
});
