// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GalleryGrid, type Plate } from "../gallery-grid";
import { startGalleryRoomAction } from "@/lib/free-projects";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/free-projects", () => ({ startGalleryRoomAction: vi.fn() }));

/** A real published room — the kind that can be opened and painted. */
function room(overrides: Partial<Plate> = {}): Plate {
  return {
    slug: "spice-market",
    num: "01",
    category: "Living room",
    title: "The Spice Market",
    code: "AP-1001",
    swatch: "#D9C7AE",
    location: "Living room",
    date: "Apr 2026",
    tag: "Interior",
    tone: "slate",
    aspect: "4 / 3",
    imageUrl: "https://cdn.example.com/spice-market.jpg",
    startable: true,
    ...overrides,
  };
}

/** An invented editorial plate: a gradient with a /work link and no room behind it. */
function editorial(overrides: Partial<Plate> = {}): Plate {
  return room({ slug: "linen-bedroom", startable: false, href: "/work/linen-bedroom", ...overrides });
}

/** What the backend hands back once the copy exists. */
const STARTED = {
  started: {
    projectId: "proj-9",
    name: "The Spice Market",
    status: "SEGMENTED",
    regionCount: 3,
    templateId: "tpl-1",
    templateTitle: "The Spice Market",
  },
};

describe("GalleryGrid — painting a room", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, "", "/gallery");
  });

  /**
   * The gallery was readable and unusable: published rooms rendered as pictures
   * with nothing to click, because starting a copy was an admin-only endpoint.
   */
  it("offers a published room to be painted, and hands the copy to the studio", async () => {
    vi.mocked(startGalleryRoomAction).mockResolvedValue(STARTED);

    render(<GalleryGrid plates={[room()]} />);
    await userEvent.click(screen.getByRole("button", { name: /paint living room yourself/i }));

    await waitFor(() => expect(startGalleryRoomAction).toHaveBeenCalledWith("spice-market"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/studio?project=proj-9"));
  });

  /** The built-in plates are invented material — there is no room to copy. */
  it("does not offer the editorial placeholder plates", () => {
    render(<GalleryGrid plates={[editorial()]} />);
    expect(screen.queryByRole("button", { name: /paint/i })).toBeNull();
  });

  /**
   * A signed-out visitor is the ordinary case on a marketing page. The click must
   * survive the round trip through /sign-in rather than being dropped.
   */
  it("sends a signed-out visitor to sign in, carrying the room they clicked", async () => {
    vi.mocked(startGalleryRoomAction).mockResolvedValue({ signInRequired: true });

    render(<GalleryGrid plates={[room()]} />);
    await userEvent.click(screen.getByRole("button", { name: /paint/i }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        `/sign-in?next=${encodeURIComponent("/gallery?paint=spice-market")}`,
      ),
    );
  });

  /** …and coming back finishes the job without a second click. */
  it("resumes the room named in ?paint= after sign-in, then drops the parameter", async () => {
    vi.mocked(startGalleryRoomAction).mockResolvedValue(STARTED);
    window.history.replaceState(null, "", "/gallery?paint=spice-market");

    render(<GalleryGrid plates={[room()]} />);

    await waitFor(() => expect(startGalleryRoomAction).toHaveBeenCalledWith("spice-market"));
    // Dropped, so a refresh does not silently open a second copy of the same room.
    expect(window.location.search).toBe("");
  });

  /** A slug nothing on the shelf matches must not fire a request. */
  it("ignores a ?paint= slug that is not on the shelf", async () => {
    window.history.replaceState(null, "", "/gallery?paint=no-such-room");

    render(<GalleryGrid plates={[room()]} />);

    await waitFor(() => expect(window.location.search).toBe(""));
    expect(startGalleryRoomAction).not.toHaveBeenCalled();
  });

  it("shows the reason when a room cannot be opened", async () => {
    vi.mocked(startGalleryRoomAction).mockResolvedValue({
      error: "That room is no longer in the gallery.",
    });

    render(<GalleryGrid plates={[room()]} />);
    await userEvent.click(screen.getByRole("button", { name: /paint/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/no longer in the gallery/i);
    expect(push).not.toHaveBeenCalled();
  });
});
