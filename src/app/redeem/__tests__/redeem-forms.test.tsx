// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ACCESS_CODE_ERROR_MESSAGE } from "@/lib/validation";
import { RedeemForm } from "../redeem-form";
import { GuestRedeemForm } from "../guest-redeem-form";
import { api } from "@/lib/api";
import { redeemGuestAction } from "@/lib/auth";

vi.mock("@/lib/api", () => {
  class HttpError extends Error {
    status: number;
    code?: string;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return {
    HttpError,
    api: { redeemAccessCode: vi.fn() },
  };
});

// `@/lib/auth` is a "use server" module importing next/headers — replace it wholesale.
vi.mock("@/lib/auth", () => ({
  redeemGuestAction: vi.fn(),
}));

// next/link needs the Next app-router runtime; render a plain anchor instead.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const redeemAccessCode = vi.mocked(api.redeemAccessCode);
const redeemGuest = vi.mocked(redeemGuestAction);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RedeemForm (member)", () => {
  it("keeps the Redeem button disabled until the code is a valid 8-character code", async () => {
    const user = userEvent.setup();
    render(<RedeemForm />);

    const input = screen.getByLabelText("Access code");
    const button = screen.getByRole("button", { name: /Redeem/ });

    expect(button).toBeDisabled();

    await user.type(input, "7K2NQ9P"); // 7 chars — still short
    expect(button).toBeDisabled();

    await user.type(input, "X"); // 8 chars — valid
    expect(button).toBeEnabled();
  });

  it("normalizes lowercase input to uppercase as you type", async () => {
    const user = userEvent.setup();
    render(<RedeemForm />);

    const input = screen.getByLabelText("Access code");
    await user.type(input, "7k2nq9px");

    expect(input).toHaveValue("7K2NQ9PX");
  });

  it("shows the validation error when submitting a 7-character code via Enter", async () => {
    const user = userEvent.setup();
    render(<RedeemForm />);

    const input = screen.getByLabelText("Access code");
    await user.type(input, "7K2NQ9P{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent(ACCESS_CODE_ERROR_MESSAGE);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(redeemAccessCode).not.toHaveBeenCalled();
  });

  it("redeems a valid 8-character code through the API and shows the success screen", async () => {
    const user = userEvent.setup();
    redeemAccessCode.mockResolvedValue({ validDays: 7 } as never);
    render(<RedeemForm />);

    await user.type(screen.getByLabelText("Access code"), "7k2nq9px");
    await user.click(screen.getByRole("button", { name: /Redeem/ }));

    expect(await screen.findByRole("heading", { name: /You're all set\./ })).toBeInTheDocument();
    expect(redeemAccessCode).toHaveBeenCalledTimes(1);
    expect(redeemAccessCode).toHaveBeenCalledWith({ code: "7K2NQ9PX" });
  });

  it("shows the API error message when redemption fails", async () => {
    const user = userEvent.setup();
    redeemAccessCode.mockRejectedValue(new Error("That code has already been used."));
    render(<RedeemForm />);

    await user.type(screen.getByLabelText("Access code"), "7K2NQ9PX");
    await user.click(screen.getByRole("button", { name: /Redeem/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That code has already been used.");
  });
});

describe("GuestRedeemForm", () => {
  it("keeps the Redeem button disabled for an invalid/short code", async () => {
    const user = userEvent.setup();
    render(<GuestRedeemForm />);

    const input = screen.getByLabelText("Access code");
    const button = screen.getByRole("button", { name: /Redeem/ });

    expect(button).toBeDisabled();
    await user.type(input, "7K2NQ9P");
    expect(button).toBeDisabled();
    await user.type(input, "X");
    expect(button).toBeEnabled();
  });

  it("shows the validation error for a 7-character code on an Enter submit attempt", async () => {
    render(<GuestRedeemForm />);

    const input = screen.getByLabelText("Access code");
    fireEvent.change(input, { target: { value: "7K2NQ9P" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(await screen.findByRole("alert")).toHaveTextContent(ACCESS_CODE_ERROR_MESSAGE);
    expect(redeemGuest).not.toHaveBeenCalled();
  });

  it("redeems a valid code via the server action and shows the guest success screen", async () => {
    const user = userEvent.setup();
    redeemGuest.mockResolvedValue({ shopName: "Mehta Paint House", validDays: 7 } as never);
    render(<GuestRedeemForm />);

    await user.type(screen.getByLabelText("Access code"), "7k2nq9px");
    await user.click(screen.getByRole("button", { name: /Redeem/ }));

    expect(await screen.findByRole("heading", { name: /You're in\./ })).toBeInTheDocument();
    expect(screen.getByText(/Mehta Paint House/)).toBeInTheDocument();
    expect(redeemGuest).toHaveBeenCalledTimes(1);
    expect(redeemGuest).toHaveBeenCalledWith("7K2NQ9PX");
  });

  it("surfaces a server-action error and stays on the form", async () => {
    const user = userEvent.setup();
    redeemGuest.mockResolvedValue({ error: "That code has expired." } as never);
    render(<GuestRedeemForm />);

    await user.type(screen.getByLabelText("Access code"), "7K2NQ9PX");
    await user.click(screen.getByRole("button", { name: /Redeem/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That code has expired.");
    expect(screen.getByLabelText("Access code")).toBeInTheDocument();
  });
});
