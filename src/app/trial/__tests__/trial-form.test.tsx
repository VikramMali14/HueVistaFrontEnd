// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PHONE_ERROR_MESSAGE } from "@/lib/validation";
import { TrialForm } from "../form";

type Action = (formData: FormData) => Promise<{ error?: string } | void>;

/** Fill every required field except phone (passed in), then tick the terms box. */
async function fillForm(user: ReturnType<typeof userEvent.setup>, phone: string) {
  await user.type(screen.getByLabelText("First name"), "Priya");
  await user.type(screen.getByLabelText("Last name"), "Mehta");
  await user.type(screen.getByLabelText("Email"), "priya@mehtapaints.in");
  await user.type(screen.getByLabelText("Phone · WhatsApp"), phone);
  await user.type(screen.getByLabelText("Password"), "longenoughpw");
  await user.type(screen.getByLabelText("Shop name"), "Mehta Paint House");
  await user.type(screen.getByLabelText("City"), "Pune");
  await user.click(screen.getByRole("checkbox"));
}

describe("TrialForm", () => {
  it("blocks submission and shows the inline message for an invalid phone", async () => {
    const user = userEvent.setup();
    const action = vi.fn<Action>(async () => undefined);
    render(<TrialForm action={action} />);

    await fillForm(user, "12345");
    await user.click(screen.getByRole("button", { name: /Begin the trial/ }));

    expect(await screen.findByText(PHONE_ERROR_MESSAGE)).toBeInTheDocument();
    const phoneInput = screen.getByLabelText("Phone · WhatsApp");
    expect(phoneInput).toHaveAttribute("aria-invalid", "true");
    expect(phoneInput).toHaveAttribute("aria-describedby", "phone-error");
    expect(action).not.toHaveBeenCalled();
  });

  it("clears the phone error once the field changes", async () => {
    const user = userEvent.setup();
    const action = vi.fn<Action>(async () => undefined);
    render(<TrialForm action={action} />);

    await fillForm(user, "12345");
    await user.click(screen.getByRole("button", { name: /Begin the trial/ }));
    expect(await screen.findByText(PHONE_ERROR_MESSAGE)).toBeInTheDocument();

    await user.type(screen.getByLabelText("Phone · WhatsApp"), "6");
    expect(screen.queryByText(PHONE_ERROR_MESSAGE)).not.toBeInTheDocument();
  });

  it("submits the form data through the action for a valid phone", async () => {
    const user = userEvent.setup();
    const action = vi.fn<Action>(async () => undefined);
    render(<TrialForm action={action} />);

    await fillForm(user, "+91 98765 43210");
    await user.click(screen.getByRole("button", { name: /Begin the trial/ }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const fd = action.mock.calls[0]![0];
    expect(fd.get("phone")).toBe("+91 98765 43210");
    expect(fd.get("email")).toBe("priya@mehtapaints.in");
    expect(fd.get("shopName")).toBe("Mehta Paint House");
    expect(fd.get("tier")).toBe("pro"); // the recommended tier is pre-selected
    expect(screen.queryByText(PHONE_ERROR_MESSAGE)).not.toBeInTheDocument();
  });

  it("requires the terms checkbox before anything else", async () => {
    const user = userEvent.setup();
    const action = vi.fn<Action>(async () => undefined);
    render(<TrialForm action={action} />);

    await user.click(screen.getByRole("button", { name: /Begin the trial/ }));

    expect(await screen.findByText("Please accept the terms to begin a trial.")).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });

  it("shows the server error returned by the action", async () => {
    const user = userEvent.setup();
    const action = vi.fn<Action>(async () => ({ error: "An account with this email already exists." }));
    render(<TrialForm action={action} />);

    await fillForm(user, "9876543210");
    await user.click(screen.getByRole("button", { name: /Begin the trial/ }));

    expect(await screen.findByText("An account with this email already exists.")).toBeInTheDocument();
  });
});
