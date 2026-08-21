// @vitest-environment jsdom
/**
 * MASK STUDIO — editing several masks at once, restoring, aligning, and corner points.
 *
 * Mounted against a pixel-backed canvas (see canvas-stub.ts) rather than the null
 * getContext the other studio suites use, because every behaviour here is a claim about
 * pixels: that an alignment shifted all four masks by the same amount, that restoring
 * put the detected outline back, that a mask nobody edited was not written back.
 *
 * The photo is 800×600 and the wrapper is stubbed to the same size, so at fit zoom one
 * client pixel is one mask pixel and one image pixel — which lets the pointer coordinates
 * in these tests be read directly as positions in the mask.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MaskStudio, type ExistingMask, type MaskEdit } from "../mask-studio";
import { installCanvas2D, maskCanvas, coverageBox, coveredPixels } from "./canvas-stub";

const W = 800;
const H = 600;

// The wand samples the photo through this; hand it a blank one so the tool is available
// and nothing tries to reach the network.
vi.mock("@/lib/load-image", () => ({
  loadCrossOriginImage: vi.fn(async (url: string) => {
    const found = (globalThis as { __masksByUrl?: Map<string, HTMLCanvasElement> }).__masksByUrl?.get(url);
    if (found) return found as unknown as HTMLImageElement;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    return canvas as unknown as HTMLImageElement;
  }),
}));

/** Register a canvas as the mask served from `url`, the way the backend would. */
function serveMask(url: string, canvas: HTMLCanvasElement) {
  const g = globalThis as { __masksByUrl?: Map<string, HTMLCanvasElement> };
  g.__masksByUrl ??= new Map();
  g.__masksByUrl.set(url, canvas);
}

let restoreCanvas: () => void;
const layoutProps = ["clientWidth", "clientHeight"] as const;
const originalLayout: Record<string, PropertyDescriptor | undefined> = {};
const originalRect = Element.prototype.getBoundingClientRect;

beforeAll(() => {
  restoreCanvas = installCanvas2D();
  // jsdom lays nothing out, so the studio's letterbox maths would divide by a zero-sized
  // wrapper. Give every element the photo's own size and origin.
  for (const prop of layoutProps) {
    originalLayout[prop] = Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop);
    Object.defineProperty(HTMLElement.prototype, prop, {
      configurable: true,
      get() {
        return prop === "clientWidth" ? W : H;
      },
    });
  }
  Element.prototype.getBoundingClientRect = function () {
    return { x: 0, y: 0, left: 0, top: 0, right: W, bottom: H, width: W, height: H, toJSON: () => ({}) } as DOMRect;
  };
  // Pointer capture is not implemented in jsdom and the studio calls it on every press.
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

afterAll(() => {
  restoreCanvas();
  for (const prop of layoutProps) {
    if (originalLayout[prop]) Object.defineProperty(HTMLElement.prototype, prop, originalLayout[prop]!);
  }
  Element.prototype.getBoundingClientRect = originalRect;
});

beforeEach(() => {
  (globalThis as { __masksByUrl?: Map<string, HTMLCanvasElement> }).__masksByUrl = new Map();
  // Dismiss the one-time coach; it sits over the canvas and would swallow every press.
  window.localStorage.setItem("hv-mask-coach-v1", "1");
});

/** Three detected walls, each a distinct block, plus whatever extras a test wants. */
function walls(extra: ExistingMask[] = []): ExistingMask[] {
  const main = maskCanvas(W, H, { x: 100, y: 100, w: 120, h: 80 });
  const accent = maskCanvas(W, H, { x: 400, y: 100, w: 120, h: 80 });
  const trim = maskCanvas(W, H, { x: 100, y: 400, w: 120, h: 80 });
  serveMask("main.png", main);
  serveMask("accent.png", accent);
  serveMask("trim.png", trim);
  return [
    { id: "r-1", label: "Main wall", kind: "MAIN_WALL", maskUrl: "main.png" },
    { id: "r-2", label: "Accent wall", kind: "ACCENT_WALL", maskUrl: "accent.png" },
    { id: "r-3", label: "Trim & frames", kind: "TRIM", maskUrl: "trim.png" },
    ...extra,
  ];
}

function open(opts: { existing: ExistingMask[]; editTarget: ExistingMask | null }) {
  const onSaveEdits = vi.fn<(edits: MaskEdit[]) => void>();
  const onSave = vi.fn();
  const onClose = vi.fn();
  render(
    <MaskStudio
      imageUrl="room.jpg"
      imageDims={{ w: W, h: H }}
      existing={opts.existing}
      remaining={3}
      saving={false}
      editTarget={opts.editTarget}
      onClose={onClose}
      onSave={onSave}
      onSaveEdits={onSaveEdits}
    />,
  );
  return { onSaveEdits, onSave, onClose };
}

/** The studio has finished loading a mask into a layer when its chip reads as open. */
async function openedMask(label: string) {
  return waitFor(() => screen.getByRole("button", { name: new RegExp(`^${label}`) }));
}

const canvasSurface = () => document.querySelector<HTMLDivElement>('[role="presentation"]')!;

describe("Mask Studio — editing several masks at once", () => {
  it("opens up to four masks and refuses the fifth", async () => {
    const user = userEvent.setup();
    const extra = maskCanvas(W, H, { x: 600, y: 400, w: 60, h: 60 });
    serveMask("porch.png", extra);
    const fifth = maskCanvas(W, H, { x: 650, y: 60, w: 40, h: 40 });
    serveMask("gate.png", fifth);
    const existing = walls([
      { id: "r-4", label: "Porch", kind: "MANUAL", maskUrl: "porch.png" },
      { id: "r-5", label: "Gate", kind: "MANUAL", maskUrl: "gate.png" },
    ]);
    open({ existing, editTarget: existing[0]! });

    await openedMask("Main wall");
    for (const label of ["Accent wall", "Trim & frames", "Porch"]) {
      await user.click(screen.getByRole("button", { name: new RegExp(`^${label}`) }));
      await waitFor(() => expect(screen.getByTitle(new RegExp(`${label} — the mask`))).toBeInTheDocument());
    }

    // Four are open; the fifth is offered but refused, and says why.
    expect(screen.getByText(/4 of 4 open/i)).toBeInTheDocument();
    const gate = screen.getByRole("button", { name: /^Gate/ });
    expect(gate).toBeDisabled();
    expect(gate).toHaveAttribute("title", expect.stringMatching(/close one to open Gate/i));
  });

  it("never lets the last open mask be closed", async () => {
    const user = userEvent.setup();
    const existing = walls();
    open({ existing, editTarget: existing[0]! });
    await openedMask("Main wall");

    // One open: nothing to close, because a studio with no mask can do nothing.
    expect(screen.queryByRole("button", { name: /close main wall/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Accent wall/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /close main wall/i })).toBeInTheDocument());
  });

  it("writes back only the masks that were changed", async () => {
    const user = userEvent.setup();
    const existing = walls();
    const { onSaveEdits } = open({ existing, editTarget: existing[0]! });
    await openedMask("Main wall");

    // Open a second wall and leave it completely alone.
    await user.click(screen.getByRole("button", { name: /^Accent wall/ }));
    await waitFor(() => expect(screen.getByTitle(/Accent wall — the mask/)).toBeInTheDocument());

    // Go back to the first and paint one brush dab into it.
    await user.click(screen.getByRole("button", { name: /^Main wall/ }));
    await user.click(screen.getByRole("button", { name: /^Brush/ }));
    const surface = canvasSurface();
    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 150, clientY: 140, button: 0 });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 150, clientY: 140, button: 0 });

    await waitFor(() => expect(screen.getByRole("button", { name: /update wall/i })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: /update wall/i }));

    expect(onSaveEdits).toHaveBeenCalledTimes(1);
    const edits = onSaveEdits.mock.calls[0]![0];
    expect(edits.map((e) => e.regionId)).toEqual(["r-1"]);
    // Saved at photo resolution, which is what the shader and the backend expect.
    expect(edits[0]!.mask.width).toBe(W);
    expect(edits[0]!.mask.height).toBe(H);
  });

  it("refuses to save a mask that has been emptied, and says which one", async () => {
    const user = userEvent.setup();
    const existing = walls();
    const { onSaveEdits } = open({ existing, editTarget: existing[0]! });
    await openedMask("Main wall");

    await user.click(screen.getByRole("button", { name: /^Clear/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /update wall/i })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: /update wall/i }));

    // Erasing a wall is what Delete is for; an empty mask saved as an edit would do it
    // silently, so it is refused by name rather than written.
    expect(onSaveEdits).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/Main wall has nothing selected/i);
  });
});

describe("Mask Studio — restoring the original mask", () => {
  it("is offered only for a wall that has been edited before", async () => {
    const existing = walls();
    open({ existing, editTarget: existing[0]! });
    await openedMask("Main wall");

    // Nothing has ever overwritten this mask, so the live one IS the original.
    expect(screen.queryByRole("button", { name: /restore original/i })).not.toBeInTheDocument();
  });

  it("puts back the mask detection drew, and leaves it undoable", async () => {
    const user = userEvent.setup();
    const detected = maskCanvas(W, H, { x: 300, y: 300, w: 100, h: 100 });
    serveMask("main-original.png", detected);
    const existing = walls();
    existing[0] = { ...existing[0]!, originalMaskUrl: "main-original.png" };
    const { onSaveEdits } = open({ existing, editTarget: existing[0]! });
    await openedMask("Main wall");

    await user.click(screen.getByRole("button", { name: /restore original/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /update wall/i })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: /update wall/i }));

    const edits = onSaveEdits.mock.calls[0]![0];
    expect(edits.map((e) => e.regionId)).toEqual(["r-1"]);
    // The detected block, not the edited one the studio opened with.
    expect(coverageBox(edits[0]!.mask)).toEqual({ minX: 300, minY: 300, maxX: 399, maxY: 399 });
  });

  it("does not save on its own — the restore can be undone first", async () => {
    const user = userEvent.setup();
    const detected = maskCanvas(W, H, { x: 300, y: 300, w: 100, h: 100 });
    serveMask("main-original.png", detected);
    const existing = walls();
    existing[0] = { ...existing[0]!, originalMaskUrl: "main-original.png" };
    const { onSaveEdits } = open({ existing, editTarget: existing[0]! });
    await openedMask("Main wall");

    await user.click(screen.getByRole("button", { name: /restore original/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^Undo/ })).toBeEnabled());
    expect(onSaveEdits).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /^Undo/ }));
    await user.click(screen.getByRole("button", { name: /update wall/i }));

    // Back to the mask the studio opened with.
    const edits = onSaveEdits.mock.calls[0]![0];
    expect(coverageBox(edits[0]!.mask)).toEqual({ minX: 100, minY: 100, maxX: 219, maxY: 179 });
  });
});

describe("Mask Studio — aligning the masks with the photo", () => {
  it("moves every open mask by the same amount, and undoes them together", async () => {
    const user = userEvent.setup();
    const existing = walls();
    const { onSaveEdits } = open({ existing, editTarget: existing[0]! });
    await openedMask("Main wall");
    await user.click(screen.getByRole("button", { name: /^Accent wall/ }));
    await waitFor(() => expect(screen.getByTitle(/Accent wall — the mask/)).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /^Align/ }));
    const surface = canvasSurface();
    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 300, clientY: 300, button: 0 });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 312, clientY: 293 });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 312, clientY: 293 });

    await waitFor(() => expect(screen.getByText(/\+12, -7 px/)).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /update 2 walls/i }));

    // Both walls moved, by the same offset — the whole point of moving them together.
    const edits = onSaveEdits.mock.calls[0]![0];
    expect(edits.map((e) => e.regionId).sort()).toEqual(["r-1", "r-2"]);
    const byId = new Map(edits.map((e) => [e.regionId, e.mask]));
    expect(coverageBox(byId.get("r-1")!)).toEqual({ minX: 112, minY: 93, maxX: 231, maxY: 172 });
    expect(coverageBox(byId.get("r-2")!)).toEqual({ minX: 412, minY: 93, maxX: 531, maxY: 172 });
  });

  it("nudges with the arrow keys, and a run of taps is one undo", async () => {
    const user = userEvent.setup();
    const existing = walls();
    const { onSaveEdits } = open({ existing, editTarget: existing[0]! });
    await openedMask("Main wall");
    await user.click(screen.getByRole("button", { name: /^Align/ }));

    for (let i = 0; i < 3; i++) fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowDown", shiftKey: true });
    await waitFor(() => expect(screen.getByText(/\+3, \+10 px/)).toBeInTheDocument());

    // Four taps, one step back: undoing an alignment a pixel at a time would leave the
    // room somewhere nobody chose.
    await user.click(screen.getByRole("button", { name: /^Undo/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^Undo/ })).toBeDisabled());

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    await waitFor(() => expect(screen.getByText(/-1, \+0 px/)).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /update wall/i }));
    const edits = onSaveEdits.mock.calls[0]![0];
    expect(coverageBox(edits[0]!.mask)).toEqual({ minX: 99, minY: 100, maxX: 218, maxY: 179 });
  });

  it("leaves the masks alone until the drag is let go", async () => {
    const user = userEvent.setup();
    const existing = walls();
    open({ existing, editTarget: existing[0]! });
    await openedMask("Main wall");
    await user.click(screen.getByRole("button", { name: /^Align/ }));

    const surface = canvasSurface();
    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 300, clientY: 300, button: 0 });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 340, clientY: 300 });

    // Mid-drag the overlay shows the shift; nothing has been written, so there is still
    // nothing to save.
    expect(screen.getByRole("button", { name: /update wall/i })).toBeDisabled();
  });
});

describe("Mask Studio — corner points", () => {
  it("removes the point that was right-clicked, not the last one", async () => {
    const user = userEvent.setup();
    const existing = walls();
    const { onSaveEdits } = open({ existing, editTarget: existing[0]! });
    await openedMask("Main wall");
    await user.click(screen.getByRole("button", { name: /^Corners/ }));

    const surface = canvasSurface();
    // A rectangle, with its top-right corner tapped by mistake three points ago —
    // exactly the case Backspace cannot reach without throwing away the good points
    // laid down after it.
    const points: Array<[number, number]> = [
      [200, 200],
      [500, 200], // the mistake
      [500, 450],
      [200, 450],
    ];
    points.forEach(([x, y], i) => {
      fireEvent.pointerDown(surface, { pointerId: i + 1, clientX: x, clientY: y, button: 0 });
      fireEvent.pointerUp(surface, { pointerId: i + 1, clientX: x, clientY: y, button: 0 });
    });
    await waitFor(() => expect(screen.getByText(/right-click any dot to remove/i)).toBeInTheDocument());

    fireEvent.contextMenu(surface, { clientX: 500, clientY: 200 });
    fireEvent.keyDown(window, { key: "Enter" });

    await waitFor(() => expect(screen.getByRole("button", { name: /update wall/i })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: /update wall/i }));

    const shape = coveredPixels(onSaveEdits.mock.calls[0]![0][0]!.mask);
    // What is left is the triangle (200,200)-(500,450)-(200,450). A point inside the
    // rectangle but outside the triangle proves the right corner went, and that the
    // three good corners stayed.
    expect(shape.has("250,430")).toBe(true);
    expect(shape.has("450,250")).toBe(false);
  });

  it("does not lay a point down on a right-click", async () => {
    const user = userEvent.setup();
    const existing = walls();
    open({ existing, editTarget: existing[0]! });
    await openedMask("Main wall");
    await user.click(screen.getByRole("button", { name: /^Corners/ }));

    const surface = canvasSurface();
    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 200, clientY: 200, button: 2 });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 200, clientY: 200, button: 2 });
    fireEvent.contextMenu(surface, { clientX: 200, clientY: 200 });

    // Still nothing outlined — the right button belongs to the delete gesture.
    expect(screen.getByText(/Tap corner points around the wall/i)).toBeInTheDocument();
  });
});
