// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CustomerEntitlement, OrgResponse } from "@/lib/types";
import { RetailerCustomers } from "../retailer-customers";
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
      listCustomers: vi.fn(),
      grantProject: vi.fn(),
      // Loaded alongside the customers so a row knows whether it has anything to take
      // back. Best-effort in the component, so default to "nothing granted".
      listProjectGrants: vi.fn(async () => []),
      revokeProjectGrant: vi.fn(),
      // Read by the "projects available to assign" line above the list. Both are
      // best-effort there, so a rejection is a supported state, not a broken fixture.
      getCurrentSubscription: vi.fn().mockRejectedValue(new Error("no subscription")),
      getProjectPurchaseOptions: vi.fn().mockRejectedValue(new Error("no options")),
    },
  };
});

const ORG: OrgResponse = { id: "org-1", name: "Mehta Paint House", slug: "mehta-paint-house", type: "RETAILER" };

const CUSTOMERS: CustomerEntitlement[] = [
  {
    customerId: "c-1",
    customerName: "Priya Sharma",
    customerEmail: "priya@example.com",
    accessExpiresAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    expired: false,
    projectAllowance: 2,
    projectsCreated: 1,
    projectsRemaining: 1,
  },
  {
    customerId: "c-2",
    customerName: "Arun Verma",
    customerEmail: "arun@example.com",
    accessExpiresAt: new Date(Date.now() - 86_400_000).toISOString(),
    expired: true,
    projectAllowance: 1,
    projectsCreated: 1,
    projectsRemaining: 0,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listMyOrgs).mockResolvedValue([ORG]);
  vi.mocked(api.listCustomers).mockResolvedValue(CUSTOMERS);
});

describe("RetailerCustomers — accessible table semantics", () => {
  it("exposes the customer grid as an ARIA table named 'Customers'", async () => {
    render(<RetailerCustomers />);

    const table = await screen.findByRole("table", { name: "Customers" });

    // Header row + one row per customer.
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(1 + CUSTOMERS.length);

    // Four column headers; the empty action column is labelled for AT users.
    const headers = within(rows[0]!).getAllByRole("columnheader");
    expect(headers.map((h) => h.getAttribute("aria-label") ?? h.textContent)).toEqual([
      "Customer",
      "Projects",
      "Access left",
      "Actions",
    ]);

    // Every data row exposes one cell per column.
    for (const row of rows.slice(1)) {
      expect(within(row).getAllByRole("cell")).toHaveLength(4);
    }
  });

  it("renders each customer's data inside cells", async () => {
    render(<RetailerCustomers />);
    const table = await screen.findByRole("table", { name: "Customers" });

    const rows = within(table).getAllByRole("row");
    const first = within(rows[1]!);
    expect(first.getByText("Priya Sharma")).toBeInTheDocument();
    expect(first.getByText("priya@example.com")).toBeInTheDocument();
    expect(first.getByText("1 / 2")).toBeInTheDocument();
    expect(first.getByRole("button", { name: "+ Grant project" })).toBeEnabled();

    const second = within(rows[2]!);
    expect(second.getByText("Arun Verma")).toBeInTheDocument();
    expect(second.getByText("expired")).toBeInTheDocument();
    expect(second.getByRole("button", { name: "+ Grant project" })).toBeDisabled();
  });

  it("shows the empty state instead of a table when there are no customers", async () => {
    vi.mocked(api.listCustomers).mockResolvedValue([]);
    render(<RetailerCustomers />);

    expect(await screen.findByText("No customers have used an access code yet.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  /**
   * Take-back only appears when there is genuinely something to take back. A grant the
   * customer has used, or one funded by a billing period that has since renewed, comes
   * back from the server already marked not-revocable — so the button never offers an
   * action that would be refused.
   */
  it("offers take-back only for a grant that is still revocable", async () => {
    vi.mocked(api.listProjectGrants).mockResolvedValue([
      { id: "g-1", customerUserId: "c-1", projects: 1, revocable: true },
      { id: "g-2", customerUserId: "c-2", projects: 1, revocable: false },
    ]);
    render(<RetailerCustomers />);

    const table = await screen.findByRole("table", { name: "Customers" });
    const rows = within(table).getAllByRole("row");
    expect(within(rows[1]!).getByRole("button", { name: "Take back" })).toBeEnabled();
    expect(within(rows[2]!).queryByRole("button", { name: "Take back" })).not.toBeInTheDocument();
  });

  it("returns the grant and refreshes both lists", async () => {
    vi.mocked(api.listProjectGrants).mockResolvedValue([
      { id: "g-1", customerUserId: "c-1", projects: 1, revocable: true },
    ]);
    vi.mocked(api.revokeProjectGrant).mockResolvedValue({
      id: "g-1", customerUserId: "c-1", projects: 1, revocable: false, revokedAt: "2026-07-27T00:00:00Z",
    });
    render(<RetailerCustomers />);

    const table = await screen.findByRole("table", { name: "Customers" });
    const rows = within(table).getAllByRole("row");
    await userEvent.click(within(rows[1]!).getByRole("button", { name: "Take back" }));

    expect(api.revokeProjectGrant).toHaveBeenCalledWith("org-1", "g-1");
    // Both the allowance and the offer have to be re-read: the allowance dropped, and
    // there may be nothing left to take back.
    expect(api.listCustomers).toHaveBeenCalledTimes(2);
    expect(api.listProjectGrants).toHaveBeenCalledTimes(2);
  });
});
