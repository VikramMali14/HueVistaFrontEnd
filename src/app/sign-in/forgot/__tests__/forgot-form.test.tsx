// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EMAIL_ERROR_MESSAGE } from "@/lib/validation";
import { ForgotForm } from "../forgot-form";

// next/link needs the Next app-router runtime; render a plain anchor instead.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function okJson(body: Record<string, unknown> = {}) {
  return { ok: true, json: async () => body };
}

describe("ForgotForm — request step", () => {
  it("shows the email validation message and does NOT call the API for an invalid email", async () => {
    const user = userEvent.setup();
    render(<ForgotForm />);

    await user.type(screen.getByLabelText("Shop email"), "not-an-email");
    await user.click(screen.getByRole("button", { name: /Send reset code/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(EMAIL_ERROR_MESSAGE);
    expect(screen.getByLabelText("Shop email")).toHaveAttribute("aria-invalid", "true");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts a valid email to /api/auth/forgot-password and advances to the reset step", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(okJson());
    render(<ForgotForm />);

    await user.type(screen.getByLabelText("Shop email"), "priya@mehtapaints.in");
    await user.click(screen.getByRole("button", { name: /Send reset code/ }));

    expect(await screen.findByLabelText("Reset code")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/auth/forgot-password");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ email: "priya@mehtapaints.in" });
  });

  it("clears the field error as soon as the email changes", async () => {
    const user = userEvent.setup();
    render(<ForgotForm />);

    await user.type(screen.getByLabelText("Shop email"), "nope");
    await user.click(screen.getByRole("button", { name: /Send reset code/ }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Shop email"), "x");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("surfaces a transport failure in the bottom error block", async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<ForgotForm />);

    await user.type(screen.getByLabelText("Shop email"), "priya@mehtapaints.in");
    await user.click(screen.getByRole("button", { name: /Send reset code/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Network error. Please try again.");
    // Still on the request step.
    expect(screen.getByLabelText("Shop email")).toBeInTheDocument();
  });
});

describe("ForgotForm — reset step", () => {
  async function goToResetStep(user: ReturnType<typeof userEvent.setup>) {
    fetchMock.mockResolvedValue(okJson());
    await user.type(screen.getByLabelText("Shop email"), "priya@mehtapaints.in");
    await user.click(screen.getByRole("button", { name: /Send reset code/ }));
    await screen.findByLabelText("Reset code");
    fetchMock.mockClear();
  }

  it("validates the code and password fields inline without posting", async () => {
    const user = userEvent.setup();
    render(<ForgotForm />);
    await goToResetStep(user);

    await user.type(screen.getByLabelText("Reset code"), "12"); // < 4 digits
    await user.type(screen.getByLabelText("New password"), "short"); // < 8 chars
    await user.click(screen.getByRole("button", { name: /Reset password/ }));

    expect(await screen.findByText("Enter the 6-digit code from your email.")).toBeInTheDocument();
    expect(screen.getByText("Use a new password of at least 8 characters.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the code and new password and shows the done screen", async () => {
    const user = userEvent.setup();
    render(<ForgotForm />);
    await goToResetStep(user);

    fetchMock.mockResolvedValue(okJson());
    await user.type(screen.getByLabelText("Reset code"), "123456");
    await user.type(screen.getByLabelText("New password"), "brand-new-password");
    await user.click(screen.getByRole("button", { name: /Reset password/ }));

    expect(await screen.findByText("Password reset.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/auth/reset-password");
    expect(JSON.parse(String(init.body))).toEqual({
      email: "priya@mehtapaints.in",
      code: "123456",
      newPassword: "brand-new-password",
    });
  });
});
