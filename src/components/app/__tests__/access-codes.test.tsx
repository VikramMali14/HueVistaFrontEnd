// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
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
    },
  };
});

const ORG: OrgResponse = { id: "org-1", name: "Mehta Paint House", slug: "mehta-paint-house", type: "RETAILER" };

const CODES: AccessCode[] = [
  {
    id: "ac-1",
    code: "7K2NQ9PX",
    organizationId: "org-1",
    validDays: 7,
    expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    used: false,
    expired: false,
  },
  {
    id: "ac-2",
    code: "B4DD00D1",
    organizationId: "org-1",
    validDays: 3,
    expiresAt: new Date(Date.now() - 86_400_000).toISOString(),
    used: true,
    expired: false,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listMyOrgs).mockResolvedValue([ORG]);
  vi.mocked(api.listAccessCodes).mockResolvedValue(CODES);
});

describe("AccessCodes — accessible table semantics", () => {
  it("exposes the code list as an ARIA table named 'Access codes'", async () => {
    render(<AccessCodes />);

    const table = await screen.findByRole("table", { name: "Access codes" });

    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(1 + CODES.length);

    const headers = within(rows[0]!).getAllByRole("columnheader");
    expect(headers.map((h) => h.textContent)).toEqual(["Code", "Validity", "Expires", "Status"]);

    for (const row of rows.slice(1)) {
      expect(within(row).getAllByRole("cell")).toHaveLength(4);
    }
  });

  it("renders each code's data inside cells", async () => {
    render(<AccessCodes />);
    const table = await screen.findByRole("table", { name: "Access codes" });

    const rows = within(table).getAllByRole("row");
    const active = within(rows[1]!);
    expect(active.getByText("7K2NQ9PX")).toBeInTheDocument();
    expect(active.getByText("7 days")).toBeInTheDocument();
    expect(active.getByText("active")).toBeInTheDocument();

    const redeemed = within(rows[2]!);
    expect(redeemed.getByText("B4DD00D1")).toBeInTheDocument();
    expect(redeemed.getByText("3 days")).toBeInTheDocument();
    expect(redeemed.getByText("redeemed")).toBeInTheDocument();
  });

  it("shows the empty state instead of a table when no codes exist", async () => {
    vi.mocked(api.listAccessCodes).mockResolvedValue([]);
    render(<AccessCodes />);

    expect(await screen.findByText(/No codes yet\./)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
