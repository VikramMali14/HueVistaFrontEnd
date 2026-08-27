// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AdminProjectRow, PaintShade, ProjectDetail } from "@/lib/types";
import { StudioTest } from "../studio-test";

/**
 * The bench's decisions, not its pixels. jsdom implements no canvas, so every
 * assertion below is about what the screen DECIDES — which rooms it will open, what
 * it says about a room with no cleaned canvas, which knobs are off the studio's
 * defaults — rather than about the frame that comes out. The shading maths belongs to
 * the engines and is tested with them.
 */

vi.mock("@/lib/load-image", () => ({
  loadCrossOriginImage: (url: string) => {
    const img = { naturalWidth: 1200, naturalHeight: 800, src: url };
    return Promise.resolve(img as unknown as HTMLImageElement);
  },
}));

// Both engines reach for a real GL/2D context on construction. Neither exists here,
// and neither is what these tests are about.
vi.mock("@/lib/webgl-recolor", async () => {
  const actual = await vi.importActual<typeof import("@/lib/webgl-recolor")>("@/lib/webgl-recolor");
  return {
    ...actual,
    Recolor: class {
      canvas = {} as HTMLCanvasElement;
      setImage() {}
      renderRegions() {}
      renderBase() {}
      setEdgeOffset() {}
      setMaskFeather() {}
      setBrightness() {}
      exportPng() { return ""; }
      dispose() {}
    },
    regionMeanLuma: () => 0.5,
  };
});

function row(overrides: Partial<AdminProjectRow> = {}): AdminProjectRow {
  return {
    id: "proj-1",
    name: "Front bedroom",
    status: "SEGMENTED",
    maskMode: "AUTO",
    regionCount: 2,
    hasCleanedImage: true,
    updatedAt: "2026-08-11T09:00:00",
    ownerName: "Asha Rao",
    ownerEmail: "asha@example.com",
    ownerRole: "CUSTOMER",
    ...overrides,
  };
}

function detail(overrides: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    id: "proj-1",
    name: "Front bedroom",
    status: "SEGMENTED",
    imageId: "img-1",
    imageUrl: "/media/original.png",
    cleanedImageUrl: "/media/cleaned.png",
    regions: [
      { id: 1, label: "Main wall", category: "MAIN_WALL", maskUrl: "/media/m1.png" },
      { id: 2, label: "Trim", category: "TRIM", maskUrl: "/media/m2.png" },
    ],
    ...overrides,
  } as ProjectDetail;
}

const SHADES: PaintShade[] = [
  { code: "AP-101", name: "Morning Linen", hex: "#E8DFD0", family: "Off Whites", lrv: 74, brand: "Asian Paints", finishes: ["Matt"] },
  { code: "BR-220", name: "Deep Fern", hex: "#3F5B45", family: "Greens", lrv: 12, brand: "Berger", finishes: ["Eggshell"] },
];

function renderBench(props: Partial<Parameters<typeof StudioTest>[0]> = {}) {
  return render(
    <StudioTest
      initial={[row()]}
      searchAction={() => Promise.resolve({ rows: [row()] })}
      loadAction={() => Promise.resolve({ project: detail() })}
      shades={SHADES}
      {...props}
    />,
  );
}

/** Press "Open on the bench" and wait for the room's surfaces to appear. */
async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Open on the bench/ }));
  await waitFor(() => expect(screen.getByLabelText("Paint Main wall")).toBeInTheDocument());
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("StudioTest — choosing what to paint", () => {
  it("names the account each room belongs to, since the rooms worth testing are other people's", () => {
    renderBench();
    // By role, not by label: the preview canvas is named "Room preview…" and is in
    // the DOM from the first render, so a loose label match reaches two elements.
    const picker = screen.getByRole("combobox", { name: /^Room/ }) as HTMLSelectElement;
    expect(picker.options[0]!.text).toContain("Front bedroom");
    expect(picker.options[0]!.text).toContain("asha@example.com");
  });

  it("identifies a walk-in's room by its shop and code, since no account exists", () => {
    renderBench({
      initial: [row({ id: "walk-in", ownerName: null, ownerEmail: null, customerName: "Ravi", shopName: "Deccan Paints" })],
    });
    const picker = screen.getByRole("combobox", { name: /^Room/ }) as HTMLSelectElement;
    expect(picker.options[0]!.text).toContain("Ravi (walk-in)");
    expect(picker.options[0]!.text).toContain("Deccan Paints");
  });

  it("tells an outage apart from a platform with no rooms on it", () => {
    renderBench({ initial: null });
    expect(screen.getByRole("alert")).toHaveTextContent(/Could not load the rooms/);
  });

  it("lists every stored mask as its own surface, so one wall can be judged alone", async () => {
    const user = userEvent.setup();
    renderBench();
    await open(user);
    expect(screen.getByLabelText("Paint Main wall")).toBeChecked();
    expect(screen.getByLabelText("Paint Trim")).toBeChecked();
  });

  it("skips a region with no stored mask — there is nothing to paint through", async () => {
    const user = userEvent.setup();
    renderBench({
      loadAction: () => Promise.resolve({
        project: detail({
          regions: [
            { id: 1, label: "Main wall", category: "MAIN_WALL", maskUrl: "/media/m1.png" },
            { id: 2, label: "Ceiling", category: "OTHER_WALL", maskUrl: null },
          ],
        }),
      }),
    });
    await open(user);
    expect(screen.queryByLabelText("Paint Ceiling")).not.toBeInTheDocument();
  });
});

describe("StudioTest — the canvas under the paint", () => {
  it("opens on the cleaned canvas and offers the original beside it", async () => {
    const user = userEvent.setup();
    renderBench();
    await open(user);
    expect(screen.getByLabelText("Cleaned")).toBeChecked();
    expect(screen.getByLabelText("Original photo")).toBeInTheDocument();
  });

  it("offers no cleaned canvas for a room that never got one, and says why", async () => {
    const user = userEvent.setup();
    renderBench({ loadAction: () => Promise.resolve({ project: detail({ cleanedImageUrl: null }) }) });
    await open(user);
    expect(screen.queryByLabelText("Cleaned")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Original photo")).toBeChecked();
    expect(screen.getByRole("note")).toHaveTextContent(/no cleaned canvas/);
  });

  it("says so when a room has masks but nothing to paint them through", async () => {
    const user = userEvent.setup();
    renderBench({ loadAction: () => Promise.resolve({ project: detail({ regions: [] }) }) });
    await user.click(screen.getByRole("button", { name: /Open on the bench/ }));
    await waitFor(() =>
      expect(screen.getByText(/No stored masks on this room/)).toBeInTheDocument());
  });
});

describe("StudioTest — the colour on the wall", () => {
  it("reopens a room on the shade it was left on, LRV and all", async () => {
    const user = userEvent.setup();
    renderBench({
      loadAction: () => Promise.resolve({
        project: detail({
          regions: [{
            id: 1, label: "Main wall", category: "MAIN_WALL", maskUrl: "/media/m1.png",
            appliedShadeCode: "BR-220", appliedHexCode: "#3F5B45",
          }],
        }),
      }),
    });
    await open(user);
    expect(screen.getByText(/Deep Fern · LRV 12/)).toBeInTheDocument();
  });

  it("falls back to a raw hex when the catalogue no longer carries that code", async () => {
    const user = userEvent.setup();
    renderBench({
      loadAction: () => Promise.resolve({
        project: detail({
          regions: [{
            id: 1, label: "Main wall", category: "MAIN_WALL", maskUrl: "/media/m1.png",
            appliedShadeCode: "GONE-999", appliedHexCode: "#AABBCC",
          }],
        }),
      }),
    });
    await open(user);
    expect(screen.getByText(/#AABBCC · raw hex/)).toBeInTheDocument();
  });

  it("takes a hex by hand — the one colour the studio cannot paint uncorrected", async () => {
    const user = userEvent.setup();
    renderBench();
    await open(user);
    const field = screen.getByLabelText(/Raw hex/);
    await user.clear(field);
    await user.type(field, "abc");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByText(/#AABBCC · raw hex/)).toBeInTheDocument();
  });

  it("refuses something that is not a colour instead of painting black", async () => {
    const user = userEvent.setup();
    renderBench();
    await open(user);
    const field = screen.getByLabelText(/Raw hex/);
    await user.clear(field);
    await user.type(field, "not a colour");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByText(/Not a hex colour/)).toBeInTheDocument();
  });

  it("paints the picked catalogue shade onto the surface being worked on", async () => {
    const user = userEvent.setup();
    renderBench();
    await open(user);
    await user.click(screen.getByRole("button", { name: "Deep Fern, Berger" }));
    expect(screen.getByText(/Deep Fern · LRV 12/)).toBeInTheDocument();
  });

  it("says the catalogue is gone rather than showing an empty grid", async () => {
    const user = userEvent.setup();
    renderBench({ shades: [] });
    await open(user);
    expect(screen.getByText(/catalogue is unavailable/)).toBeInTheDocument();
  });
});

describe("StudioTest — the engine knobs", () => {
  it("opens on the studio's own defaults, unmarked", async () => {
    const user = userEvent.setup();
    renderBench();
    await open(user);
    expect(screen.getByText(/Shadow preservation · 85%/)).toBeInTheDocument();
    expect(screen.getByText(/Edge nudge · \+1px/)).toBeInTheDocument();
    expect(screen.getByText(/Soft edges · off/)).toBeInTheDocument();
    expect(screen.queryByText(/off the studio default/)).not.toBeInTheDocument();
  });

  it("marks a knob moved off the studio's default, so an odd bench is never mistaken for the product", async () => {
    const user = userEvent.setup();
    renderBench();
    await open(user);
    await user.click(screen.getByLabelText(/Soft edges/));
    expect(screen.getByText(/off the studio default/)).toBeInTheDocument();
  });
});

describe("StudioTest — putting the two canvases against each other", () => {
  it("keeps ONE canvas node across every compare mode", async () => {
    const user = userEvent.setup();
    renderBench();
    await open(user);
    const before = document.querySelector("canvas");
    expect(before).not.toBeNull();

    // The engine binds to this node once, on mount. If a mode switch replaced it,
    // the engine would keep drawing into a canvas that is no longer on the page —
    // side by side would show a painted pane that never updates again.
    for (const mode of ["Side by side", "Painted only", "Canvas only", "Slider"]) {
      await user.click(screen.getByLabelText(mode));
      expect(document.querySelectorAll("canvas")).toHaveLength(1);
      expect(document.querySelector("canvas")).toBe(before);
    }
  });

  it("shows the untouched canvas beside the painted one in side-by-side", async () => {
    const user = userEvent.setup();
    renderBench();
    await open(user);
    await user.click(screen.getByLabelText("Side by side"));
    expect(screen.getByAltText("The canvas before any paint")).toBeInTheDocument();
  });

  it("gives the slider handle a value keyboard users can move", async () => {
    const user = userEvent.setup();
    renderBench();
    await open(user);
    const handle = screen.getByRole("slider", { name: /Drag to compare/ });
    expect(handle).toHaveAttribute("aria-valuenow", "50");
    handle.focus();
    await user.keyboard("{ArrowRight}");
    expect(handle).toHaveAttribute("aria-valuenow", "52");
  });
});

describe("StudioTest — the measurement panel", () => {
  it("offers nothing to measure until a frame has been", async () => {
    const user = userEvent.setup();
    renderBench();
    await open(user);
    expect(screen.getByText(/Nothing measured yet/)).toBeInTheDocument();
  });

  it("refuses to measure Canvas only, where nothing is painted", async () => {
    const user = userEvent.setup();
    renderBench();
    await open(user);
    await user.click(screen.getByLabelText("Canvas only"));
    expect(screen.getByRole("button", { name: /Measure this frame/ })).toBeDisabled();
    expect(screen.getByText(/no render to measure/)).toBeInTheDocument();
  });

  it("has nothing to measure when every surface is left unpainted", async () => {
    const user = userEvent.setup();
    renderBench();
    await open(user);
    await user.click(screen.getByLabelText("Paint Main wall"));
    await user.click(screen.getByLabelText("Paint Trim"));
    expect(screen.getByRole("button", { name: /Measure this frame/ })).toBeDisabled();
    expect(screen.getByText(/no surface is painted/)).toBeInTheDocument();
  });
});
