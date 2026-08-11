// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

vi.mock("@/lib/payments", () => ({ buyExtraRender: vi.fn() }));

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
import { buyExtraRender as realBuy } from "@/lib/payments";

const api = vi.mocked(realApi);
const buyExtraRender = vi.mocked(realBuy);

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
  rendersAllowed: 1,
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
});

describe("RenderStudio", () => {
  it("offers every combination the colour boards handed over", async () => {
    render(<RenderStudio projectId="p1" />);

    expect(await screen.findByText("Scheme 1")).toBeInTheDocument();
    const options = await screen.findAllByRole("radio", { name: /Scheme/ });
    expect(options).toHaveLength(8);
    // Board order is the order the customer saw them in.
    expect(options[0]).toHaveAttribute("aria-checked", "true");
  });

  it("sends the chosen combination and options to the server", async () => {
    api.requestRender.mockResolvedValue({ ...READY_RENDER, status: "QUEUED" });
    api.getRender.mockResolvedValue(READY_RENDER);
    render(<RenderStudio projectId="p1" />);

    await screen.findByText("Scheme 1");
    await userEvent.click(screen.getByRole("radio", { name: /Scheme 3/ }));
    await userEvent.click(screen.getByRole("radio", { name: "Night" }));
    await userEvent.click(screen.getByRole("radio", { name: "Suggest borders" }));
    await userEvent.click(screen.getByRole("button", { name: /Make my image/ }));

    await waitFor(() =>
      expect(api.requestRender).toHaveBeenCalledWith("p1", {
        comboId: "combo-2",
        timeOfDay: "NIGHT",
        borderMode: "AI_SUGGESTED",
        lighting: "NATURAL",
        furnishing: "KEEP",
        style: "MODERN",
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
    expect(screen.getByRole("link", { name: /Download the image/ })).toBeInTheDocument();
  }, 12000);

  it("picks a render back up when the customer returns mid-flight", async () => {
    // They closed the tab, not the job.
    api.listRenders.mockResolvedValue([{ ...READY_RENDER, status: "RUNNING", imageUrl: null }]);
    render(<RenderStudio projectId="p1" />);

    expect(await screen.findByText(/Photographing your room/)).toBeInTheDocument();
  });

  it("offers the paid top-up once the included image is spent", async () => {
    api.getProject.mockResolvedValue({ ...PROJECT, rendersUsed: 1 });
    render(<RenderStudio projectId="p1" />);

    const button = await screen.findByRole("button", { name: /Another image · ₹99/ });
    expect(button).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Make my image/ })).not.toBeInTheDocument();

    await userEvent.click(button);
    await waitFor(() => expect(buyExtraRender).toHaveBeenCalledWith("p1"));
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
