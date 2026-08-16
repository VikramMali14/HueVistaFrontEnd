// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ACCESS_CODE_ERROR_MESSAGE } from "@/lib/validation";
import { UnlockForm } from "../unlock-form";
import { addCodeToAccountAction, unlockAccountAction } from "@/lib/auth";

// `@/lib/auth` is a "use server" module importing next/headers — replace it wholesale.
// `logoutAction` is here for the LogoutButton the "wrong account" branch renders.
vi.mock("@/lib/auth", () => ({
  unlockAccountAction: vi.fn(),
  addCodeToAccountAction: vi.fn(),
  logoutAction: vi.fn(),
}));

// next/link needs the Next app-router runtime; render a plain anchor instead.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const unlockAccount = vi.mocked(unlockAccountAction);
const addCodeToAccount = vi.mocked(addCodeToAccountAction);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("UnlockForm (no-login account unlock)", () => {
  it("keeps the Unlock button disabled until the code is a valid 8-character code", async () => {
    const user = userEvent.setup();
    render(<UnlockForm />);

    const input = screen.getByLabelText("Access code");
    const button = screen.getByRole("button", { name: /Unlock/ });

    expect(button).toBeDisabled();

    await user.type(input, "7K2NQ9P"); // 7 chars — still short
    expect(button).toBeDisabled();

    await user.type(input, "X"); // 8 chars — valid
    expect(button).toBeEnabled();
  });

  it("normalizes lowercase input to uppercase as you type", async () => {
    const user = userEvent.setup();
    render(<UnlockForm />);

    const input = screen.getByLabelText("Access code");
    await user.type(input, "7k2nq9px");

    expect(input).toHaveValue("7K2NQ9PX");
  });

  it("shows the validation error when submitting a 7-character code via Enter", async () => {
    const user = userEvent.setup();
    render(<UnlockForm />);

    const input = screen.getByLabelText("Access code");
    await user.type(input, "7K2NQ9P{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent(ACCESS_CODE_ERROR_MESSAGE);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(unlockAccount).not.toHaveBeenCalled();
  });

  it("unlocks with a valid code via the server action and greets the customer by first name", async () => {
    const user = userEvent.setup();
    unlockAccount.mockResolvedValue({ name: "Priya Sharma", shopName: "Mehta Paint House" } as never);
    render(<UnlockForm />);

    await user.type(screen.getByLabelText("Access code"), "7k2nq9px");
    await user.click(screen.getByRole("button", { name: /Unlock/ }));

    expect(await screen.findByRole("heading", { name: /Welcome, Priya\./ })).toBeInTheDocument();
    expect(screen.getByText(/Mehta Paint House/)).toBeInTheDocument();
    expect(unlockAccount).toHaveBeenCalledTimes(1);
    expect(unlockAccount).toHaveBeenCalledWith("7K2NQ9PX");
  });

  it("surfaces a server-action error and stays on the form", async () => {
    const user = userEvent.setup();
    unlockAccount.mockResolvedValue({ error: "That code has already been used or expired." } as never);
    render(<UnlockForm />);

    await user.type(screen.getByLabelText("Access code"), "7K2NQ9PX");
    await user.click(screen.getByRole("button", { name: /Unlock/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That code has already been used or expired.");
    expect(screen.getByLabelText("Access code")).toBeInTheDocument();
  });

  /**
   * A kiosk code is consumed by a GUEST, so the account route can only ever refuse it.
   * The action falls back to resuming the guest session — the promise printed on the
   * kiosk receipt — and the screen has to send them to the guest studio, not a dashboard
   * they have no account for.
   */
  it("sends a resumed kiosk code to the guest studio", async () => {
    const user = userEvent.setup();
    unlockAccount.mockResolvedValue({ guest: true, shopName: "Mehta Paints", validDays: 7 } as never);
    render(<UnlockForm />);

    await user.type(screen.getByLabelText("Access code"), "7K2NQ9PX");
    await user.click(screen.getByRole("button", { name: /Unlock/ }));

    expect(await screen.findByRole("heading", { name: /Welcome back\./ })).toBeInTheDocument();
    const open = screen.getByRole("link", { name: /Open your room/ });
    expect(open).toHaveAttribute("href", "/guest-studio");
  });
});

describe("UnlockForm (a customer who is already signed in)", () => {
  /**
   * The bug this covers: running the signed-OUT route for a signed-in customer signs
   * them out and mints a second account keyed to the new code, stranding every project
   * they already made. The code has to join the account in hand instead.
   */
  it("adds the code to the current account instead of creating a new one", async () => {
    const user = userEvent.setup();
    addCodeToAccount.mockResolvedValue({ shopName: "Mehta Paints", projects: 3 } as never);
    render(<UnlockForm signedInAs={{ name: "Priya Sharma", role: "CUSTOMER" }} />);

    await user.type(screen.getByLabelText("Access code"), "7K2NQ9PX");
    await user.click(screen.getByRole("button", { name: /Unlock/ }));

    expect(await screen.findByRole("heading", { name: /Code added\./ })).toBeInTheDocument();
    expect(screen.getByText(/3 projects from Mehta Paints/)).toBeInTheDocument();
    expect(addCodeToAccount).toHaveBeenCalledWith("7K2NQ9PX");
    // The account-creating route must not run for someone who already has an account.
    expect(unlockAccount).not.toHaveBeenCalled();
  });

  it("keeps a refused code on the form with the backend's own wording", async () => {
    const user = userEvent.setup();
    addCodeToAccount.mockResolvedValue({ error: "This access code was cancelled by the shop" } as never);
    render(<UnlockForm signedInAs={{ name: "Priya Sharma", role: "CUSTOMER" }} />);

    await user.type(screen.getByLabelText("Access code"), "7K2NQ9PX");
    await user.click(screen.getByRole("button", { name: /Unlock/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This access code was cancelled by the shop");
    expect(screen.getByLabelText("Access code")).toBeInTheDocument();
  });
});

describe("UnlockForm (a shop or admin is signed in)", () => {
  /**
   * Redeeming would flip the account's role and swap the shop's own till session for
   * the customer's, mid-sale. There is no code box at all — the only honest next step
   * is to leave the account first.
   */
  it.each(["RETAILER", "ADMIN", "DISTRIBUTOR", "PAINTER"] as const)(
    "refuses to redeem on a %s account and offers a sign-out instead",
    async (role) => {
      render(<UnlockForm signedInAs={{ name: "Mehta Paints", role }} />);

      expect(screen.queryByLabelText("Access code")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Sign out and unlock/ })).toBeInTheDocument();
      expect(unlockAccount).not.toHaveBeenCalled();
      expect(addCodeToAccount).not.toHaveBeenCalled();
    },
  );

  it("points a shop at its own portal rather than the customer's code", () => {
    render(<UnlockForm signedInAs={{ name: "Mehta Paints", role: "RETAILER" }} />);
    expect(screen.getByRole("link", { name: /your customer portal/ })).toHaveAttribute("href", "/portal");
  });
});
