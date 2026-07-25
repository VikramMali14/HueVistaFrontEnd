// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ACCESS_CODE_ERROR_MESSAGE } from "@/lib/validation";
import { RedeemForm } from "../redeem-form";
import { redeemAccountAction } from "@/lib/auth";

// `@/lib/auth` is a "use server" module importing next/headers — replace it wholesale.
vi.mock("@/lib/auth", () => ({
  redeemAccountAction: vi.fn(),
}));

// next/link needs the Next app-router runtime; render a plain anchor instead.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const redeemAccount = vi.mocked(redeemAccountAction);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RedeemForm (no-login account redemption)", () => {
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
    expect(redeemAccount).not.toHaveBeenCalled();
  });

  it("redeems a valid code via the server action and greets the customer by first name", async () => {
    const user = userEvent.setup();
    redeemAccount.mockResolvedValue({ name: "Priya Sharma", shopName: "Mehta Paint House" } as never);
    render(<RedeemForm />);

    await user.type(screen.getByLabelText("Access code"), "7k2nq9px");
    await user.click(screen.getByRole("button", { name: /Redeem/ }));

    expect(await screen.findByRole("heading", { name: /Welcome, Priya\./ })).toBeInTheDocument();
    expect(screen.getByText(/Mehta Paint House/)).toBeInTheDocument();
    expect(redeemAccount).toHaveBeenCalledTimes(1);
    expect(redeemAccount).toHaveBeenCalledWith("7K2NQ9PX");
  });

  it("surfaces a server-action error and stays on the form", async () => {
    const user = userEvent.setup();
    redeemAccount.mockResolvedValue({ error: "That code has already been used or expired." } as never);
    render(<RedeemForm />);

    await user.type(screen.getByLabelText("Access code"), "7K2NQ9PX");
    await user.click(screen.getByRole("button", { name: /Redeem/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That code has already been used or expired.");
    expect(screen.getByLabelText("Access code")).toBeInTheDocument();
  });
});
