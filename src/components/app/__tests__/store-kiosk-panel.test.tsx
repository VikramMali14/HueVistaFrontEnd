// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OrgResponse, StoreLink, WalletSummary } from "@/lib/types";
import { StoreKioskPanel } from "../store-kiosk-panel";
import { api } from "@/lib/api";
import { buildKioskPoster } from "@/lib/kiosk-poster";
import { downloadBlob } from "@/lib/download-blob";

vi.mock("@/lib/api", () => ({
  api: {
    listStoreLinks: vi.fn(),
    getWallet: vi.fn(),
    createStoreLink: vi.fn(),
    updateStoreLink: vi.fn(),
    deleteStoreLink: vi.fn(),
    listMyOrgs: vi.fn(),
  },
  HttpError: class HttpError extends Error {},
}));

// The poster needs a real canvas, which jsdom has none of. What this panel owes
// the poster is the right shop name and the right URL — assert on the call.
vi.mock("@/lib/kiosk-poster", () => ({
  buildKioskPoster: vi.fn(),
  kioskPosterFileName: (name: string) => `huevista-${name.toLowerCase().replace(/\W+/g, "-")}-qr.png`,
}));
vi.mock("@/lib/download-blob", () => ({ downloadBlob: vi.fn() }));

const ORG = { id: "org-1", name: "Mehta Paint House", type: "RETAILER" } as unknown as OrgResponse;

const LINK: StoreLink = {
  id: "link-1",
  slug: "mehta-paint-house",
  organizationId: "org-1",
  pricePaise: 9900,
  currency: "INR",
  validDays: 10,
  active: true,
  bonusPoints: 30,
};

const WALLET = {
  pointsBalance: 90,
  lifetimePointsEarned: 90,
  pointsPerSale: 30,
  kioskPricePaise: 9900,
  recentPayments: [],
} as unknown as WalletSummary;

async function panel(links: StoreLink[] = [LINK]) {
  vi.mocked(api.listStoreLinks).mockResolvedValue(links);
  vi.mocked(api.getWallet).mockResolvedValue(WALLET);
  const view = render(<StoreKioskPanel org={ORG} />);
  await waitFor(() => expect(api.listStoreLinks).toHaveBeenCalledWith("org-1"));
  return view;
}

describe("StoreKioskPanel — QR poster", () => {
  beforeEach(() => vi.clearAllMocks());

  it("builds the poster for the shop's own name and its live store URL", async () => {
    const user = userEvent.setup();
    const blob = new Blob(["png"], { type: "image/png" });
    vi.mocked(buildKioskPoster).mockResolvedValue(blob);
    await panel();

    await user.click(await screen.findByRole("button", { name: /download qr/i }));

    await waitFor(() =>
      expect(buildKioskPoster).toHaveBeenCalledWith({
        shopName: "Mehta Paint House",
        // Same origin the row shows and the Copy button copies — a poster that
        // pointed anywhere else would only be caught after it was printed.
        url: `${window.location.origin}/store/mehta-paint-house`,
      }),
    );
    expect(downloadBlob).toHaveBeenCalledWith(blob, "huevista-mehta-paint-house-qr.png");
  });

  it("prefers the name the link carries when the shop has renamed itself", async () => {
    const user = userEvent.setup();
    vi.mocked(buildKioskPoster).mockResolvedValue(new Blob());
    await panel([{ ...LINK, organizationName: "Mehta Paints & Hardware" }]);

    await user.click(await screen.findByRole("button", { name: /download qr/i }));

    await waitFor(() =>
      expect(buildKioskPoster).toHaveBeenCalledWith(
        expect.objectContaining({ shopName: "Mehta Paints & Hardware" }),
      ),
    );
  });

  it("says so when the poster cannot be drawn, and downloads nothing", async () => {
    const user = userEvent.setup();
    vi.mocked(buildKioskPoster).mockRejectedValue(new Error("This browser can't draw the poster."));
    await panel();

    await user.click(await screen.findByRole("button", { name: /download qr/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This browser can't draw the poster.");
    expect(downloadBlob).not.toHaveBeenCalled();
    // The button comes back — a failed poster must not leave the row stuck on
    // "Preparing…" with no way to try again.
    expect(await screen.findByRole("button", { name: /download qr/i })).toBeEnabled();
  });

  it("has no poster to offer before the link is published", async () => {
    await panel([]);
    expect(screen.queryByRole("button", { name: /download qr/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /publish my link/i })).toBeInTheDocument();
  });
});
