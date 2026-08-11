// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OrgResponse, ShopBrandVisibility } from "@/lib/types";
import { ShopBrandsPanel } from "../shop-brands-panel";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: { getVisibleBrands: vi.fn(), setVisibleBrands: vi.fn(), listMyOrgs: vi.fn() },
  HttpError: class HttpError extends Error {},
}));

const ORG = { id: "org-1", name: "Mehta Paint House", type: "RETAILER" } as unknown as OrgResponse;

function visibility(overrides: Partial<ShopBrandVisibility> = {}): ShopBrandVisibility {
  return {
    restricted: false,
    brands: [
      { id: 1, name: "Testco Paints", slug: "testco-paints", shown: true },
      { id: 2, name: "Rivalco Paints", slug: "rivalco-paints", shown: true },
    ],
    ...overrides,
  };
}

async function panel(v: ShopBrandVisibility = visibility()) {
  vi.mocked(api.getVisibleBrands).mockResolvedValue(v);
  const view = render(<ShopBrandsPanel org={ORG} />);
  await waitFor(() => expect(api.getVisibleBrands).toHaveBeenCalledWith("org-1"));
  return view;
}

describe("ShopBrandsPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("starts on 'show everything' when the shop has set no limit of its own", async () => {
    await panel();
    expect(screen.getByLabelText(/show every company/i)).toBeChecked();
    // The tick list only exists once the shop opts into narrowing — showing it while
    // "everything" is selected implies the ticks mean something, and they don't.
    expect(screen.queryByLabelText("Testco Paints")).not.toBeInTheDocument();
  });

  it("saves the ticked companies and reports what is now showing", async () => {
    const user = userEvent.setup();
    await panel();
    vi.mocked(api.setVisibleBrands).mockResolvedValue(
      visibility({
        restricted: true,
        brands: [
          { id: 1, name: "Testco Paints", slug: "testco-paints", shown: true },
          { id: 2, name: "Rivalco Paints", slug: "rivalco-paints", shown: false },
        ],
      }),
    );

    await user.click(screen.getByLabelText(/only show the ones i stock/i));
    // Narrowing starts from what is currently shown, so both are ticked — untick one.
    await user.click(screen.getByLabelText("Rivalco Paints"));
    await user.click(screen.getByRole("button", { name: /save companies/i }));

    await waitFor(() =>
      expect(api.setVisibleBrands).toHaveBeenCalledWith("org-1", {
        showAll: false,
        brandIds: [1],
      }),
    );
    expect(await screen.findByText(/1 of 2 companies showing/i)).toBeInTheDocument();
  });

  /**
   * Turning everything off is allowed — a shop between suppliers may genuinely stock
   * none — but it stops the shop selling anything, so it must be visibly deliberate
   * rather than a quiet save.
   */
  it("warns before a shop saves a selection that shows nothing", async () => {
    const user = userEvent.setup();
    await panel();

    await user.click(screen.getByLabelText(/only show the ones i stock/i));
    await user.click(screen.getByLabelText("Testco Paints"));
    await user.click(screen.getByLabelText("Rivalco Paints"));

    expect(screen.getByRole("status")).toHaveTextContent(/nothing is ticked/i);
  });

  it("offers only what the distributor granted, never the whole catalogue", async () => {
    const user = userEvent.setup();
    // The backend sends the GRANT as the option list; a company the shop was never
    // assigned must not appear, because ticking it could not do anything.
    await panel(
      visibility({
        restricted: true,
        brands: [{ id: 1, name: "Testco Paints", slug: "testco-paints", shown: true }],
      }),
    );
    await user.click(screen.getByLabelText(/only show the ones i stock/i));

    expect(screen.getByLabelText("Testco Paints")).toBeInTheDocument();
    expect(screen.queryByLabelText("Rivalco Paints")).not.toBeInTheDocument();
  });

  it("says so plainly when the distributor has granted nothing yet", async () => {
    await panel(visibility({ brands: [] }));
    expect(screen.getByText(/hasn't assigned your shop any paint companies/i)).toBeInTheDocument();
  });

  it("keeps Save disabled until something actually changes", async () => {
    const user = userEvent.setup();
    await panel();
    const save = screen.getByRole("button", { name: /save companies/i });
    expect(save).toBeDisabled();

    await user.click(screen.getByLabelText(/only show the ones i stock/i));
    expect(save).toBeEnabled();
  });
});
