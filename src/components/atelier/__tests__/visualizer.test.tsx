// @vitest-environment jsdom
/**
 * STUDIO FLOW integration test.
 *
 * Mounts the full Visualizer with the API, the recolor engines and the polling
 * loop mocked (the loop's real timing logic is unit-tested in
 * src/lib/__tests__/segmentation-polling.test.ts — here outcomes are driven
 * directly through the mocked api.getProjectStatus, with no timers at all).
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ProjectDetail, RegionDetail, UploadedImage } from "@/lib/types";
import {
  pollUntilSegmented,
  PollCancelledError,
  PollFailedError,
  PollTimeoutError,
  type PollOptions,
  type SegmentationStatusLike,
} from "@/lib/segmentation-polling";
import { api } from "@/lib/api";
import { Visualizer } from "../visualizer";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/api", () => {
  class HttpError extends Error {
    status: number;
    code?: string;
    fieldErrors?: Record<string, string>;
    constructor(status: number, message: string, fieldErrors?: Record<string, string>, code?: string) {
      super(message);
      this.status = status;
      this.fieldErrors = fieldErrors;
      this.code = code;
    }
  }
  return {
    HttpError,
    api: {
      uploadImage: vi.fn(),
      createProject: vi.fn(),
      requestSegmentation: vi.fn(),
      getProjectStatus: vi.fn(),
      getProject: vi.fn(),
      generateShareLink: vi.fn(),
      updateRegionColors: vi.fn(),
      createCustomMask: vi.fn(),
      // Topbar quota pill reads this on mount and after AI spends.
      getCurrentSubscription: vi.fn(async () => ({
        status: "ACTIVE",
        trial: true,
        planDisplayName: "Professional",
        aiGenerationsUsed: 3,
        aiGenerationsLimit: 60,
      })),
      getAiRecommendations: vi.fn(),
      // Shop picks load best-effort on mount; default to none so the effect is a no-op.
      getRetailerCombos: vi.fn(async () => []),
      // PDF tray quota loads best-effort on mount.
      getPdfAllowance: vi.fn(async () => ({
        imagesPerPdf: 8,
        monthlyLimit: 100,
        used: 0,
        remaining: 100,
        unlimited: false,
      })),
      chargePdfDownload: vi.fn(async () => ({
        imagesPerPdf: 8,
        monthlyLimit: 100,
        used: 1,
        remaining: 99,
        unlimited: false,
      })),
    },
    guestApi: {
      uploadImage: vi.fn(),
      createProject: vi.fn(),
      getProject: vi.fn(),
      updateRegionColors: vi.fn(),
      createCustomMask: vi.fn(),
      getPdfAllowance: vi.fn(async () => ({
        imagesPerPdf: 8,
        monthlyLimit: 100,
        used: 0,
        remaining: 100,
        unlimited: false,
      })),
      chargePdfDownload: vi.fn(async () => ({
        imagesPerPdf: 8,
        monthlyLimit: 100,
        used: 1,
        remaining: 99,
        unlimited: false,
      })),
    },
  };
});

// Controls whether the stub engines throw in their constructors (per test).
const engineState = vi.hoisted(() => ({
  webglShouldThrow: false,
  canvas2dShouldThrow: false,
}));

vi.mock("@/lib/webgl-recolor", () => {
  class Recolor {
    constructor(public readonly canvas: HTMLCanvasElement) {
      if (engineState.webglShouldThrow) {
        throw new Error("WebGL2 is not supported in this browser.");
      }
    }
    setImage() {}
    renderRegions() {}
    renderBase() {}
    exportPng() {
      return "data:image/png;base64,";
    }
    dispose() {}
  }
  return {
    Recolor,
    hexToRgb01: () => [0, 0, 0] as [number, number, number],
    regionMeanLuma: () => 0.5,
  };
});

vi.mock("@/lib/canvas2d-recolor", () => {
  class Canvas2DRecolor {
    constructor(public readonly canvas: HTMLCanvasElement) {
      if (engineState.canvas2dShouldThrow) {
        throw new Error("Canvas 2D rendering is not supported in this browser.");
      }
    }
    setImage() {}
    renderRegions() {}
    renderBase() {}
    exportPng() {
      return "data:image/png;base64,";
    }
    dispose() {}
  }
  return { Canvas2DRecolor };
});

// Keep the real error classes (the component's instanceof checks must hold);
// replace only the loop so tests drive outcomes without timers.
vi.mock("@/lib/segmentation-polling", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/segmentation-polling")>();
  return { ...actual, pollUntilSegmented: vi.fn() };
});

// The QR hand-off pulls in the qrcode lib and its own polling — out of scope.
vi.mock("@/components/shared/phone-handoff", () => ({
  PhoneHandoff: () => null,
}));

const pollMock = vi.mocked(pollUntilSegmented);

// ---------------------------------------------------------------------------
// Browser APIs jsdom lacks
// ---------------------------------------------------------------------------

/** Image stub that fires onload as soon as src is assigned (next microtask). */
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  crossOrigin = "";
  naturalWidth = 800;
  naturalHeight = 600;
  #src = "";
  get src() {
    return this.#src;
  }
  set src(value: string) {
    this.#src = value;
    queueMicrotask(() => this.onload?.());
  }
}

const originalGetContext = HTMLCanvasElement.prototype.getContext;

beforeAll(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    writable: true,
    value: vi.fn(() => "blob:hv-local-preview"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
  // Engines are stubbed; nothing should need a real context, but jsdom's
  // built-in getContext throws "not implemented" noise without this.
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
});

afterAll(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SEGMENTED_REGIONS: RegionDetail[] = [
  {
    id: 11,
    label: "Left feature wall",
    category: "MAIN_WALL",
    maskUrl: "https://media.example.com/masks/11.png",
    appliedShadeCode: null,
    appliedHexCode: null,
    displayOrder: 0,
  },
  {
    id: 12,
    label: "Window trim",
    category: "TRIM",
    maskUrl: "https://media.example.com/masks/12.png",
    appliedShadeCode: null,
    appliedHexCode: null,
    displayOrder: 1,
  },
];

function projectDetail(over: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    id: "p-1",
    name: "Test room",
    status: "CREATED",
    imageId: "img-1",
    imageUrl: "https://media.example.com/rooms/img-1.jpg",
    cleanedImageUrl: null,
    regions: [],
    ...over,
  };
}

const UPLOADED: UploadedImage = {
  imageId: "img-1",
  imageUrl: "https://media.example.com/rooms/img-1.jpg",
  originalFilename: "room.jpg",
  imageType: "INDOOR",
  fileSize: 123_456,
  uploadedAt: "2026-06-11T00:00:00Z",
};

function makeFile(name: string, type: string, size?: number): File {
  const file = new File(["x"], name, { type });
  if (size !== undefined) Object.defineProperty(file, "size", { value: size });
  return file;
}

function fileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("file input not rendered");
  return input;
}

/** Choose a file and let the whole async upload→segment cascade settle. */
async function chooseFile(container: HTMLElement, file: File) {
  await act(async () => {
    fireEvent.change(fileInput(container), { target: { files: [file] } });
  });
  // A valid photo now shows a local preview with a confirm prompt; the backend
  // isn't touched until the user continues. Click it so the upload→segment
  // cascade runs. Invalid files never reach the preview (no button), so the
  // validation tests still correctly assert "never uploaded".
  const confirm = screen.queryByRole("button", { name: /Continue with this image/i });
  if (confirm) {
    await act(async () => {
      fireEvent.click(confirm);
    });
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  engineState.webglShouldThrow = false;
  engineState.canvas2dShouldThrow = false;
  vi.stubGlobal("Image", FakeImage);

  vi.mocked(api.uploadImage).mockResolvedValue(UPLOADED);
  vi.mocked(api.createProject).mockResolvedValue(projectDetail());
  vi.mocked(api.requestSegmentation).mockResolvedValue(projectDetail({ status: "SEGMENTING" }));
  vi.mocked(api.getProjectStatus).mockResolvedValue(
    projectDetail({ status: "SEGMENTED", regions: SEGMENTED_REGIONS }),
  );

  // Faithful mini-loop: no sleeping, outcome driven by api.getProjectStatus.
  pollMock.mockImplementation((async (options: PollOptions<SegmentationStatusLike>) => {
    for (let i = 0; i < 10; i += 1) {
      const status = await options.getStatus();
      if (status.status === "SEGMENTED") return status;
      if (status.status === "FAILED") throw new PollFailedError(status.failureReason);
    }
    throw new PollTimeoutError();
  }) as typeof pollUntilSegmented);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Visualizer — project details gate", () => {
  it("shows the gate first and reveals the drop zone once details are submitted", async () => {
    const user = userEvent.setup();
    render(<Visualizer />);

    expect(screen.getByRole("heading", { name: "Name your project" })).toBeInTheDocument();
    expect(screen.queryByText("Add a photo of the room")).not.toBeInTheDocument();
    expect(screen.getByText("Untitled project")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Project name"), "Sharma hall");
    await user.click(screen.getByRole("button", { name: /Continue to photo/ }));

    expect(screen.getByText("Add a photo of the room")).toBeInTheDocument();
    expect(screen.getByText("Sharma hall")).toBeInTheDocument(); // topbar project name
  });
});

describe("Visualizer — upload validation", () => {
  it("rejects a wrong-MIME file with the right message and never uploads", async () => {
    const { container } = render(<Visualizer initialName="Test room" />);
    await screen.findByText("Add a photo of the room");

    await chooseFile(container, makeFile("room.gif", "image/gif"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Only JPEG, PNG or WebP photos are accepted.",
    );
    expect(api.uploadImage).not.toHaveBeenCalled();
    // Still on the drop zone — nothing was created.
    expect(screen.getByText("Add a photo of the room")).toBeInTheDocument();
  });

  it("rejects a photo over 10 MB with the right message and never uploads", async () => {
    const { container } = render(<Visualizer initialName="Test room" />);
    await screen.findByText("Add a photo of the room");

    await chooseFile(container, makeFile("huge.jpg", "image/jpeg", 10 * 1024 * 1024 + 1));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Photo is larger than 10 MB. Use a smaller copy.",
    );
    expect(api.uploadImage).not.toHaveBeenCalled();
  });
});

describe("Visualizer — confirm before processing", () => {
  it("previews a chosen photo and touches no backend until the user continues", async () => {
    const { container } = render(<Visualizer initialName="Test room" />);
    await screen.findByText("Add a photo of the room");

    await act(async () => {
      fireEvent.change(fileInput(container), {
        target: { files: [makeFile("room.jpg", "image/jpeg")] },
      });
    });

    // Preview + confirm prompt are shown; nothing has been sent yet.
    const confirm = await screen.findByRole("button", { name: /Continue with this image/i });
    expect(screen.getByRole("button", { name: /Choose a different photo/i })).toBeInTheDocument();
    expect(api.uploadImage).not.toHaveBeenCalled();
    expect(api.createProject).not.toHaveBeenCalled();
    expect(api.requestSegmentation).not.toHaveBeenCalled();

    // Confirming is the first point any billable call happens.
    await act(async () => {
      fireEvent.click(confirm);
    });
    expect(api.uploadImage).toHaveBeenCalledTimes(1);
    expect(api.requestSegmentation).toHaveBeenCalledWith("p-1", undefined);
  });

  it("hides the admin clean-image toggle from non-admins and shows it to admins", async () => {
    const { container, unmount } = render(<Visualizer initialName="Test room" />);
    await screen.findByText("Add a photo of the room");
    await act(async () => {
      fireEvent.change(fileInput(container), {
        target: { files: [makeFile("room.jpg", "image/jpeg")] },
      });
    });
    await screen.findByRole("button", { name: /Continue with this image/i });
    expect(screen.queryByLabelText(/Clean the photo/i)).not.toBeInTheDocument();
    unmount();

    const admin = render(<Visualizer initialName="Test room" isAdmin />);
    await screen.findByText("Add a photo of the room");
    await act(async () => {
      fireEvent.change(fileInput(admin.container), {
        target: { files: [makeFile("room.jpg", "image/jpeg")] },
      });
    });
    await screen.findByRole("button", { name: /Continue with this image/i });
    expect(screen.getByLabelText(/Clean the photo/i)).toBeChecked();
  });

  it("admin panel choices are sent with the segment request", async () => {
    const { container } = render(<Visualizer initialName="Test room" isAdmin />);
    await screen.findByText("Add a photo of the room");

    await act(async () => {
      fireEvent.change(fileInput(container), {
        target: { files: [makeFile("room.jpg", "image/jpeg")] },
      });
    });
    const confirm = await screen.findByRole("button", { name: /Continue with this image/i });
    // Uncheck cleaning — exactly that state is sent.
    await act(async () => {
      fireEvent.click(screen.getByLabelText(/Clean the photo/i));
    });
    await act(async () => {
      fireEvent.click(confirm);
    });

    expect(api.requestSegmentation).toHaveBeenCalledWith("p-1", {
      cleanImage: false,
    });
  });

  it("discards the preview on 'choose different' without any backend call", async () => {
    const { container } = render(<Visualizer initialName="Test room" />);
    await screen.findByText("Add a photo of the room");

    await act(async () => {
      fireEvent.change(fileInput(container), {
        target: { files: [makeFile("room.jpg", "image/jpeg")] },
      });
    });

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: /Choose a different photo/i }));
    });

    // Back to the drop zone; nothing was ever uploaded.
    expect(screen.getByText("Add a photo of the room")).toBeInTheDocument();
    expect(api.uploadImage).not.toHaveBeenCalled();
  });
});

describe("Visualizer — happy path (upload → segment → regions)", () => {
  it("uploads, creates the project, polls to SEGMENTED and shows the detected walls", async () => {
    vi.mocked(api.getProjectStatus)
      .mockResolvedValueOnce(projectDetail({ status: "SEGMENTING" })) // first poll: still working
      .mockResolvedValue(projectDetail({ status: "SEGMENTED", regions: SEGMENTED_REGIONS }));

    const { container } = render(<Visualizer initialName="Test room" />);
    const file = makeFile("room.jpg", "image/jpeg");
    await chooseFile(container, file);

    // Backend interactions, in order.
    expect(api.uploadImage).toHaveBeenCalledTimes(1);
    expect(api.uploadImage).toHaveBeenCalledWith(file);
    expect(api.createProject).toHaveBeenCalledWith({
      imageId: "img-1",
      name: "Test room",
      roomType: undefined,
      notes: undefined,
    });
    expect(api.requestSegmentation).toHaveBeenCalledWith("p-1", undefined);
    expect(api.getProjectStatus).toHaveBeenCalledTimes(2); // SEGMENTING, then SEGMENTED

    // Mask stage reached: notice chip + classification + the backend regions
    // rendered as wall chips.
    expect((await screen.findAllByText("Walls detected")).length).toBeGreaterThan(0);
    expect(screen.getByText("Indoor")).toBeInTheDocument();
    expect(screen.getAllByText("Left feature wall").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Window trim").length).toBeGreaterThan(0);
    // Region chips render without a redundant heading label in the redesigned selector.

    // No error surface anywhere.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("Visualizer — segmentation give-up and retry", () => {
  it("shows the timeout message with a Try again button, and retry re-runs segmentation without re-upload", async () => {
    // Stuck: every poll reports SEGMENTING until the loop gives up.
    vi.mocked(api.getProjectStatus).mockResolvedValue(projectDetail({ status: "SEGMENTING" }));

    const { container } = render(<Visualizer initialName="Test room" />);
    await chooseFile(container, makeFile("room.jpg", "image/jpeg"));

    const banner = await screen.findByRole("alert");
    expect(banner).toHaveTextContent("Detecting walls timed out. Please try again.");
    const tryAgain = screen.getByRole("button", { name: "Try again" });
    expect(tryAgain).toBeInTheDocument();
    expect(api.requestSegmentation).toHaveBeenCalledTimes(1);
    expect(api.uploadImage).toHaveBeenCalledTimes(1);

    // The backend recovers; retry must NOT re-upload or re-create the project.
    vi.mocked(api.getProjectStatus).mockResolvedValue(
      projectDetail({ status: "SEGMENTED", regions: SEGMENTED_REGIONS }),
    );
    await act(async () => {
      fireEvent.click(tryAgain);
    });

    expect(api.requestSegmentation).toHaveBeenCalledTimes(2);
    expect(api.requestSegmentation).toHaveBeenLastCalledWith("p-1", undefined);
    expect(api.uploadImage).toHaveBeenCalledTimes(1); // unchanged
    expect(api.createProject).toHaveBeenCalledTimes(1); // unchanged

    expect((await screen.findAllByText("Walls detected")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Left feature wall").length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("surfaces the backend failureReason when segmentation FAILS, and the banner can be dismissed", async () => {
    vi.mocked(api.getProjectStatus).mockResolvedValue(
      projectDetail({ status: "FAILED", failureReason: "We couldn't find any walls in this photo." }),
    );

    const { container } = render(<Visualizer initialName="Test room" />);
    await chooseFile(container, makeFile("room.jpg", "image/jpeg"));

    const banner = await screen.findByRole("alert");
    expect(banner).toHaveTextContent("We couldn't find any walls in this photo.");
    // The retry affordance is offered for failures too (project already exists).
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Dismiss error" }));
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("Visualizer — polling cancellation wiring", () => {
  it("hands the poller an abort check that flips when the component unmounts", async () => {
    // Stall the poll mid-flight so we can observe the component's abort token.
    let captured: PollOptions<SegmentationStatusLike> | null = null;
    let rejectPoll: ((reason: Error) => void) | undefined;
    pollMock.mockImplementation((async (options: PollOptions<SegmentationStatusLike>) => {
      captured = options;
      return await new Promise<SegmentationStatusLike>((_resolve, reject) => {
        rejectPoll = reject;
      });
    }) as typeof pollUntilSegmented);

    const { container, unmount } = render(<Visualizer initialName="Test room" />);
    await chooseFile(container, makeFile("room.jpg", "image/jpeg"));

    await waitFor(() => expect(pollMock).toHaveBeenCalledTimes(1));
    expect(captured!.isCancelled?.()).toBe(false);

    unmount();
    expect(captured!.isCancelled?.()).toBe(true);

    // Settle the dangling promise the way the real poller ends a cancelled
    // loop; the component must swallow it without surfacing an error.
    await act(async () => {
      rejectPoll?.(new PollCancelledError());
    });
  });
});

describe("Visualizer — recolor engine fallback", () => {
  it("falls back to the Canvas 2D engine with a 'Basic preview mode' chip when WebGL2 is unavailable", async () => {
    engineState.webglShouldThrow = true;

    render(<Visualizer initialName="Test room" />);

    expect(await screen.findByText(/Basic preview/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the hard error only when both engines fail", async () => {
    engineState.webglShouldThrow = true;
    engineState.canvas2dShouldThrow = true;

    render(<Visualizer initialName="Test room" />);

    // The 2D engine is retried on a freshly mounted canvas (the WebGL2 attempt
    // may have claimed the first one), so its failure is the terminal error.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Canvas 2D rendering is not supported in this browser.",
    );
    expect(screen.queryByText(/Basic preview/)).not.toBeInTheDocument();
  });
});
