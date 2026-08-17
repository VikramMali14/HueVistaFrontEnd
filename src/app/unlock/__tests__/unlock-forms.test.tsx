// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ACCESS_CODE_ERROR_MESSAGE } from "@/lib/validation";
import { UnlockForm } from "../unlock-form";
import {
  addCodeToAccountAction,
  confirmKioskReentryAction,
  requestKioskReentryAction,
} from "@/lib/auth";

// `@/lib/auth` is a "use server" module importing next/headers — replace it wholesale.
// `logoutAction` is here for the LogoutButton the "wrong account" branch renders.
vi.mock("@/lib/auth", () => ({
  addCodeToAccountAction: vi.fn(),
  requestKioskReentryAction: vi.fn(),
  confirmKioskReentryAction: vi.fn(),
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

const addCodeToAccount = vi.mocked(addCodeToAccountAction);
const requestReentry = vi.mocked(requestKioskReentryAction);
const confirmReentry = vi.mocked(confirmKioskReentryAction);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("UnlockForm (signed out — a kiosk buyer coming back)", () => {
  /**
   * The load-bearing property of this screen. A printed code never expires, so if it
   * alone opened the account it would be a permanent password on a slip of till paper.
   * Signed out, there must be no box that takes one.
   */
  it("offers no code box at all — the way back is the email, not the receipt", () => {
    render(<UnlockForm />);

    expect(screen.queryByLabelText("Access code")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/email you gave at the shop/i)).toBeInTheDocument();
  });

  it("asks for a sign-in code by email", async () => {
    const user = userEvent.setup();
    requestReentry.mockResolvedValue({ sent: true } as never);
    render(<UnlockForm />);

    await user.type(screen.getByLabelText(/email you gave at the shop/i), "priya@example.com");
    await user.click(screen.getByRole("button", { name: /Email me a code/ }));

    expect(requestReentry).toHaveBeenCalledWith("priya@example.com");
    expect(await screen.findByLabelText(/code from your email/i)).toBeInTheDocument();
  });

  /**
   * The wording after sending must not reveal whether that address bought anything.
   * The backend refuses to say; a screen that said "we found your room" would answer
   * the question anyway, for anyone holding a stranger's address.
   */
  it("says nothing about whether that address actually has a room", async () => {
    const user = userEvent.setup();
    requestReentry.mockResolvedValue({ sent: true } as never);
    render(<UnlockForm />);

    await user.type(screen.getByLabelText(/email you gave at the shop/i), "nobody@example.com");
    await user.click(screen.getByRole("button", { name: /Email me a code/ }));

    // Conditional wording ("if that address has a room"), never a confirmation.
    expect(await screen.findByText(/has a room with us/i)).toBeInTheDocument();
    expect(screen.queryByText(/we found/i)).not.toBeInTheDocument();
  });

  it("signs the customer in once the emailed code is accepted", async () => {
    const user = userEvent.setup();
    requestReentry.mockResolvedValue({ sent: true } as never);
    confirmReentry.mockResolvedValue({ name: "Priya" } as never);
    render(<UnlockForm />);

    await user.type(screen.getByLabelText(/email you gave at the shop/i), "priya@example.com");
    await user.click(screen.getByRole("button", { name: /Email me a code/ }));

    await user.type(await screen.findByLabelText(/code from your email/i), "123456");
    await user.click(screen.getByRole("button", { name: /^Sign in/ }));

    expect(confirmReentry).toHaveBeenCalledWith("priya@example.com", "123456");
    expect(await screen.findByRole("heading", { name: /Welcome back\./ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open your rooms/ })).toHaveAttribute("href", "/my-projects");
  });

  it("keeps a refused code on the form with the backend's own wording", async () => {
    const user = userEvent.setup();
    requestReentry.mockResolvedValue({ sent: true } as never);
    confirmReentry.mockResolvedValue({ error: "Incorrect code. 3 attempts left." } as never);
    render(<UnlockForm />);

    await user.type(screen.getByLabelText(/email you gave at the shop/i), "priya@example.com");
    await user.click(screen.getByRole("button", { name: /Email me a code/ }));
    await user.type(await screen.findByLabelText(/code from your email/i), "000000");
    await user.click(screen.getByRole("button", { name: /^Sign in/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect code. 3 attempts left.");
  });

  /** A counter code needs an account to land on, so this points at the front door. */
  it("sends someone holding a counter code to sign in first", () => {
    render(<UnlockForm />);
    expect(screen.getByRole("link", { name: /Sign in/ })).toHaveAttribute("href", "/sign-in?next=/unlock");
    expect(screen.getByRole("link", { name: /Create an account/ })).toHaveAttribute("href", "/join?next=/unlock");
  });
});

describe("UnlockForm (a customer who is already signed in)", () => {
  /**
   * The bug this covers: running a signed-OUT route for a signed-in customer signs them
   * out and strands every project they already made. The code has to join the account
   * in hand instead.
   */
  it("adds the code to the current account instead of creating a new one", async () => {
    const user = userEvent.setup();
    addCodeToAccount.mockResolvedValue({ shopName: "Mehta Paints", projects: 3 } as never);
    render(<UnlockForm signedInAs={{ name: "Priya Sharma", role: "CUSTOMER" }} />);

    await user.type(screen.getByLabelText("Access code"), "7K2NQ9PX");
    await user.click(screen.getByRole("button", { name: /Add code/ }));

    expect(await screen.findByRole("heading", { name: /Code added\./ })).toBeInTheDocument();
    expect(screen.getByText(/3 projects from Mehta Paints/)).toBeInTheDocument();
    expect(addCodeToAccount).toHaveBeenCalledWith("7K2NQ9PX");
  });

  it("keeps the button disabled until the code is a valid 8-character code", async () => {
    const user = userEvent.setup();
    render(<UnlockForm signedInAs={{ name: "Priya Sharma", role: "CUSTOMER" }} />);

    const input = screen.getByLabelText("Access code");
    const button = screen.getByRole("button", { name: /Add code/ });
    expect(button).toBeDisabled();

    await user.type(input, "7K2NQ9P"); // 7 chars — still short
    expect(button).toBeDisabled();

    await user.type(input, "X"); // 8 chars — valid
    expect(button).toBeEnabled();
  });

  it("normalizes lowercase input to uppercase as you type", async () => {
    const user = userEvent.setup();
    render(<UnlockForm signedInAs={{ name: "Priya Sharma", role: "CUSTOMER" }} />);

    const input = screen.getByLabelText("Access code");
    await user.type(input, "7k2nq9px");
    expect(input).toHaveValue("7K2NQ9PX");
  });

  it("shows the validation error when submitting a short code via Enter", async () => {
    const user = userEvent.setup();
    render(<UnlockForm signedInAs={{ name: "Priya Sharma", role: "CUSTOMER" }} />);

    await user.type(screen.getByLabelText("Access code"), "7K2NQ9P{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent(ACCESS_CODE_ERROR_MESSAGE);
    expect(addCodeToAccount).not.toHaveBeenCalled();
  });

  it("keeps a refused code on the form with the backend's own wording", async () => {
    const user = userEvent.setup();
    addCodeToAccount.mockResolvedValue({ error: "This access code was cancelled by the shop" } as never);
    render(<UnlockForm signedInAs={{ name: "Priya Sharma", role: "CUSTOMER" }} />);

    await user.type(screen.getByLabelText("Access code"), "7K2NQ9PX");
    await user.click(screen.getByRole("button", { name: /Add code/ }));

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
      expect(addCodeToAccount).not.toHaveBeenCalled();
    },
  );

  it("points a shop at its own portal rather than the customer's code", () => {
    render(<UnlockForm signedInAs={{ name: "Mehta Paints", role: "RETAILER" }} />);
    expect(screen.getByRole("link", { name: /your customer portal/ })).toHaveAttribute("href", "/portal");
  });
});
