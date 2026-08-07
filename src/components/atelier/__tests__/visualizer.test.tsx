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
import { api, HttpError } from "@/lib/api";
import { Visualizer } from "../visualizer";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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
    reopenPricePaise: 1000,
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

    expect(api.requestSegmentation).toHaveBeenCalledWith("p-1", {
      cleanImage: false,
      maskMode: "AUTO",
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

  it("quotes the point price and the validity window before taking the payment", async () => {
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
    const until = new Date(Date.now() + 30 * 86_400_000)
      .toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
    expect(screen.getByText(new RegExp(`Valid 30 days from purchase.*${until}`))).toBeInTheDocument();
  });

  it("spends the points and re-runs the blocked upload", async () => {
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
   * A CUSTOMER who signed up on their own reaches this gate too, and points are not a
   * thing they can hold — the backend refuses every non-retailer outright. Leading with
   * "Spend 80 points" put the one button that could only ever 403 on top, with the rail
   * that works demoted underneath it as "or pay by card".
   */
  it("drops the points rail and leads with the card when the account cannot hold points", async () => {
    vi.mocked(api.getProjectPurchaseOptions).mockResolvedValueOnce({
      subscribed: false,
      pricingPlan: "FREE",
      projectPricePoints: 80,
      projectPricePaise: 9900,
      reopenPricePoints: 9,
      reopenPricePaise: 1000,
      pointsBalance: 0,
      pointsEligible: false,
      validDays: 30,
      availableCredits: 0,
    });
    // Untagged 402 — the refusal an account with no shop and no plan behind it gets.
    vi.mocked(api.createProject).mockRejectedValueOnce(
      new HttpError(402, "Buy a single project for ₹99 to keep going."),
    );

    const { container } = render(<Visualizer initialName="Test room" />);
    await screen.findByText("Add a photo of the room");
    await chooseFile(container, makeFile("room.jpg", "image/jpeg"));

    expect(await screen.findByRole("button", { name: /Buy a project · ₹99/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /points/i })).not.toBeInTheDocument();
    // The code stays on offer — someone may have walked into a shop since.
    expect(screen.getByRole("link", { name: /Redeem a shop code/i })).toBeInTheDocument();
  });

  /** A shop keeps both rails: points are its cheaper one, and the card is the fallback. */
  it("keeps both rails for an account that can hold points", async () => {
    vi.mocked(api.createProject).mockRejectedValueOnce(
      new HttpError(402, "You've used your included project."),
    );

    const { container } = render(<Visualizer initialName="Test room" />);
    await screen.findByText("Add a photo of the room");
    await chooseFile(container, makeFile("room.jpg", "image/jpeg"));

    expect(await screen.findByRole("button", { name: /Buy a project · 80 points/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /pay ₹99 by card/i })).toBeInTheDocument();
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
