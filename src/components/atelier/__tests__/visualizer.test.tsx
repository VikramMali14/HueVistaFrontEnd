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
import type { PaintShade, ProjectDetail, RegionDetail, UploadedImage } from "@/lib/types";
import {
  pollUntilSegmented,
  PollCancelledError,
  PollFailedError,
  PollTimeoutError,
  type PollOptions,
  type SegmentationStatusLike,
} from "@/lib/segmentation-polling";
import { api, guestApi, HttpError } from "@/lib/api";
import { Visualizer } from "../visualizer";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// The studio navigates to the render page when a project closes, so it holds a router.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/lib/api", () => {
  /**
   * What buying costs this account: served on mount, and again by the purchase endpoints
   * themselves so the gate's prices are never a purchase behind. Declared inside the
   * factory because `vi.mock` is hoisted above every const in this file.
   */
  const purchaseOptions = {
    subscribed: true,
    pricingPlan: "STARTER",
    projectPricePoints: 80,
    projectPricePaise: 9900,
    reopenPricePoints: 9,
    reopenPricePaise: 900,
    pointsBalance: 0,
    validDays: 30,
    availableCredits: 0,
  };
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
      // Topbar quota pill reads this on mount and after AI spends. The
      // auto-mask allowance keeps the default AUTO mask mode available.
      getCurrentSubscription: vi.fn(async () => ({
        status: "ACTIVE",
        trial: true,
        planDisplayName: "Professional",
        aiGenerationsUsed: 3,
        aiGenerationsLimit: 60,
        autoMasksUsed: 0,
        autoMasksLimit: 40,
        purchasedImageCredits: 0,
      })),
      getAiRecommendations: vi.fn(),
      // The shop's display settings load on mount for EVERYONE now, not just guests —
      // a shop's own code pattern has to reach its own staff. Default to no pattern and
      // names shown, i.e. the plain manufacturer codes these tests assert on.
      // The gate quotes a real price, so the studio asks what buying costs on mount.
      getProjectPurchaseOptions: vi.fn(async () => purchaseOptions),
      // The out-of-quota prompts quote point prices, so the studio reads the list on
      // mount. 403s for a customer account, which is why the component tolerates a
      // rejection here.
      getRewardPoints: vi.fn(async () => ({
        balance: 0,
        pointsPerSale: 30,
        rupeesPerPoint: 1,
        minPurchase: 100,
        maxPurchase: 100000,
        validityDays: 365,
        expiryWarningDays: 10,
        imagePrice: 40,
        autoMaskPrice: 20,
        projectPrice: 80,
        reopenPrice: 9,
        nextExpiringPoints: null,
        nextExpiryAt: null,
        lots: [],
        recentActivity: [],
      })),
      pointsPayImageCredit: vi.fn(),
      pointsPayAutoMaskCredit: vi.fn(),
      // Answers with the account's refreshed options, exactly as the endpoint does — the
      // studio feeds them straight back into the gate's prices.
      pointsPayProjectCredit: vi.fn(async () => purchaseOptions),
      pointsPayProjectReopen: vi.fn(),
      requestMoreProjects: vi.fn(),
      getMyShadeCodeScheme: vi.fn(async () => ({
        prefix: "",
        infix: "",
        suffix: "",
        showNames: true,
      })),
      // Shop picks load best-effort on mount; default to none so the effect is a no-op.
      getRetailerCombos: vi.fn(async () => []),
      // The admin panel's model radios. Only fetched for an admin; two entries is
      // enough to prove the radios are built from the response rather than a list
      // baked into the client.
      listAiModels: vi.fn(async () => [
        { id: "google/nano-banana-pro", label: "Nano Banana Pro", family: "NANO_BANANA" },
        { id: "black-forest-labs/flux-2-max", label: "FLUX 2 Max", family: "FLUX" },
      ]),
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
      reportMask: vi.fn(async () => ({ id: "rep-1", issues: [], status: "NEW" })),
      // The board's closing page is the project's latest AI image, so the studio looks
      // for one on mount. None here — these tests are about getting a room open, and a
      // project that has been rendered is a later chapter than any of them.
      listRenders: vi.fn(async () => []),
      getProjectCombos: vi.fn(async () => []),
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
      if (status.status === "FAILED") {
        throw new PollFailedError(status.failureReason, status.failureStage);
      }
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

  /**
   * An oversized photo is no longer refused — it is shrunk in the browser (see
   * selectFile). This suite stubs getContext to null, which is a browser that
   * cannot do that, so what it pins is the FALLBACK: say so plainly, and upload
   * nothing. The shrink itself is unit-tested in lib/__tests__/image-upload.
   */
  it("says so and uploads nothing when an oversized photo cannot be shrunk here", async () => {
    const { container } = render(<Visualizer initialName="Test room" />);
    await screen.findByText("Add a photo of the room");

    await chooseFile(container, makeFile("huge.jpg", "image/jpeg", 10 * 1024 * 1024 + 1));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That photo is too large to open on this device.",
    );
    expect(api.uploadImage).not.toHaveBeenCalled();
    // Still on the drop zone — nothing was created.
    expect(screen.getByText("Add a photo of the room")).toBeInTheDocument();
  });

  it("leaves a photo under the limit completely alone", async () => {
    const { container } = render(<Visualizer initialName="Test room" />);
    await screen.findByText("Add a photo of the room");

    // Well under the cap, so no re-encode is attempted — which matters here
    // because this suite has no working canvas: reaching the shrink path at all
    // would fail, and the upload going through is the proof it was not reached.
    const picked = makeFile("room.jpg", "image/jpeg", 512 * 1024);
    await chooseFile(container, picked);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(api.uploadImage).toHaveBeenCalled();
    // The very same File object, not a re-encoded copy of it.
    expect(vi.mocked(api.uploadImage).mock.calls[0]?.[0]).toBe(picked);
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
    // Non-admins send only the mask-mode product choice (AUTO by default).
    expect(api.requestSegmentation).toHaveBeenCalledWith("p-1", { maskMode: "AUTO" });
  });

  it("keeps the confirm prompt for a retry when the upload fails", async () => {
    vi.mocked(api.uploadImage).mockRejectedValueOnce(new Error("Network request failed"));
    const { container } = render(<Visualizer initialName="Test room" />);
    await screen.findByText("Add a photo of the room");

    // chooseFile picks the photo AND clicks "Continue" — this first attempt fails.
    await chooseFile(container, makeFile("room.jpg", "image/jpeg"));

    // The failure is shown AND the confirm prompt survives, so the user can
    // retry without re-picking the photo (they used to be stranded on a dead
    // canvas with no button at all).
    expect(await screen.findByRole("alert")).toHaveTextContent("Network request failed");
    const retry = screen.getByRole("button", { name: /Continue with this image/i });
    expect(screen.getByRole("button", { name: /Choose a different photo/i })).toBeInTheDocument();

    // Retrying re-uploads and the flow completes normally.
    await act(async () => {
      fireEvent.click(retry);
    });
    expect(api.uploadImage).toHaveBeenCalledTimes(2);
    // Same contract as the first attempt: non-admins send the mask-mode choice.
    expect(api.requestSegmentation).toHaveBeenCalledWith("p-1", { maskMode: "AUTO" });
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

    // simulateFailure rides along as an explicit NONE, and the two model knobs as
    // explicit blanks. The backend keeps whatever it was last given, so an omitted
    // field would silently carry a rehearsal — or a model pinned for one comparison —
    // from one run into every run after it.
    expect(api.requestSegmentation).toHaveBeenCalledWith("p-1", {
      cleanImage: false,
      maskMode: "AUTO",
      simulateFailure: "NONE",
      cleanModel: "",
      maskModel: "",
    });
  });

  it("an admin can make the models fail on purpose, and the choice is sent", async () => {
    // Waiting for Nano Banana to have a bad day is not a test plan: the two recovery
    // paths (run fails at the clean, or the walls come back empty) are otherwise
    // unreachable on demand.
    const { container } = render(<Visualizer initialName="Test room" isAdmin />);
    await screen.findByText("Add a photo of the room");

    await act(async () => {
      fireEvent.change(fileInput(container), {
        target: { files: [makeFile("room.jpg", "image/jpeg")] },
      });
    });
    const confirm = await screen.findByRole("button", { name: /Continue with this image/i });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Make the AI models fail/i), {
        target: { value: "MASK" },
      });
    });
    await act(async () => {
      fireEvent.click(confirm);
    });

    expect(api.requestSegmentation).toHaveBeenCalledWith("p-1", {
      cleanImage: true,
      maskMode: "AUTO",
      simulateFailure: "MASK",
      cleanModel: "",
      maskModel: "",
    });
  });

  it("an admin can run each half of the pipeline on a chosen model", async () => {
    // Comparing two image models used to mean editing the server config, restarting
    // and re-uploading the photo. The two stages are picked separately because they
    // reward different things — one holds a building still, the other fills flat
    // colour to an edge.
    const { container } = render(<Visualizer initialName="Test room" isAdmin />);
    await screen.findByText("Add a photo of the room");

    await act(async () => {
      fireEvent.change(fileInput(container), {
        target: { files: [makeFile("room.jpg", "image/jpeg")] },
      });
    });
    const confirm = await screen.findByRole("button", { name: /Continue with this image/i });

    // The radios are built from what the backend said it will accept, not from a
    // list baked into the studio — so the FLUX option only exists because the mocked
    // endpoint named it.
    await screen.findByText("Clean the photo with");
    const radio = (group: string, value: string) => {
      const found = container.querySelector<HTMLInputElement>(
        `input[type="radio"][name="${group}"][value="${value}"]`,
      );
      if (!found) throw new Error(`No ${group} radio for ${value}`);
      return found;
    };

    await act(async () => {
      fireEvent.click(radio("clean-model", "black-forest-labs/flux-2-max"));
    });
    await act(async () => {
      fireEvent.click(radio("mask-model", "google/nano-banana-pro"));
    });
    await act(async () => {
      fireEvent.click(confirm);
    });

    expect(api.requestSegmentation).toHaveBeenCalledWith("p-1", {
      cleanImage: true,
      maskMode: "AUTO",
      simulateFailure: "NONE",
      cleanModel: "black-forest-labs/flux-2-max",
      maskModel: "google/nano-banana-pro",
    });
  });

  it("a non-admin is never offered the model radios, nor asks for the list", async () => {
    const { container } = render(<Visualizer initialName="Test room" />);
    await screen.findByText("Add a photo of the room");
    await act(async () => {
      fireEvent.change(fileInput(container), {
        target: { files: [makeFile("room.jpg", "image/jpeg")] },
      });
    });
    await screen.findByRole("button", { name: /Continue with this image/i });

    expect(screen.queryByText("Clean the photo with")).not.toBeInTheDocument();
    // The endpoint is ROLE_ADMIN only — asking would just be a 403 on every load.
    expect(api.listAiModels).not.toHaveBeenCalled();
  });

  it("keeps the failure knob away from non-admins", async () => {
    const { container } = render(<Visualizer initialName="Test room" />);
    await screen.findByText("Add a photo of the room");
    await act(async () => {
      fireEvent.change(fileInput(container), {
        target: { files: [makeFile("room.jpg", "image/jpeg")] },
      });
    });
    await screen.findByRole("button", { name: /Continue with this image/i });

    expect(screen.queryByLabelText(/Make the AI models fail/i)).not.toBeInTheDocument();
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
    expect(api.requestSegmentation).toHaveBeenCalledWith("p-1", { maskMode: "AUTO" });
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

/**
 * Buying an extra project happens HERE and nowhere else — at the upload that ran past the
 * allowance, where there is a room to spend it on. The plan page and the dashboard banner
 * now only say so. What the buyer is told before paying is the other half: the window is
 * finite, so the length and the date both have to be on screen before the button is.
 */
describe("Visualizer — buying one extra project", () => {
  const limitReached = () =>
    new HttpError(402, "You've used this month's projects.", undefined, "PROJECT_LIMIT_REACHED");

  /**
   * Fund the points balance for the tests that mean to exercise the points rail.
   *
   * The shared fixture holds ZERO points, and the points button is now gated on the
   * balance covering the price — because it always was, server-side: pressing it on an
   * empty balance returned 402, and for a CUSTOMER account (who cannot hold points at
   * all) 403. A test that clicks a button no real account could use proves nothing.
   */
  const withPoints = (balance: number) =>
    vi.mocked(api.getProjectPurchaseOptions).mockResolvedValue({
      subscribed: true,
      pricingPlan: "STARTER",
      projectPricePoints: 80,
      projectPricePaise: 9900,
      reopenPricePoints: 9,
      reopenPricePaise: 900,
      pointsBalance: balance,
      validDays: 30,
      availableCredits: 0,
    });

  it("quotes the point price and the validity window before taking the payment", async () => {
    withPoints(80);
    vi.mocked(api.createProject).mockRejectedValueOnce(limitReached());

    const { container } = render(<Visualizer initialName="Test room" />);
    await screen.findByText("Add a photo of the room");
    await chooseFile(container, makeFile("room.jpg", "image/jpeg"));

    expect(await screen.findByText(/Monthly projects used up/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Spend 80 points/i })).toBeInTheDocument();
    // Both rails, because this is now the only place a project is sold — a shop out of
    // allowance and holding no points must not have to leave a half-finished upload to
    // find the card route on another page.
    expect(screen.getByRole("button", { name: /pay ₹99 by card/i })).toBeInTheDocument();
    // 30 days from the served options, and the date they run to — a length alone leaves
    // the buyer counting, and a date alone leaves them working out whether it is generous.
    // The app's one date format (see lib/dates) — short month, always with the year.
    const until = new Date(Date.now() + 30 * 86_400_000)
      .toLocaleDateString("en-IN", {
        day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata",
      });
    expect(screen.getByText(new RegExp(`Valid 30 days from purchase.*${until}`))).toBeInTheDocument();
  });

  it("spends the points and re-runs the blocked upload", async () => {
    withPoints(80);
    vi.mocked(api.createProject).mockRejectedValueOnce(limitReached());

    const { container } = render(<Visualizer initialName="Test room" />);
    await screen.findByText("Add a photo of the room");
    await chooseFile(container, makeFile("room.jpg", "image/jpeg"));

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: /Spend 80 points/i }));
    });

    expect(api.pointsPayProjectCredit).toHaveBeenCalledTimes(1);
    // The photo is never re-uploaded — the project is created against the image already on
    // the server, which is the whole reason the pending image id is kept.
    expect(api.uploadImage).toHaveBeenCalledTimes(1);
    expect(api.createProject).toHaveBeenCalledTimes(2);
    expect((await screen.findAllByText("Walls detected")).length).toBeGreaterThan(0);
  });

  /**
   * With no points to spend, the card is the only rail that works — so it must be the
   * one offered, and offered as the primary action rather than as an "or".
   *
   * This is the ordinary case for the account this prompt exists for: a CUSTOMER who
   * signed up by email with no shop behind them can never hold points, and used to be
   * shown "Spend 80 points" in the brass button and the card route underneath it as an
   * afterthought. The button they were steered to was the one guaranteed to fail.
   */
  it("offers only the card when there are no points to spend", async () => {
    withPoints(0);
    vi.mocked(api.createProject).mockRejectedValueOnce(limitReached());

    const { container } = render(<Visualizer initialName="Test room" />);
    await screen.findByText("Add a photo of the room");
    await chooseFile(container, makeFile("room.jpg", "image/jpeg"));

    expect(await screen.findByText(/Monthly projects used up/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Spend 80 points/i })).not.toBeInTheDocument();
    // Named as the action, not as an alternative to something that isn't there.
    expect(screen.getByRole("button", { name: /Buy a project · ₹99/i })).toBeInTheDocument();
  });

  /**
   * The balance and the eligibility are different questions, and only the second one is
   * a rule. A customer's balance is zero today, so gating on the balance alone happens
   * to hide the rail from them — but that is a property of the data, not a guarantee,
   * and a non-retailer account that somehow carried a balance would be steered straight
   * back into the 403 the balance check was added to prevent.
   */
  it("keeps the points rail shut for an ineligible account that does hold a balance", async () => {
    vi.mocked(api.getProjectPurchaseOptions).mockResolvedValue({
      subscribed: false,
      pricingPlan: "FREE",
      projectPricePoints: 80,
      projectPricePaise: 9900,
      reopenPricePoints: 9,
      reopenPricePaise: 900,
      // Enough to pay, and still refused: points are not this account's to spend.
      pointsBalance: 500,
      pointsEligible: false,
      validDays: 30,
      availableCredits: 0,
    });
    vi.mocked(api.createProject).mockRejectedValueOnce(limitReached());

    const { container } = render(<Visualizer initialName="Test room" />);
    await screen.findByText("Add a photo of the room");
    await chooseFile(container, makeFile("room.jpg", "image/jpeg"));

    expect(await screen.findByText(/Monthly projects used up/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Spend 80 points/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Buy a project · ₹99/i })).toBeInTheDocument();
  });

  /** An eligible shop with the balance to cover it still gets the cheaper rail. */
  it("keeps the points rail open for an eligible account", async () => {
    vi.mocked(api.getProjectPurchaseOptions).mockResolvedValue({
      subscribed: true,
      pricingPlan: "STARTER",
      projectPricePoints: 80,
      projectPricePaise: 9900,
      reopenPricePoints: 9,
      reopenPricePaise: 900,
      pointsBalance: 500,
      pointsEligible: true,
      validDays: 30,
      availableCredits: 0,
    });
    vi.mocked(api.createProject).mockRejectedValueOnce(limitReached());

    const { container } = render(<Visualizer initialName="Test room" />);
    await screen.findByText("Add a photo of the room");
    await chooseFile(container, makeFile("room.jpg", "image/jpeg"));

    expect(await screen.findByRole("button", { name: /Spend 80 points/i })).toBeInTheDocument();
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
    expect(api.requestSegmentation).toHaveBeenLastCalledWith("p-1", { maskMode: "AUTO" });
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

/**
 * The clean landed, the walls didn't.
 *
 * The backend stopped failing this case: the photo is cleaned, repainted and paid
 * for, so the project comes back SEGMENTED with no regions and `autoMaskFailed`.
 * What that costs is a room that looks finished and has nothing on it — so the
 * studio has to say, without being asked, that the walls are the user's to mark and
 * that the team already knows. Everything pinned here is about that being SAID.
 */
describe("Visualizer — a run that cleaned the photo but found no walls", () => {
  const HANDED_OVER = {
    status: "SEGMENTED" as const,
    maskMode: "AUTO" as const,
    autoMaskFailed: true,
    cleanedImageUrl: "https://media.example.com/rooms/img-1-clean.jpg",
    regions: [],
  };

  it("hands the room over with instructions instead of an error", async () => {
    vi.mocked(api.getProjectStatus).mockResolvedValue(projectDetail(HANDED_OVER));

    const { container } = render(<Visualizer initialName="Test room" />);
    await chooseFile(container, makeFile("room.jpg", "image/jpeg"));

    // The instruction, and the reassurance that reporting it is already done — the
    // user is not being asked to chase anything. It names the CUSTOM MASKS rather
    // than "the walls" because that is what the failure actually is: the photo came
    // out, and the surfaces the studio would have cut from it did not.
    expect(await screen.findByText(/couldn.t create the custom wall masks/i)).toBeInTheDocument();
    expect(screen.getByText(/already been sent to our tech team/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add a wall" })).toBeInTheDocument();

    // Not an error and not a success: claiming "Walls detected" over an empty room
    // is how this went unnoticed in the first place.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Walls detected")).not.toBeInTheDocument();
    expect(screen.getAllByText(/walls not detected/i).length).toBeGreaterThan(0);
  });

  it("the card can be waved away, and the standing explanation survives it", async () => {
    vi.mocked(api.getProjectStatus).mockResolvedValue(projectDetail(HANDED_OVER));

    const { container } = render(<Visualizer initialName="Test room" />);
    await chooseFile(container, makeFile("room.jpg", "image/jpeg"));

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Not now" }));
    });

    expect(screen.queryByText(/couldn.t pick out the walls/i)).not.toBeInTheDocument();
    // Dismissing the instruction must not dismiss the FACT: the topbar still says
    // why this room has nothing on it.
    expect(screen.getAllByText(/walls not detected/i).length).toBeGreaterThan(0);
  });

  it("still offers the report, so a user who disagrees can say more", async () => {
    // The pipeline has filed its own report already. That one says "detection
    // returned nothing"; a person can add what the photo actually looked like, and
    // the backend folds their words into the same row rather than duplicating it.
    vi.mocked(api.getProjectStatus).mockResolvedValue(projectDetail(HANDED_OVER));

    const { container } = render(<Visualizer initialName="Test room" />);
    await chooseFile(container, makeFile("room.jpg", "image/jpeg"));

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: /Report a problem/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText(/The walls weren't detected properly/i));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send report" }));
    });

    expect(api.reportMask).toHaveBeenCalledWith("p-1", {
      issues: ["MASK_NOT_GENERATED_PROPERLY"],
    });
  });
});

/**
 * The report button is the ONLY way the team learns a run came out wrong — a run with
 * the walls in the wrong places still returns SEGMENTED and passes every check the
 * backend makes. So "is it on screen" is the whole feature, and it was not: the button
 * was gated on the pipeline reaching the "recolor" stage, which only happens when a
 * colour is applied or a saved project is reopened, never when a run finishes.
 */
describe("Visualizer — reporting a bad run", () => {
  it("offers the report as soon as a run finishes, before any colour is applied", async () => {
    const { container } = render(<Visualizer initialName="Test room" />);
    await chooseFile(container, makeFile("room.jpg", "image/jpeg"));

    expect((await screen.findAllByText("Walls detected")).length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: /Not right\? Report a problem/i }),
    ).toBeInTheDocument();
  });

  it("offers it on a run that detected NOTHING — the case most worth reporting", async () => {
    // A MANUAL-mode run, or one where wall detection found nothing, comes back
    // SEGMENTED with zero regions. There is no wall to put a colour on, so the old
    // gate made it impossible to report that no walls were found.
    vi.mocked(api.getProjectStatus).mockResolvedValue(
      projectDetail({ status: "SEGMENTED", regions: [] }),
    );

    const { container } = render(<Visualizer initialName="Test room" />);
    await chooseFile(container, makeFile("room.jpg", "image/jpeg"));

    expect(
      await screen.findByRole("button", { name: /Not right\? Report a problem/i }),
    ).toBeInTheDocument();
  });

  it("offers it on a run that TIMED OUT — no stage named, still nothing to look at", async () => {
    // The backend names a stage only when it reaches a verdict. A run that never came
    // back has no verdict, so `failedStage` stayed null, `masksReady` stayed false, and
    // the button was hidden behind a banner reading "timed out, please try again" — no
    // walls and no way to say so, on the exact screen the report exists for.
    vi.mocked(api.getProjectStatus).mockResolvedValue(projectDetail({ status: "SEGMENTING" }));

    const { container } = render(<Visualizer initialName="Test room" />);
    await chooseFile(container, makeFile("room.jpg", "image/jpeg"));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    // Both routes in: the quiet one in the panel, and "Report this" beside the banner.
    expect(
      await screen.findByRole("button", { name: /Not right\? Report a problem/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Report this$/ })).toBeInTheDocument();
  });

  it("offers it when the run dies in transport rather than reaching a verdict", async () => {
    // A 500 from the status endpoint leaves the same dead end as a failure: a project
    // exists, no masks were made, and the user is looking at an error.
    vi.mocked(api.getProjectStatus).mockRejectedValue(new Error("Network request failed"));

    const { container } = render(<Visualizer initialName="Test room" />);
    await chooseFile(container, makeFile("room.jpg", "image/jpeg"));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /Not right\? Report a problem/i }),
    ).toBeInTheDocument();
  });

  it("stays hidden while a run is genuinely still in flight", async () => {
    // The real "in flight": the poll has not settled either way. Nothing has been
    // produced to judge yet, and offering to report a run that may still succeed
    // would collect noise instead of faults.
    pollMock.mockImplementation((() => new Promise(() => {})) as typeof pollUntilSegmented);

    const { container } = render(<Visualizer initialName="Test room" />);
    await chooseFile(container, makeFile("room.jpg", "image/jpeg"));

    expect((await screen.findAllByText(/Detecting walls/i)).length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: /Not right\? Report a problem/i }),
    ).not.toBeInTheDocument();
  });

  it("sends the ticked issue and then acknowledges it", async () => {
    const { container } = render(<Visualizer initialName="Test room" />);
    await chooseFile(container, makeFile("room.jpg", "image/jpeg"));

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: /Report a problem/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText(/The walls weren't detected properly/i));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send report" }));
    });

    expect(api.reportMask).toHaveBeenCalledWith("p-1", {
      issues: ["MASK_NOT_GENERATED_PROPERLY"],
    });
    expect(await screen.findByText(/Thank you — we have it/i)).toBeInTheDocument();
  });

  it("offers the report on a run that FAILED — the run with nothing to look at", async () => {
    // The hardest case to reach and the one worth hearing about most: a failed run
    // produces no canvas and no masks, so every "has the studio finished" signal the
    // button used to depend on stays false forever.
    vi.mocked(api.getProjectStatus).mockResolvedValue(
      projectDetail({
        status: "FAILED",
        failureStage: "MASK",
        failureReason: "We couldn't pick out the walls in this photo.",
      }),
    );

    const { container } = render(<Visualizer initialName="Test room" />);
    await chooseFile(container, makeFile("room.jpg", "image/jpeg"));

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Report this" }));
    });
    // Already ticked from the stage the backend named — the user just presses Send.
    expect(screen.getByLabelText(/The walls weren't detected properly/i)).toBeChecked();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send report" }));
    });

    expect(api.reportMask).toHaveBeenCalledWith("p-1", {
      issues: ["MASK_NOT_GENERATED_PROPERLY"],
    });
  });

  it("ticks the clean-up box when the CLEAN stage is what failed", async () => {
    // No cleaned image exists on this run — and that IS the complaint, so the option
    // has to be offered rather than hidden as "the cleaner never ran".
    vi.mocked(api.getProjectStatus).mockResolvedValue(
      projectDetail({
        status: "FAILED",
        failureStage: "CLEAN",
        failureReason: "The photo clean-up didn't come through.",
      }),
    );

    const { container } = render(<Visualizer initialName="Test room" />);
    await chooseFile(container, makeFile("room.jpg", "image/jpeg"));

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Report this" }));
    });
    expect(screen.getByLabelText(/photo clean-up didn't come through/i)).toBeChecked();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send report" }));
    });

    expect(api.reportMask).toHaveBeenCalledWith("p-1", {
      issues: ["IMAGE_NOT_CLEANED_PROPERLY"],
    });
  });

  it("ticks nothing in advance for a timeout, because nothing is known to be wrong", async () => {
    // The report IS offered on a timeout now — see above; a user with no walls and no
    // channel is the worse failure. But the reason it was once withheld still holds:
    // a timeout is not a verdict, so there is no issue to pre-tick and Send. The user
    // has to choose one, which keeps a queue of "it was slow" out of a queue about
    // masks, and the admin sees the run's real status on the report either way.
    vi.mocked(api.getProjectStatus).mockResolvedValue(projectDetail({ status: "SEGMENTING" }));

    const { container } = render(<Visualizer initialName="Test room" />);
    await chooseFile(container, makeFile("room.jpg", "image/jpeg"));

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: /^Report this$/ }));
    });

    expect(screen.getByLabelText(/The walls weren't detected properly/i)).not.toBeChecked();
    expect(screen.getByLabelText(/Something else/i)).not.toBeChecked();
    // And Send stays shut until they say what went wrong.
    expect(screen.getByRole("button", { name: "Send report" })).toBeDisabled();
  });

  it("keeps retry as the first answer to a timeout, with the report beside it", async () => {
    // The earlier decision was right that retrying is usually what a timeout needs.
    // Offering the report does not displace that — both are on screen, retry first.
    vi.mocked(api.getProjectStatus).mockResolvedValue(projectDetail({ status: "SEGMENTING" }));

    const { container } = render(<Visualizer initialName="Test room" />);
    await chooseFile(container, makeFile("room.jpg", "image/jpeg"));

    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: /Try again/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Report this$/ })).toBeInTheDocument();
  });

  it("replaces the button with an acknowledgement so the same complaint isn't sent twice", async () => {
    const { container } = render(<Visualizer initialName="Test room" />);
    await chooseFile(container, makeFile("room.jpg", "image/jpeg"));

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: /Report a problem/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText(/The walls weren't detected properly/i));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send report" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
    });

    expect(screen.getByText(/Reported — thank you/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Not right\? Report a problem/i }),
    ).not.toBeInTheDocument();
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

/**
 * The company picker lives in the topbar, beside Share and Download, and scopes
 * the shade list the whole colour panel is handed — so Colours, AI Suggest and
 * Custom cannot disagree about which company is in play. It used to be a filter
 * inside the Colours tab (plus a second, independent one on AI Suggest), which
 * narrowed the catalogue grid and nothing else.
 */
describe("Visualizer — company scope", () => {
  const TWO_BRANDS: PaintShade[] = [
    { code: "AP-1", name: "Blush Zephyr", hex: "#d98c8c", family: "Reds", lrv: 45, brand: "Asian Paints", finishes: [] },
    { code: "AP-2", name: "Sun Zephyr", hex: "#d9c78c", family: "Yellows", lrv: 62, brand: "Asian Paints", finishes: [] },
    { code: "BG-1", name: "Blush Quartz", hex: "#cf7f7f", family: "Reds", lrv: 42, brand: "Berger", finishes: [] },
    { code: "BG-2", name: "Sun Quartz", hex: "#cfbf7f", family: "Yellows", lrv: 60, brand: "Berger", finishes: [] },
  ];

  it("narrows the colour panel to the chosen company", async () => {
    const user = userEvent.setup();
    render(<Visualizer initialName="Test room" shades={TWO_BRANDS} />);
    await screen.findByText("Add a photo of the room");

    // Unscoped: both companies' shades are in the grid.
    expect(screen.queryAllByRole("button", { name: /Zephyr/ }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("button", { name: /Quartz/ }).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /Company/ }));
    await user.click(screen.getByRole("checkbox", { name: "Berger" }));

    expect(screen.queryAllByRole("button", { name: /Quartz/ }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("button", { name: /Zephyr/ })).toHaveLength(0);

    // And back — "All companies" restores the full list.
    await user.click(screen.getByRole("button", { name: "All companies" }));
    expect(screen.queryAllByRole("button", { name: /Zephyr/ }).length).toBeGreaterThan(0);
  });

  /**
   * The point of making it multi-select: a shop that stocks two brands should be
   * able to say so, instead of picking one and losing the other.
   */
  it("keeps every ticked company in the panel at once", async () => {
    const user = userEvent.setup();
    render(<Visualizer initialName="Test room" shades={TWO_BRANDS} />);
    await screen.findByText("Add a photo of the room");

    await user.click(screen.getByRole("button", { name: /Company/ }));
    await user.click(screen.getByRole("checkbox", { name: "Berger" }));
    expect(screen.queryAllByRole("button", { name: /Zephyr/ })).toHaveLength(0);

    await user.click(screen.getByRole("checkbox", { name: "Asian Paints" }));
    expect(screen.queryAllByRole("button", { name: /Quartz/ }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("button", { name: /Zephyr/ }).length).toBeGreaterThan(0);

    // Unticking one leaves the other in force, rather than falling back to all.
    await user.click(screen.getByRole("checkbox", { name: "Berger" }));
    expect(screen.queryAllByRole("button", { name: /Zephyr/ }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("button", { name: /Quartz/ })).toHaveLength(0);
  });

  it("hides the picker when there is only one company to choose", async () => {
    render(
      <Visualizer
        initialName="Test room"
        shades={TWO_BRANDS.filter((s) => s.brand === "Asian Paints")}
      />,
    );
    await screen.findByText("Add a photo of the room");

    expect(screen.queryByRole("button", { name: /Company/ })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// The canvas is the point of this screen
// ---------------------------------------------------------------------------
//
// Everything the studio overlays on the photograph is in the way of the one thing
// the customer came to look at. These pin the two decisions that follow from that:
// the colour board sits on the canvas as an icon until it is asked for, and there
// is a way to see the room with nothing on top of it at all.

describe("Visualizer — keeping the room visible", () => {
  const SEGMENTED = {
    status: "SEGMENTED" as const,
    cleanedImageUrl: "https://media.example.com/rooms/img-1-clean.jpg",
    regions: SEGMENTED_REGIONS,
  };

  it("keeps the colour board collapsed to its icon until it is opened", async () => {
    vi.mocked(api.getProjectStatus).mockResolvedValue(projectDetail(SEGMENTED));

    const { container } = render(<Visualizer initialName="Test room" />);
    await chooseFile(container, makeFile("room.jpg", "image/jpeg"));

    const icon = await screen.findByRole("button", { name: "Open the colour board" });
    expect(screen.queryByRole("button", { name: "Add to PDF" })).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(icon);
    });

    expect(screen.getByRole("button", { name: "Add to PDF" })).toBeInTheDocument();

    // And it goes away again — a tray that cannot be put back is not minimised.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Minimise the colour board" }));
    });
    expect(screen.queryByRole("button", { name: "Add to PDF" })).not.toBeInTheDocument();
  });

  it("offers the room full screen once there is a room to look at", async () => {
    vi.mocked(api.getProjectStatus).mockResolvedValue(projectDetail(SEGMENTED));

    const { container } = render(<Visualizer initialName="Test room" />);
    await chooseFile(container, makeFile("room.jpg", "image/jpeg"));

    expect(
      await screen.findByRole("button", { name: "See this room full screen" }),
    ).toBeInTheDocument();
  });

  it("no longer offers Brighten — the photo's own light is what gets painted", async () => {
    vi.mocked(api.getProjectStatus).mockResolvedValue(projectDetail(SEGMENTED));

    const { container } = render(<Visualizer initialName="Test room" />);
    await chooseFile(container, makeFile("room.jpg", "image/jpeg"));

    await screen.findByRole("button", { name: "Open the colour board" });
    expect(screen.queryByRole("group", { name: /Brighten/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Radiant" })).not.toBeInTheDocument();
  });
});

/**
 * The GUEST at the end of their code.
 *
 * A guest is an anonymous session a shop's access code opened — no account, no
 * wallet. When they use up the projects on that code the backend answers 402 with
 * NO machine-readable code (ProjectService#createGuestProject throws
 * QuotaExceededException), which lands on the studio's generic `limitReached`
 * branch — the same branch a signed-in account reaches.
 *
 * That shared branch is the trap. Everything it offers an account is unavailable
 * to a guest: the two buy buttons are driven by purchaseOptions, which is fetched
 * `if (!guest)` and so stays null, and the "unlock with a shop code" link leads to
 * /unlock, which for someone already inside a code's session only ever re-resumes
 * the session they are sitting in. A guest therefore reached the end of their code
 * and was shown exactly one action, with nothing behind it.
 *
 * The real exit is an account: signing up claims the rooms already made under the
 * code (linkGuestProjectsToUser) instead of leaving them with the guest cookie.
 */
describe("Visualizer — a guest who has used up their code", () => {
  /** What the backend actually sends: 402, and deliberately no `code`. */
  const guestQuotaSpent = () =>
    new HttpError(
      402,
      "Your access includes one project. Ask the shop to add another, or sign up to keep going.",
    );

  async function guestAtTheirLimit() {
    vi.mocked(guestApi.uploadImage).mockResolvedValue(UPLOADED);
    vi.mocked(guestApi.createProject).mockRejectedValueOnce(guestQuotaSpent());

    const { container } = render(<Visualizer initialName="Test room" guest />);
    await screen.findByText("Add a photo of the room");
    await chooseFile(container, makeFile("room.jpg", "image/jpeg"));
    return container;
  }

  it("offers an account that keeps the room, not a code they are already inside", async () => {
    await guestAtTheirLimit();

    expect(
      await screen.findByRole("link", { name: /Create a free account to keep this room/i }),
    ).toHaveAttribute("href", "/join");
    // The dead end this replaces. /unlock cannot help someone whose session a code
    // already opened, and it was the ONLY action on screen for them.
    expect(
      screen.queryByRole("link", { name: /Unlock with a shop code/i }),
    ).not.toBeInTheDocument();
  });

  it("still passes on what the shop can do, in the backend's own words", async () => {
    await guestAtTheirLimit();

    expect(await screen.findByText(/Ask the shop to add another/i)).toBeInTheDocument();
  });

  it("quotes no purchase validity, having nothing to sell a guest", async () => {
    await guestAtTheirLimit();

    await screen.findByRole("link", { name: /Create a free account/i });
    // purchaseOptions is never fetched for a guest, so this note could only ever
    // have quoted the hardcoded default — a promise about a project they cannot buy.
    expect(screen.queryByText(/Valid \d+ days from purchase/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Buy a project/i })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// A locked project's colour panel
// ---------------------------------------------------------------------------
//
// Closing a project, or running out of days on it, used to leave the two browsing
// tabs on screen offering repaints the server refuses. These pin the swap: a locked
// project gets one tab — the combinations it already handed over — the combinations
// still apply to the preview, and nothing about them is saved.

describe("Visualizer — a locked project shows the colours it handed over", () => {
  const PANEL_SHADES: PaintShade[] = [
    { code: "AP-1", name: "Blush Zephyr", hex: "#d98c8c", family: "Reds", lrv: 45, brand: "Asian Paints", finishes: [] },
    { code: "AP-2", name: "Sun Zephyr", hex: "#d9c78c", family: "Yellows", lrv: 62, brand: "Asian Paints", finishes: [] },
  ];

  const CLOSED = projectDetail({
    status: "SEGMENTED",
    regions: SEGMENTED_REGIONS,
    readOnly: true,
    readOnlyReason: "This project is finished.",
    closedAt: "2026-07-01T00:00:00Z",
  });

  const BOARD_COMBOS = [
    {
      id: "combo-1",
      boardIndex: 1,
      pageIndex: 0,
      title: null,
      rendered: false,
      shades: [
        { regionId: 11, regionLabel: "Left feature wall", shadeCode: "AP-1", shadeName: "Blush Zephyr", hex: "#d98c8c" },
        { regionId: 12, regionLabel: "Window trim", shadeCode: "AP-2", shadeName: "Sun Zephyr", hex: "#d9c78c" },
      ],
    },
  ];

  /** Open p-1 in whatever state the mocks describe, and let the load settle. */
  async function openProject() {
    render(<Visualizer projectId="p-1" shades={PANEL_SHADES} />);
    await screen.findAllByRole("tab");
  }

  beforeEach(() => {
    vi.mocked(api.getProject).mockResolvedValue(CLOSED);
    vi.mocked(api.getProjectCombos).mockResolvedValue(BOARD_COMBOS);
  });

  it("replaces both browsing tabs with the customer's own selection", async () => {
    await openProject();

    await waitFor(() =>
      expect(screen.getAllByRole("tab").map((t) => t.textContent?.trim())).toEqual([
        "Your Selection",
      ]),
    );
    expect(screen.queryByRole("tab", { name: /AI Suggest/ })).not.toBeInTheDocument();
    // The search that went with the catalogue goes with it.
    expect(screen.queryByLabelText("Search by name or code")).not.toBeInTheDocument();
  });

  it("shows each colour against the wall the board put it on", async () => {
    await openProject();

    expect(
      await screen.findByRole("button", { name: /^Left feature wall: Blush Zephyr \(AP-1\)/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Window trim: Sun Zephyr \(AP-2\)/ }),
    ).toBeInTheDocument();
  });

  /**
   * The whole point of the tab. A locked project refused every apply, so its saved
   * colours could be read and not SEEN — on the one screen whose job is showing the
   * room in them.
   */
  it("repaints the room from a saved combination, and saves nothing", async () => {
    const user = userEvent.setup();
    await openProject();

    await user.click(await screen.findByRole("button", { name: "Apply all" }));

    // The dock names the colour that landed, so the canvas really did change.
    await waitFor(() => expect(screen.getAllByText("Sun Zephyr").length).toBeGreaterThan(0));
    // ...and the autosave never ran: a locked project's saved colours are what the
    // customer finished with.
    expect(api.updateRegionColors).not.toHaveBeenCalled();
  });

  it("offers no wall tools, every one of which the backend would refuse", async () => {
    await openProject();
    await screen.findByRole("button", { name: "Apply all" });

    expect(screen.queryByRole("button", { name: "+ Wall" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Remove /i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Fix the shape of /i })).not.toBeInTheDocument();
  });

  it("offers no 'Keep original', which would ask them to undo a finished room", async () => {
    const user = userEvent.setup();
    await openProject();

    await user.click(await screen.findByRole("button", { name: "Apply all" }));
    await waitFor(() => expect(screen.getAllByText("Sun Zephyr").length).toBeGreaterThan(0));

    expect(screen.queryByRole("button", { name: /Keep original/i })).not.toBeInTheDocument();
  });

  it("gives a live project both browsing tabs and no selection tab", async () => {
    vi.mocked(api.getProject).mockResolvedValue(
      projectDetail({ status: "SEGMENTED", regions: SEGMENTED_REGIONS }),
    );
    await openProject();

    await waitFor(() =>
      expect(screen.getAllByRole("tab").map((t) => t.textContent?.trim())).toEqual([
        "Colours",
        "AI Suggest",
      ]),
    );
    // Nothing to read the boards for while the whole catalogue is open.
    expect(api.getProjectCombos).not.toHaveBeenCalled();
    // ...and the wall tools the locked room does without are all here, which is what
    // makes their absence up there mean something.
    expect(screen.getByRole("button", { name: "+ Wall" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Remove /i }).length).toBeGreaterThan(0);
  });
});
