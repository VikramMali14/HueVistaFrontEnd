// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MyRender, ProjectSummary } from "@/lib/types";
import { DashboardProjects } from "../dashboard-projects";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => {
  class HttpError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return { HttpError, api: { listProjects: vi.fn(), listMyRenders: vi.fn() } };
});

const OWN: ProjectSummary = {
  id: "p-own",
  name: "My showroom wall",
  status: "SEGMENTED",
  imageId: "img-1",
  imageUrl: "/img-1.jpg",
  regionCount: 3,
  source: "OWN",
  updatedAt: "2026-07-20T10:00:00Z",
};

const CUSTOMER: ProjectSummary = {
  id: "p-cust",
  name: "Priya's living room",
  status: "SEGMENTED",
  imageId: "img-2",
  imageUrl: "/img-2.jpg",
  regionCount: 2,
  source: "CUSTOMER",
  customerName: "Priya Sharma",
  accessCode: "7K2NQ9PX",
  accessCodeId: "ac-1",
  readOnly: true,
  updatedAt: "2026-07-21T10:00:00Z",
};

/** One finished picture, made in the shop's own room. */
const RENDER: MyRender = {
  id: "r-1",
  projectId: "p-own",
  projectName: "My showroom wall",
  status: "READY",
  imageUrl: "/render-1.png",
  comboTitle: "Calm",
  timeOfDay: "DAY",
  borderMode: "KEEP_ORIGINAL",
  lighting: "NATURAL",
  furnishing: "KEEP",
  style: "MODERN",
  shades: [],
};

describe("DashboardProjects — separating a shop's work from its customers'", () => {
  beforeEach(() => {
    vi.mocked(api.listProjects).mockReset();
    vi.mocked(api.listMyRenders).mockReset();
    vi.mocked(api.listMyRenders).mockResolvedValue([]);
  });

  it("names the customer and their code on a customer room", async () => {
    vi.mocked(api.listProjects).mockResolvedValue([OWN, CUSTOMER]);
    render(<DashboardProjects />);

    expect(await screen.findByText("Priya's living room")).toBeInTheDocument();
    // Whose room it is has to be visible on the card — a shop dashboard now carries
    // both kinds, and an unlabelled card is one that gets opened by mistake.
    expect(screen.getByText(/Priya Sharma/)).toBeInTheDocument();
    expect(screen.getByText(/7K2NQ9PX/)).toBeInTheDocument();
  });

  it("filters between the shop's own rooms and its customers'", async () => {
    vi.mocked(api.listProjects).mockResolvedValue([OWN, CUSTOMER]);
    render(<DashboardProjects />);

    expect(await screen.findByText("My showroom wall")).toBeInTheDocument();
    expect(screen.getByText("Priya's living room")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /My rooms/ }));
    expect(screen.getByText("My showroom wall")).toBeInTheDocument();
    expect(screen.queryByText("Priya's living room")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Customer rooms/ }));
    expect(screen.queryByText("My showroom wall")).not.toBeInTheDocument();
    expect(screen.getByText("Priya's living room")).toBeInTheDocument();
  });

  /**
   * A control whose only effect is to empty the page is worse than no control. A shop
   * that has never issued a code has nothing to separate.
   */
  it("hides the filter entirely when there are no customer rooms", async () => {
    vi.mocked(api.listProjects).mockResolvedValue([OWN]);
    render(<DashboardProjects />);

    expect(await screen.findByText("My showroom wall")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Customer rooms/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Filter rooms" })).not.toBeInTheDocument();
  });

  /**
   * A customer's room belongs to the session the customer is holding. Opening it in the
   * studio would show a live palette over something the shop cannot save, so the card
   * points at the shop's portal view of that code instead.
   */
  it("sends a customer room to the portal, not the studio", async () => {
    vi.mocked(api.listProjects).mockResolvedValue([CUSTOMER]);
    render(<DashboardProjects />);

    const link = await screen.findByRole("link", { name: "Priya's living room" });
    expect(link).toHaveAttribute("href", "/portal?code=ac-1");
  });

  it("marks a lapsed room of the shop's own as view-only", async () => {
    vi.mocked(api.listProjects).mockResolvedValue([
      { ...OWN, readOnly: true, accessExpiresAt: "2026-07-01T00:00:00Z" },
    ]);
    render(<DashboardProjects />);

    expect(await screen.findByText(/View only/)).toBeInTheDocument();
  });
});

/**
 * A customer's dashboard is not a smaller version of a shop's.
 *
 * The two defects here are the same mistake in different places: showing somebody a
 * thing the next click, or the next sentence, contradicts.
 */
/**
 * The picture a room was closed to make.
 *
 * A closed room's card looked exactly like an open one — same photo, same status line —
 * so the AI image it produced was invisible from the page somebody lands on straight
 * after making it, and the only route back was the "AI images" tab if you knew it was
 * there. The card now carries the picture itself.
 */
describe("DashboardProjects — the AI image on a room's card", () => {
  beforeEach(() => {
    vi.mocked(api.listProjects).mockReset();
    vi.mocked(api.listMyRenders).mockReset();
  });

  it("shows the room's AI image and links to it", async () => {
    vi.mocked(api.listProjects).mockResolvedValue([OWN]);
    vi.mocked(api.listMyRenders).mockResolvedValue([RENDER]);
    render(<DashboardProjects />);

    const link = await screen.findByRole("link", { name: /AI image for My showroom wall/i });
    expect(link).toHaveAttribute("href", "/render?project=p-own");
  });

  it("says nothing on a room that has not made one", async () => {
    vi.mocked(api.listProjects).mockResolvedValue([OWN]);
    vi.mocked(api.listMyRenders).mockResolvedValue([]);
    render(<DashboardProjects />);

    expect(await screen.findByText("My showroom wall")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /AI image/i })).not.toBeInTheDocument();
  });

  /**
   * The decoration must never take the page down with it. The rooms are the point of
   * this grid; an unreachable image list is a missing badge, not a broken dashboard.
   */
  it("still renders the rooms when the image list cannot be read", async () => {
    vi.mocked(api.listProjects).mockResolvedValue([OWN]);
    vi.mocked(api.listMyRenders).mockRejectedValue(new Error("upstream down"));
    render(<DashboardProjects />);

    expect(await screen.findByText("My showroom wall")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /AI image/i })).not.toBeInTheDocument();
  });
});

describe("DashboardProjects — the customer's view", () => {
  beforeEach(() => {
    vi.mocked(api.listProjects).mockReset();
    vi.mocked(api.listMyRenders).mockReset();
    vi.mocked(api.listMyRenders).mockResolvedValue([]);
  });

  /**
   * A room the shop's code paid for goes view-only when that code's window closes — it
   * still opens, and the colours the customer chose are still on it. The card has to
   * stay a way in, and say which of the two states it is in.
   */
  it("keeps a lapsed shop room open and badges it view-only", async () => {
    vi.mocked(api.listProjects).mockResolvedValue([
      { ...OWN, name: "Room my shop gave me", readOnly: true,
        accessExpiresAt: "2026-07-01T00:00:00Z" },
    ]);
    render(<DashboardProjects isCustomer />);

    expect(await screen.findByRole("link", { name: "Room my shop gave me" }))
      .toHaveAttribute("href", "/studio?project=p-own");
    expect(screen.getByText(/View only/)).toBeInTheDocument();
  });

  /**
   * The KPI grid is counter analytics in a shop's vocabulary ("in your suite", "regions
   * across all projects"). A walk-in has no business to describe, and the access banner
   * above already tells them what they hold in the sentence that matters.
   */
  it("keeps the shop's KPI cards off a customer's dashboard", async () => {
    vi.mocked(api.listProjects).mockResolvedValue([OWN]);
    const { rerender } = render(<DashboardProjects isCustomer />);

    expect(await screen.findByText("My showroom wall")).toBeInTheDocument();
    expect(screen.queryByText("Projects saved")).not.toBeInTheDocument();
    expect(screen.queryByText("Walls & surfaces")).not.toBeInTheDocument();

    // …and still shows them to a shop, which is who they were written for.
    rerender(<DashboardProjects />);
    expect(await screen.findByText("Projects saved")).toBeInTheDocument();
  });
});
