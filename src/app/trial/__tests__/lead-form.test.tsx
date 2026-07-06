// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PHONE_ERROR_MESSAGE } from "@/lib/validation";
import { ShopLeadForm } from "../lead-form";

type Action = (formData: FormData) => Promise<{ ok?: true; error?: string }>;

/** Fill every required field except phone (passed in). */
async function fillForm(user: ReturnType<typeof userEvent.setup>, phone: string) {
  await user.type(screen.getByLabelText("Your name"), "Priya Mehta");
  await user.type(screen.getByLabelText("Shop name"), "Mehta Paint House");
  await user.type(screen.getByLabelText("Email"), "priya@mehtapaints.in");
  await user.type(screen.getByLabelText("Phone · WhatsApp"), phone);
  await user.type(screen.getByLabelText("City"), "Pune");
}

describe("ShopLeadForm", () => {
  it("blocks submission and shows the inline message for an invalid phone", async () => {
    const user = userEvent.setup();
    const action = vi.fn<Action>(async () => ({ ok: true }));
    render(<ShopLeadForm action={action} />);

    await fillForm(user, "12345");
    await user.click(screen.getByRole("button", { name: /Request my shop account/ }));

    expect(await screen.findByText(PHONE_ERROR_MESSAGE)).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });

  it("submits the lead and shows the call-back confirmation", async () => {
    const user = userEvent.setup();
    const action = vi.fn<Action>(async () => ({ ok: true }));
    render(<ShopLeadForm action={action} />);

    await fillForm(user, "+91 98 2210 4476");
    await user.click(screen.getByRole("button", { name: /Request my shop account/ }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const fd = action.mock.calls[0]![0];
    expect(fd.get("shopName")).toBe("Mehta Paint House");
    expect(fd.get("tier")).toBe("pro"); // Professional pre-selected
    expect(await screen.findByText(/Request received/)).toBeInTheDocument();
  });

  it("surfaces a server-side error inline", async () => {
    const user = userEvent.setup();
    const action = vi.fn<Action>(async () => ({ error: "Too many attempts from your network." }));
    render(<ShopLeadForm action={action} />);

    await fillForm(user, "+919822104476");
    await user.click(screen.getByRole("button", { name: /Request my shop account/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts");
  });
});
