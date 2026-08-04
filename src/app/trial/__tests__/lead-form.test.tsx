// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PHONE_ERROR_MESSAGE } from "@/lib/validation";
import type { ShopRequestStatus } from "@/lib/api";
import { ShopLeadForm } from "../lead-form";

type StepResult = { status?: ShopRequestStatus; error?: string };
type Action = (formData: FormData) => Promise<StepResult>;
type Verify = (requestId: string, code: string) => Promise<StepResult>;
type Resend = (requestId: string) => Promise<StepResult>;

const SENT: ShopRequestStatus = {
  requestId: "req-1",
  email: "p***@mehtapaints.in",
  expiresInSeconds: 900,
  cooldownSeconds: 60,
  status: "PENDING_EMAIL",
};

/** Fill every required field on stage one (phone and password passed in). */
async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  phone: string,
  password = "counter123",
  confirm = "counter123",
) {
  await user.type(screen.getByLabelText("Your name"), "Priya Mehta");
  await user.type(screen.getByLabelText("Shop name"), "Mehta Paint House");
  await user.type(screen.getByLabelText("Email"), "priya@mehtapaints.in");
  await user.type(screen.getByLabelText("Phone · WhatsApp"), phone);
  await user.type(screen.getByLabelText("City"), "Pune");
  await user.type(screen.getByLabelText("Password"), password);
  await user.type(screen.getByLabelText("Type it again"), confirm);
}

function renderForm(
  overrides: Partial<{ action: Action; verifyAction: Verify; resendAction: Resend }> = {},
) {
  const action = overrides.action ?? vi.fn<Action>(async () => ({ status: SENT }));
  const verifyAction =
    overrides.verifyAction ??
    vi.fn<Verify>(async () => ({ status: { ...SENT, status: "AWAITING_APPROVAL" } }));
  const resendAction = overrides.resendAction ?? vi.fn<Resend>(async () => ({ status: SENT }));
  render(<ShopLeadForm action={action} verifyAction={verifyAction} resendAction={resendAction} />);
  return { action, verifyAction, resendAction };
}

describe("ShopLeadForm", () => {
  it("blocks submission and shows the inline message for an invalid phone", async () => {
    const user = userEvent.setup();
    const { action } = renderForm();

    await fillForm(user, "12345");
    await user.click(screen.getByRole("button", { name: /Create my shop account/ }));

    expect(await screen.findByText(PHONE_ERROR_MESSAGE)).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });

  /** A mistyped password would lock the owner out of their own counter. */
  it("refuses to submit when the two passwords differ", async () => {
    const user = userEvent.setup();
    const { action } = renderForm();

    await fillForm(user, "+919822104476", "counter123", "counter124");
    await user.click(screen.getByRole("button", { name: /Create my shop account/ }));

    expect(await screen.findByText(/don't match/)).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });

  it("sends the request and moves on to the emailed code", async () => {
    const user = userEvent.setup();
    const action = vi.fn<Action>(async () => ({ status: SENT }));
    renderForm({ action });

    await fillForm(user, "+91 98 2210 4476");
    await user.click(screen.getByRole("button", { name: /Create my shop account/ }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const fd = action.mock.calls[0]![0];
    expect(fd.get("shopName")).toBe("Mehta Paint House");
    expect(fd.get("password")).toBe("counter123");
    expect(fd.get("confirmPassword")).toBe("counter123");
    // No plan is requested — a shop opens free and buys one later.
    expect(fd.get("tier")).toBeNull();

    // Stage two: the masked address and the code field.
    expect(await screen.findByText("p***@mehtapaints.in")).toBeInTheDocument();
    expect(screen.getByLabelText("Your 6-digit code")).toBeInTheDocument();
  });

  it("verifies the code and confirms the account is coming", async () => {
    const user = userEvent.setup();
    const { verifyAction } = renderForm();

    await fillForm(user, "+919822104476");
    await user.click(screen.getByRole("button", { name: /Create my shop account/ }));
    await screen.findByLabelText("Your 6-digit code");

    await user.type(screen.getByLabelText("Your 6-digit code"), "123456");
    await user.click(screen.getByRole("button", { name: /Confirm and finish/ }));

    await waitFor(() => expect(verifyAction).toHaveBeenCalledWith("req-1", "123456"));
    expect(await screen.findByText(/Email confirmed/)).toBeInTheDocument();
    expect(screen.getByText(/within 24 hours/)).toBeInTheDocument();
  });

  it("surfaces a server-side error inline", async () => {
    const user = userEvent.setup();
    renderForm({ action: vi.fn<Action>(async () => ({ error: "Too many attempts from your network." })) });

    await fillForm(user, "+919822104476");
    await user.click(screen.getByRole("button", { name: /Create my shop account/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts");
  });

  /** The "one free account per mailbox" refusal has to reach the shop verbatim. */
  it("shows the duplicate-account refusal from the server", async () => {
    const user = userEvent.setup();
    renderForm({
      action: vi.fn<Action>(async () => ({
        error: "A shop account has already been created for this email.",
      })),
    });

    await fillForm(user, "+919822104476");
    await user.click(screen.getByRole("button", { name: /Create my shop account/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("already been created");
  });
});
