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

/** Comfortably longer than the studio's 2.5s poll interval, so a live loop would show. */
const POLL_QUIET_MS = 4000;

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
    await userEvent.click(screen.getByRole("button", { name: "Let AI decide" }));
    await userEvent.click(screen.getByRole("button", { name: /Make my picture/ }));

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
    await userEvent.click(screen.getByRole("button", { name: /Make my picture/ }));

    const image = await screen.findByAltText("Your room, rendered", {}, { timeout: 8000 });
    expect(image).toHaveAttribute("src", "https://cdn.test/render.jpg");

    // A button, not a link. `<a download href="https://…">` is same-origin-only, so on
    // the presigned URL the browser ignored the attribute and navigated to a bare JPEG
    // instead of saving anything.
    await userEvent.click(screen.getByRole("button", { name: /Save the picture/ }));
    await waitFor(() =>
      expect(downloadRemoteImage).toHaveBeenCalledWith(
        "https://cdn.test/render.jpg",
        expect.stringContaining("huevista-ai-image-"),
      ),
    );
  }, 12000);

  it("polls a render it picked back up, instead of waiting on it forever", async () => {
    // They closed the tab, not the job. Raising the spinner was all this did: nothing
    // ever asked the server again, so a customer returning to a picture that had
    // finished while they were away watched "Making your picture…" for as long as they
    // were willing to, with the finished image sitting on the server the whole time.
    api.listRenders.mockResolvedValue([{ ...READY_RENDER, status: "RUNNING", imageUrl: null }]);
    api.getRender.mockResolvedValue(READY_RENDER);
    render(<RenderStudio projectId="p1" />);

    // The waiting overlay's own line — "Making your picture…" alone is ambiguous,
    // because the button under it says exactly the same thing while one is coming.
    expect(await screen.findByText(/This takes about a minute/)).toBeInTheDocument();

    // The first poll is one interval away, so this has to outlast it — and arriving at
    // all is the whole assertion: before the fix nothing ever asked the server again.
    const image = await screen.findByAltText("Your room, rendered", {}, { timeout: 8000 });
    expect(image).toHaveAttribute("src", "https://cdn.test/render.jpg");
    expect(api.getRender).toHaveBeenCalledWith("p1", "r1");
  }, 12000);

  it("stops promising a minute once the server is retrying a busy model", async () => {
    // The server no longer fails a render the moment the model is out of capacity — it
    // retries, and the wait stretches past the minute this screen advertises. Leaving the
    // original sentence up for six of them makes a working render look like a stuck app.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      api.listRenders.mockResolvedValue([{ ...READY_RENDER, status: "RUNNING", imageUrl: null }]);
      // Still unfinished on every poll — the case the copy is about.
      api.getRender.mockResolvedValue({ ...READY_RENDER, status: "RUNNING", imageUrl: null });
      render(<RenderStudio projectId="p1" />);

      expect(await screen.findByText(/This takes about a minute/)).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(95_000);
      });

      expect(screen.getByText(/Still making your picture/)).toBeInTheDocument();
      expect(screen.getByText(/the AI is busy/)).toBeInTheDocument();
      expect(screen.queryByText(/This takes about a minute/)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("lets go of the screen when it gives up, and offers to look again", async () => {
    // Giving up used to change nothing the overlay reads, so the spinner stayed on top
    // of the page forever: every button under it disabled, and the message saying the
    // picture might still arrive printed behind a curtain still claiming it was being
    // made. The customer's only way out was to reload a page that never said so.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      api.listRenders.mockResolvedValue([{ ...READY_RENDER, status: "RUNNING", imageUrl: null }]);
      api.getRender.mockResolvedValue({ ...READY_RENDER, status: "RUNNING", imageUrl: null });
      render(<RenderStudio projectId="p1" />);

      expect(await screen.findByText(/This takes about a minute/)).toBeInTheDocument();

      // Past the poll deadline, which sits comfortably beyond the server's own retry
      // budget — anything still unfinished here is genuinely stuck.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600_000);
      });

      expect(screen.queryByText(/This takes about a minute/)).not.toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent(/taking longer than usual/);
      // And the picker is usable again rather than frozen under the overlay.
      expect(screen.getByRole("button", { name: /Make my picture/ })).toBeEnabled();

      // Looking again is offered, not described. The render may well have landed since.
      api.getRender.mockResolvedValue(READY_RENDER);
      const again = screen.getByRole("button", { name: "Check again" });
      await act(async () => {
        again.click();
        await vi.advanceTimersByTimeAsync(4000);
      });

      expect(screen.getByAltText("Your room, rendered")).toHaveAttribute(
        "src",
        "https://cdn.test/render.jpg",
      );
    } finally {
      vi.useRealTimers();
    }
  }, 20000);

  it("stops polling once the customer has left the page", async () => {
    // The loop ran for up to nine minutes after unmount, asking the server every 2.5
    // seconds and calling setState on a component that no longer existed.
    api.listRenders.mockResolvedValue([{ ...READY_RENDER, status: "RUNNING", imageUrl: null }]);
    api.getRender.mockResolvedValue({ ...READY_RENDER, status: "RUNNING", imageUrl: null });
    const view = render(<RenderStudio projectId="p1" />);

    await screen.findByText(/This takes about a minute/);
    await waitFor(() => expect(api.getRender).toHaveBeenCalled(), { timeout: 8000 });
    view.unmount();
    const asked = api.getRender.mock.calls.length;

    await new Promise((r) => setTimeout(r, POLL_QUIET_MS));

    expect(api.getRender.mock.calls.length).toBe(asked);
  }, 15000);

  it("keeps one finished picture reachable after the stage is cleared", async () => {
    // "Make one more" and a top-up both clear the stage to bring the options back, and
    // the strip was hidden whenever there was exactly one finished picture — so either
    // press made the customer's only image vanish with nothing on the page leading
    // anywhere near it.
    api.listRenders.mockResolvedValue([READY_RENDER]);
    render(<RenderStudio projectId="p1" />);

    await screen.findByAltText("Your room, rendered");
    // Shown, not listed, while it is the picture on the stage.
    expect(screen.queryByText("Your pictures")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Make one more/ }));

    expect(screen.getByText("Your pictures")).toBeInTheDocument();
    // Named by what it is, not by the enum values the database stores.
    await userEvent.click(
      screen.getByRole("button", { name: "Show the picture: Modern · Daytime · Normal light" }),
    );
    expect(screen.getByAltText("Your room, rendered")).toBeInTheDocument();
  });

  it("offers a credit top-up when the wallet is empty", async () => {
    api.getAiCredits.mockResolvedValue(WALLET);
    render(<RenderStudio projectId="p1" />);

    const button = await screen.findByRole("button", { name: /Buy 1 credit · ₹99/ });
    expect(button).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Make my picture/ })).not.toBeInTheDocument();

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

    const premium = await screen.findByRole("button", { name: "Good · 1 credit" });
    expect(premium).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Best · 2 credits" })).toBeInTheDocument();
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
    await userEvent.click(screen.getByRole("button", { name: "Best · 2 credits" }));

    expect(screen.getByText(/You have 2 credits\. This picture uses 2\./)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Make my picture · 2 credits/ }));

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
    await userEvent.click(screen.getByRole("button", { name: "Best · 2 credits" }));

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
    expect(screen.queryByRole("button", { name: /Make my picture/ })).not.toBeInTheDocument();
    expect(screen.getByText(/This picture needs 1 credit and you have 0/)).toBeInTheDocument();
  });

  it("says what the click will cost once the credit is in the wallet", async () => {
    api.getAiCredits.mockResolvedValue({ ...WALLET, balance: 2 });
    api.requestRender.mockResolvedValue({ ...READY_RENDER, status: "QUEUED" });
    api.getRender.mockResolvedValue(READY_RENDER);
    render(<RenderStudio projectId="p1" />);

    // Named before the press, not after: this is the one click that spends something
    // without a payment sheet in front of it.
    const button = await screen.findByRole("button", { name: /Make my picture · 1 credit/ });
    expect(screen.getByText(/You have 2 credits\. This picture uses 1\./)).toBeInTheDocument();

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
    expect(screen.getByRole("button", { name: /Buy a credit/ })).toBeInTheDocument();
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
    await userEvent.click(screen.getByRole("button", { name: /Make my picture/ }));

    expect(await screen.findByRole("alert", {}, { timeout: 8000 })).toHaveTextContent(
      /Your credit is back/,
    );
  }, 12000);

  it("surfaces a 402 rather than swallowing it", async () => {
    api.requestRender.mockRejectedValue(new HttpError(402, "You've used this project's AI image."));
    render(<RenderStudio projectId="p1" />);

    await screen.findByText("Scheme 1");
    await userEvent.click(screen.getByRole("button", { name: /Make my picture/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/used this project's AI image/);
  });

  it("says so plainly when there are no colour boards to render from", async () => {
    api.getProjectCombos.mockResolvedValue([]);
    render(<RenderStudio projectId="p1" />);

    expect(await screen.findByText(/No colour boards yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to the studio/ })).toBeInTheDocument();
  });
});
