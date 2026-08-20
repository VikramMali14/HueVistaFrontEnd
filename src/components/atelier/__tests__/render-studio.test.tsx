// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ProjectCombo, ProjectDetail, ProjectRender } from "@/lib/types";

// vi.mock factories are hoisted above every const in the file, so the stubs are built
// inside the factory and read back through vi.mocked below.
vi.mock("@/lib/api", () => ({
  api: {
    getProject: vi.fn(),
    getProjectCombos: vi.fn(),
    listRenders: vi.fn(),
    requestRender: vi.fn(),
    getRender: vi.fn(),
    getAiCredits: vi.fn(),
    // Read on mount so a reprinted colour board carries the shop's own codes. Defaults
    // to "no pattern, names shown" — the plain manufacturer codes these tests assert on.
    getMyShadeCodeScheme: vi.fn(async () => ({
      prefix: "",
      infix: "",
      suffix: "",
      showNames: true,
      showRealCodes: true,
    })),
  },
  HttpError: class extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  },
}));

vi.mock("@/lib/payments", () => ({ buyAiCredits: vi.fn() }));

// Saving the finished picture fetches its bytes; jsdom has neither the network nor
// URL.createObjectURL. What the test cares about is that pressing the button asks for
// a real save at all — the anchor it replaced only ever navigated.
vi.mock("@/lib/download-image", () => ({ downloadRemoteImage: vi.fn(async () => true) }));

// The preview engine draws onto a canvas jsdom cannot give a context for. It is a
// convenience on this screen — the picker and the generate flow are what matter — so an
// inert double keeps the component mountable without pretending to render anything.
vi.mock("@/lib/canvas2d-recolor", () => ({
  Canvas2DRecolor: class {
    setImage() {}
    renderRegions() {}
    renderBase() {}
    exportPng() {
      return "";
    }
    dispose() {}
  },
}));

import { RenderStudio } from "../render-studio";
import { api as realApi, HttpError } from "@/lib/api";
import { buyAiCredits as realBuy } from "@/lib/payments";
import { downloadRemoteImage } from "@/lib/download-image";
import type { AiCreditSummary } from "@/lib/types";

const api = vi.mocked(realApi);
const buyAiCredits = vi.mocked(realBuy);

/** An empty AI wallet — the state a customer arrives in. */
const WALLET: AiCreditSummary = {
  balance: 0,
  eligible: true,
  pricePaise: 9900,
  listPricePaise: 19800,
  discountPercent: 50,
  minPurchase: 1,
  maxPurchase: 50,
  renderCost: 1,
  // The tiers the server sells, which is where every credit figure on the screen comes
  // from. The ordinary picture, and the one that gets printed.
  renderTiers: [
    { quality: "PREMIUM", credits: 1 },
    { quality: "LUXURY", credits: 2 },
  ],
  currency: "INR",
  recentActivity: [],
};

const PROJECT: ProjectDetail = {
  id: "p1",
  name: "Living room",
  status: "SEGMENTED",
  imageId: "i1",
  imageUrl: "https://cdn.test/room.jpg",
  cleanedImageUrl: "https://cdn.test/cleaned.jpg",
  regions: [
    { id: 1, label: "Main wall", category: "MAIN_WALL", displayOrder: 0, maskUrl: "https://cdn.test/m1.png" },
    { id: 2, label: "Trim", category: "TRIM", displayOrder: 1, maskUrl: "https://cdn.test/m2.png" },
  ],
  closedAt: "2026-08-01T10:00:00",
  boardsUsed: 2,
  boardsAllowed: 2,
  rendersUsed: 0,
  readOnly: true,
  reopenPricePaise: 9900,
};

/** Two boards of four — the eight combinations the closing flow is built on. */
const COMBOS: ProjectCombo[] = Array.from({ length: 8 }, (_, i) => ({
  id: `combo-${i}`,
  boardIndex: i < 4 ? 1 : 2,
  pageIndex: i % 4,
  title: `Scheme ${i + 1}`,
  rendered: false,
  shades: [
    { regionId: 1, regionLabel: "Main wall", shadeCode: `AP-${i}`, shadeName: "Beige", hex: "#e8d5b0" },
    { regionId: 2, regionLabel: "Trim", shadeCode: `AP-T${i}`, shadeName: "Clove", hex: "#4a362a" },
  ],
}));

const READY_RENDER: ProjectRender = {
  id: "r1",
  comboId: "combo-0",
  status: "READY",
  imageUrl: "https://cdn.test/render.jpg",
  timeOfDay: "DAY",
  borderMode: "KEEP_ORIGINAL",
  lighting: "NATURAL",
  furnishing: "KEEP",
  style: "MODERN",
};

beforeEach(() => {
  vi.clearAllMocks();
  api.getProject.mockResolvedValue(PROJECT);
  api.getProjectCombos.mockResolvedValue(COMBOS);
  api.listRenders.mockResolvedValue([]);
  // One credit in hand is the ORDINARY case now that every image is bought: a wallet at
  // zero is a screen showing a Buy button, which is a specific case a few tests below ask
  // for explicitly rather than the state the rest should be written against.
  api.getAiCredits.mockResolvedValue({ ...WALLET, balance: 1 });
});

describe("RenderStudio", () => {
  it("offers every combination the colour boards handed over", async () => {
    render(<RenderStudio projectId="p1" />);

    expect(await screen.findByText("Scheme 1")).toBeInTheDocument();
    // Pressed buttons in a group, not ARIA radios: the radio pattern announces
    // arrow-key navigation across one tab stop, and none is implemented here.
    const options = await screen.findAllByRole("button", { name: /Scheme/ });
    expect(options).toHaveLength(8);
    // Board order is the order the customer saw them in.
    expect(options[0]).toHaveAttribute("aria-pressed", "true");
  });

  it("sends the chosen combination and options to the server", async () => {
    api.requestRender.mockResolvedValue({ ...READY_RENDER, status: "QUEUED" });
    api.getRender.mockResolvedValue(READY_RENDER);
    render(<RenderStudio projectId="p1" />);

    await screen.findByText("Scheme 1");
    await userEvent.click(screen.getByRole("button", { name: /Scheme 3/ }));
    await userEvent.click(screen.getByRole("button", { name: "Night" }));
    await userEvent.click(screen.getByRole("button", { name: "Suggest borders" }));
    await userEvent.click(screen.getByRole("button", { name: /Make my image/ }));

    await waitFor(() =>
      expect(api.requestRender).toHaveBeenCalledWith("p1", {
        comboId: "combo-2",
        timeOfDay: "NIGHT",
        borderMode: "AI_SUGGESTED",
        lighting: "NATURAL",
        furnishing: "KEEP",
        style: "MODERN",
        // Nobody touched the quality row, so the cheapest tier travels — the one option
        // here that costs money must never be arrived at by default.
        quality: "PREMIUM",
        // Nor the photo row, so the cleaned picture travels: the better starting point,
        // and what every image made before that row existed was given.
        sourceImage: "CLEANED",
        note: undefined,
      }),
    );
  });

  it("polls until the image lands and then shows it", async () => {
    api.requestRender.mockResolvedValue({ ...READY_RENDER, status: "QUEUED" });
    api.getRender.mockResolvedValue(READY_RENDER);
    render(<RenderStudio projectId="p1" />);

    await screen.findByText("Scheme 1");
    await userEvent.click(screen.getByRole("button", { name: /Make my image/ }));

    const image = await screen.findByAltText("Your room, rendered", {}, { timeout: 8000 });
    expect(image).toHaveAttribute("src", "https://cdn.test/render.jpg");

    // A button, not a link. `<a download href="https://…">` is same-origin-only, so on
    // the presigned URL the browser ignored the attribute and navigated to a bare JPEG
    // instead of saving anything.
    await userEvent.click(screen.getByRole("button", { name: /Download the image/ }));
    await waitFor(() =>
      expect(downloadRemoteImage).toHaveBeenCalledWith(
        "https://cdn.test/render.jpg",
        expect.stringContaining("huevista-ai-image-"),
      ),
    );
  }, 12000);

  it("picks a render back up when the customer returns mid-flight", async () => {
    // They closed the tab, not the job.
    api.listRenders.mockResolvedValue([{ ...READY_RENDER, status: "RUNNING", imageUrl: null }]);
    render(<RenderStudio projectId="p1" />);

    expect(await screen.findByText(/Photographing your room/)).toBeInTheDocument();
  });

  it("stops promising a minute once the server is retrying a busy model", async () => {
    // The server no longer fails a render the moment the model is out of capacity — it
    // retries, and the wait stretches past the minute this screen advertises. Leaving the
    // original sentence up for six of them makes a working render look like a stuck app.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      api.listRenders.mockResolvedValue([{ ...READY_RENDER, status: "RUNNING", imageUrl: null }]);
      render(<RenderStudio projectId="p1" />);

      expect(await screen.findByText(/This takes about a minute/)).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(95_000);
      });

      expect(screen.getByText(/Still photographing your room/)).toBeInTheDocument();
      expect(screen.getByText(/The AI is busy right now/)).toBeInTheDocument();
      expect(screen.queryByText(/This takes about a minute/)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("offers a credit top-up when the wallet is empty", async () => {
    api.getAiCredits.mockResolvedValue(WALLET);
    render(<RenderStudio projectId="p1" />);

    const button = await screen.findByRole("button", { name: /Buy 1 credit · ₹99/ });
    expect(button).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Make my image/ })).not.toBeInTheDocument();

    await userEvent.click(button);
    await waitFor(() => expect(buyAiCredits).toHaveBeenCalledWith(1));
  });

  // ── Quality tiers ───────────────────────────────────────────────────────
  //
  // The one row on this screen that changes the price. Two things have to be true of it or
  // somebody is charged for a choice they did not make: it opens at the cheapest tier, and
  // every figure it shows comes off the server's own list rather than out of this file.

  it("opens at the cheapest tier and labels every tier with its price", async () => {
    render(<RenderStudio projectId="p1" />);

    const premium = await screen.findByRole("button", { name: "Premium · 1 credit" });
    expect(premium).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Luxury · 2 credits" })).toBeInTheDocument();
    // And nothing above it. The four-credit tier is retired, and a button for it here
    // would be a price this build can no longer be charged at.
    expect(screen.queryByRole("button", { name: /Max/ })).not.toBeInTheDocument();
  });

  it("sends the chosen tier and charges its full price", async () => {
    // No room includes an image any more, so a tier costs what it costs. This used to
    // charge the DIFFERENCE against a room's included Premium image, which made the price
    // of a picture depend on how the room had been bought.
    api.getAiCredits.mockResolvedValue({ ...WALLET, balance: 2 });
    api.requestRender.mockResolvedValue({ ...READY_RENDER, status: "QUEUED" });
    api.getRender.mockResolvedValue(READY_RENDER);
    render(<RenderStudio projectId="p1" />);

    await screen.findByText("Scheme 1");
    await userEvent.click(screen.getByRole("button", { name: "Luxury · 2 credits" }));

    expect(screen.getByText(/uses 2 of your 2 AI credits/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Make my image · 2 credits/ }));

    await waitFor(() =>
      expect(api.requestRender).toHaveBeenCalledWith(
        "p1",
        expect.objectContaining({ quality: "LUXURY" }),
      ),
    );
  });

  it("tops up exactly what the chosen tier is short by", async () => {
    // Buying a flat single credit was right when an image cost exactly one. With tiers it
    // would leave somebody who picked Luxury one short and none the wiser.
    api.getAiCredits.mockResolvedValue(WALLET);
    render(<RenderStudio projectId="p1" />);

    await screen.findByText("Scheme 1");
    await userEvent.click(screen.getByRole("button", { name: "Luxury · 2 credits" }));

    const button = await screen.findByRole("button", { name: /Buy 2 credits · ₹198/ });
    await userEvent.click(button);
    await waitFor(() => expect(buyAiCredits).toHaveBeenCalledWith(2));
  });

  // ── Every image is bought ───────────────────────────────────────────────
  //
  // No room includes one, however it was paid for. Getting this wrong in either direction
  // is expensive — offering a free image gives away a model call nobody paid for, and
  // refusing to say what it costs sends the customer into a 402 they were never warned
  // about.

  it("asks for a credit before the FIRST image on any room", async () => {
    api.getAiCredits.mockResolvedValue(WALLET);
    render(<RenderStudio projectId="p1" />);

    expect(await screen.findByRole("button", { name: /Buy 1 credit · ₹99/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Make my image/ })).not.toBeInTheDocument();
    expect(screen.getByText(/You need 1 credit for this image and have 0/)).toBeInTheDocument();
  });

  it("says what the click will cost once the credit is in the wallet", async () => {
    api.getAiCredits.mockResolvedValue({ ...WALLET, balance: 2 });
    api.requestRender.mockResolvedValue({ ...READY_RENDER, status: "QUEUED" });
    api.getRender.mockResolvedValue(READY_RENDER);
    render(<RenderStudio projectId="p1" />);

    // Named before the press, not after: this is the one click that spends something
    // without a payment sheet in front of it.
    const button = await screen.findByRole("button", { name: /Make my image · 1 credit/ });
    expect(screen.getByText(/uses 1 of your 2 AI credits/)).toBeInTheDocument();

    await userEvent.click(button);
    await waitFor(() => expect(api.requestRender).toHaveBeenCalled());
  });

  it("stays usable for an account whose wallet cannot be read", async () => {
    // A painter or distributor: the backend answers 403 and the fetch fails. The screen
    // must still render rather than breaking — the server is the authority on whether the
    // image can actually be made, and it answers 402 if not.
    api.getAiCredits.mockRejectedValue(new HttpError(403, "Not for this account."));
    render(<RenderStudio projectId="p1" />);

    // The combinations still load and the screen still works. There is no wallet to read,
    // so the price is unknown here and the button offers to buy rather than to spend —
    // which is the honest thing to show when the cost cannot be named.
    expect(await screen.findByText("Scheme 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Buy an AI image credit/ })).toBeInTheDocument();
  });

  it("shows the reason a failed render gives, and does not pretend it succeeded", async () => {
    api.requestRender.mockResolvedValue({ ...READY_RENDER, status: "QUEUED" });
    api.getRender.mockResolvedValue({
      ...READY_RENDER,
      status: "FAILED",
      imageUrl: null,
      failureReason: "Your image could not be made. Your credit is back — please try again.",
    });
    render(<RenderStudio projectId="p1" />);

    await screen.findByText("Scheme 1");
    await userEvent.click(screen.getByRole("button", { name: /Make my image/ }));

    expect(await screen.findByRole("alert", {}, { timeout: 8000 })).toHaveTextContent(
      /Your credit is back/,
    );
  }, 12000);

  it("surfaces a 402 rather than swallowing it", async () => {
    api.requestRender.mockRejectedValue(new HttpError(402, "You've used this project's AI image."));
    render(<RenderStudio projectId="p1" />);

    await screen.findByText("Scheme 1");
    await userEvent.click(screen.getByRole("button", { name: /Make my image/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/used this project's AI image/);
  });

  it("says so plainly when there are no colour boards to render from", async () => {
    api.getProjectCombos.mockResolvedValue([]);
    render(<RenderStudio projectId="p1" />);

    expect(await screen.findByText(/No colour boards yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to the studio/ })).toBeInTheDocument();
  });
});
