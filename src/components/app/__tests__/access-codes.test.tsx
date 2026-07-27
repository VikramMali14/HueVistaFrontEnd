// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AccessCode, OrgResponse } from "@/lib/types";
import { AccessCodes } from "../access-codes";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => {
  class HttpError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return {
    HttpError,
    api: {
      listMyOrgs: vi.fn(),
      listAccessCodes: vi.fn(),
      createAccessCode: vi.fn(),
      createOrganization: vi.fn(),
      listShadeBrands: vi.fn(),
      listShopProducts: vi.fn(),
      revokeAccessCode: vi.fn(),
    },
  };
});

const ORG: OrgResponse = { id: "org-1", name: "Mehta Paint House", slug: "mehta-paint-house", type: "RETAILER" };

const CODES: AccessCode[] = [
  {
    id: "ac-1",
    code: "7K2NQ9PX",
    organizationId: "org-1",
    validDays: 10,
    customerName: "Priya Sharma",
    projectQuota: 2,
    projectsUsed: 1,
    projectsRemaining: 1,
    expiresAt: new Date(Date.now() + 10 * 86_400_000).toISOString(),
    used: false,
    expired: false,
  },
  {
    id: "ac-2",
    code: "B4DD00D1",
    organizationId: "org-1",
    validDays: 10,
    customerName: "Ravi Kumar",
    projectQuota: 1,
    expiresAt: new Date(Date.now() - 86_400_000).toISOString(),
    used: true,
    expired: false,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listMyOrgs).mockResolvedValue([ORG]);
  vi.mocked(api.listAccessCodes).mockResolvedValue(CODES);
  vi.mocked(api.listShopProducts).mockResolvedValue([]);
  vi.mocked(api.listShadeBrands).mockResolvedValue([
    { name: "Asian Paints", slug: "asian-paints", shadeCount: 2200 },
    { name: "Birla Opus", slug: "birla-opus", shadeCount: 2322 },
  ]);
});

describe("AccessCodes — accessible table semantics", () => {
  it("exposes the code list as an ARIA table named 'Access codes'", async () => {
    render(<AccessCodes />);

    const table = await screen.findByRole("table", { name: "Access codes" });

    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(1 + CODES.length);

    const headers = within(rows[0]!).getAllByRole("columnheader");
    // The last column carries the per-row controls: top up a code the customer already
    // holds (+ Project / + 10 days), and cancel one nobody has redeemed.
    expect(headers.map((h) => h.textContent)).toEqual(["Code", "Customer", "Projects", "Expires", "Status", "Rooms", "Actions"]);

    for (const row of rows.slice(1)) {
      expect(within(row).getAllByRole("cell")).toHaveLength(7);
    }
  });

  it("renders each code's data inside cells", async () => {
    render(<AccessCodes />);
    const table = await screen.findByRole("table", { name: "Access codes" });

    const rows = within(table).getAllByRole("row");
    const active = within(rows[1]!);
    expect(active.getByText("7K2NQ9PX")).toBeInTheDocument();
    expect(active.getByText("Priya Sharma")).toBeInTheDocument();
    expect(active.getByText("active")).toBeInTheDocument();

    const redeemed = within(rows[2]!);
    expect(redeemed.getByText("B4DD00D1")).toBeInTheDocument();
    expect(redeemed.getByText("Ravi Kumar")).toBeInTheDocument();
    expect(redeemed.getByText("redeemed")).toBeInTheDocument();
  });

  it("shows the assigned project quota counting down as rooms are created", async () => {
    render(<AccessCodes />);
    const table = await screen.findByRole("table", { name: "Access codes" });
    const rows = within(table).getAllByRole("row");

    // Priya has used 1 of her 2 assigned projects; Ravi has used none of his 1.
    expect(within(rows[1]!).getByText("1 / 2")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("0 / 1")).toBeInTheDocument();
  });

  it("shows the empty state instead of a table when no codes exist", async () => {
    vi.mocked(api.listAccessCodes).mockResolvedValue([]);
    render(<AccessCodes />);

    expect(await screen.findByText(/No codes yet\./)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("AccessCodes — cancelling an unredeemed code", () => {
  it("returns the held quota only after a confirmation, and never offers it on a redeemed code", async () => {
    const user = userEvent.setup();
    vi.mocked(api.revokeAccessCode).mockResolvedValue({ ...CODES[0]!, revoked: true, editable: false });

    render(<AccessCodes />);
    const table = await screen.findByRole("table", { name: "Access codes" });
    const rows = within(table).getAllByRole("row");

    // The redeemed code has no cancel affordance: the customer may already have rooms
    // under it, so pulling access after the fact would strand them at the counter.
    expect(within(rows[2]!).queryByRole("button", { name: /cancel/i })).toBeNull();

    // Cancelling releases image credits back to the shop, so it takes two clicks.
    await user.click(within(rows[1]!).getByRole("button", { name: /cancel/i }));
    expect(api.revokeAccessCode).not.toHaveBeenCalled();

    await user.click(within(rows[1]!).getByRole("button", { name: /confirm/i }));
    expect(api.revokeAccessCode).toHaveBeenCalledWith("org-1", "ac-1");

    const refreshed = within(await screen.findByRole("table", { name: "Access codes" })).getAllByRole("row");
    expect(within(refreshed[1]!).getByText("cancelled")).toBeInTheDocument();
  });

  it("surfaces a refusal from the server instead of pretending the code was cancelled", async () => {
    const user = userEvent.setup();
    vi.mocked(api.revokeAccessCode).mockRejectedValue(new Error("This code has already been redeemed."));

    render(<AccessCodes />);
    const table = await screen.findByRole("table", { name: "Access codes" });
    const rows = within(table).getAllByRole("row");

    await user.click(within(rows[1]!).getByRole("button", { name: /cancel/i }));
    await user.click(within(rows[1]!).getByRole("button", { name: /confirm/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("already been redeemed");
    expect(within(rows[1]!).getByText("active")).toBeInTheDocument();
  });
});
