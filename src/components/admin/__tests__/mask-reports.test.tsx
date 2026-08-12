// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MaskReport } from "@/lib/types";
import { MaskReports } from "../mask-reports";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

function report(overrides: Partial<MaskReport> = {}): MaskReport {
  return {
    id: "rep-1",
    issues: ["MASK_NOT_GENERATED_PROPERLY"],
    note: "the ceiling was painted as a wall",
    status: "NEW",
    createdAt: "2026-08-10T09:30:00",
    projectId: "proj-1",
    projectName: "Front bedroom",
    reporterName: "Asha Rao",
    reporterEmail: "asha@example.com",
    reporterRole: "CUSTOMER",
    projectStatus: "SEGMENTED",
    maskMode: "AUTO",
    regionCount: 2,
    hadCleanedImage: true,
    ...overrides,
  };
}

describe("MaskReports", () => {
  beforeEach(() => vi.clearAllMocks());

  it("says the queue could not be read rather than showing it as empty", () => {
    // An outage and "nobody has reported anything" mean opposite things on a
    // queue whose whole job is surfacing failures nothing else can see.
    render(<MaskReports initial={null} updateAction={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/could not load the reports/i);
  });

  it("shows what was reported, by whom, and against which room", () => {
    render(<MaskReports initial={[report()]} updateAction={vi.fn()} />);
    expect(screen.getByText(/walls not detected properly/i)).toBeInTheDocument();
    expect(screen.getByText(/the ceiling was painted as a wall/i)).toBeInTheDocument();
    expect(screen.getByText(/front bedroom/i)).toBeInTheDocument();
    expect(screen.getByText(/asha@example.com/i)).toBeInTheDocument();
  });

  it("shows the run as it was AT REPORT TIME, not as the project stands now", () => {
    render(<MaskReports initial={[report({ regionCount: 0, hadCleanedImage: false })]} updateAction={vi.fn()} />);
    // Re-running segmentation overwrites all of this on the project itself, so a
    // row that quoted live state would describe a different run than the one
    // being complained about.
    expect(screen.getByText(/0 regions/i)).toBeInTheDocument();
    expect(screen.getByText(/clean-up did not run/i)).toBeInTheDocument();
  });

  it("marks the reports the pipeline filed for itself", () => {
    // These arrive from a room the user is probably perfectly happy with — the photo
    // came out, only the walls didn't — so an admin reading this row as an ordinary
    // complaint would go looking for a person who never wrote in.
    render(
      <MaskReports
        initial={[report({ autoRaised: true, regionCount: 0, note: "Raised automatically by the pipeline." })]}
        updateAction={vi.fn()}
      />,
    );
    expect(screen.getByText(/raised by the pipeline/i)).toBeInTheDocument();
    expect(screen.getByText(/no complaint/i)).toBeInTheDocument();
  });

  it("does not mark an ordinary report as the pipeline's", () => {
    render(<MaskReports initial={[report()]} updateAction={vi.fn()} />);
    expect(screen.queryByText(/raised by the pipeline/i)).not.toBeInTheDocument();
  });

  it("names the shop on a guest report, which has no account behind it", () => {
    render(
      <MaskReports
        initial={[report({ reporterName: null, reporterEmail: null, shopName: "Mehta Paint House" })]}
        updateAction={vi.fn()}
      />,
    );
    expect(screen.getByText(/via Mehta Paint House/i)).toBeInTheDocument();
    expect(screen.getByText(/walk-in customer/i)).toBeInTheDocument();
  });

  it("resolves a report and reflects the answer the server gave back", async () => {
    const user = userEvent.setup();
    const updateAction = vi.fn().mockResolvedValue({
      report: report({ status: "RESOLVED", resolvedByName: "Admin", resolvedAt: "2026-08-11T10:00:00" }),
    });
    render(<MaskReports initial={[report()]} updateAction={updateAction} />);

    await user.click(screen.getByRole("button", { name: /mark resolved/i }));

    await waitFor(() => expect(updateAction).toHaveBeenCalledWith("rep-1", { status: "RESOLVED" }));
    await waitFor(() => expect(screen.getByText(/resolved by admin/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /re-open/i })).toBeInTheDocument();
  });

  it("saves an internal note without touching the status", async () => {
    const user = userEvent.setup();
    const updateAction = vi.fn().mockResolvedValue({ report: report({ adminNote: "model drift" }) });
    render(<MaskReports initial={[report()]} updateAction={updateAction} />);

    await user.type(screen.getByLabelText(/internal note/i), "model drift");
    await user.click(screen.getByRole("button", { name: /save note/i }));

    await waitFor(() => expect(updateAction).toHaveBeenCalledWith("rep-1", { adminNote: "model drift" }));
    expect(await screen.findByText(/model drift/i)).toBeInTheDocument();
  });

  it("surfaces a failed update instead of showing the change as applied", async () => {
    const user = userEvent.setup();
    const updateAction = vi.fn().mockResolvedValue({ error: "Your session expired." });
    render(<MaskReports initial={[report()]} updateAction={updateAction} />);

    await user.click(screen.getByRole("button", { name: /mark resolved/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Your session expired."));
    expect(screen.getByRole("button", { name: /mark resolved/i })).toBeInTheDocument();
  });

  it("puts untouched reports above the ones already dealt with", () => {
    render(
      <MaskReports
        initial={[
          report({ id: "old", status: "RESOLVED", projectName: "Old room" }),
          report({ id: "new", status: "NEW", projectName: "New room" }),
        ]}
        updateAction={vi.fn()}
      />,
    );
    const rooms = screen.getAllByText(/room/i).map((n) => n.textContent ?? "");
    expect(rooms.findIndex((t) => t.includes("New room")))
      .toBeLessThan(rooms.findIndex((t) => t.includes("Old room")));
  });
});
