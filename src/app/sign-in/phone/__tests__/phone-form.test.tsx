// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PhoneSignInForm } from "../phone-form";

/**
 * The mobile sign-in form.
 *
 * <p>Firebase and the server action are both mocked: what is under test is the two-step
 * conversation the customer has — that a number is composed into E.164 correctly, that
 * a failure at each step says the right thing, and above all that a failure in OUR
 * backend is not reported as a wrong code.
 */

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh, push: vi.fn() }),
}));

const sendSmsCode = vi.fn();
const confirmSmsCode = vi.fn();
const clearRecaptcha = vi.fn();
vi.mock("@/lib/firebase", () => ({
  sendSmsCode: (...args: unknown[]) => sendSmsCode(...args),
  confirmSmsCode: (...args: unknown[]) => confirmSmsCode(...args),
  clearRecaptcha: () => clearRecaptcha(),
  phoneAuthErrorMessage: (err: unknown) =>
    typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "auth/invalid-verification-code"
      ? "That code isn't right. Check the text and try again."
      : "We couldn't send that code. Please try again, or sign in with your email.",
  phoneSignInEnabled: true,
}));

const signInWithPhoneAction = vi.fn();
vi.mock("@/lib/auth", () => ({
  signInWithPhoneAction: (...args: unknown[]) => signInWithPhoneAction(...args),
}));

const confirmation = { confirm: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  sendSmsCode.mockResolvedValue(confirmation);
  confirmSmsCode.mockResolvedValue("firebase-id-token");
  signInWithPhoneAction.mockResolvedValue({ next: "/dashboard" });
});

/** Walk the first step: type a number and ask for a code. */
async function requestCode(user: ReturnType<typeof userEvent.setup>, digits = "9876543210") {
  await user.type(screen.getByLabelText("Mobile number"), digits);
  await user.click(screen.getByRole("button", { name: /Text me a code/ }));
  return screen.findByLabelText("Your 6-digit code");
}

describe("PhoneSignInForm — asking for the code", () => {
  it("composes the dial code and the number into E.164 before sending", async () => {
    const user = userEvent.setup();
    render(<PhoneSignInForm next="/dashboard" enabled />);

    await requestCode(user);

    // +91 is the default, and the SMS must be addressed to a full international
    // number — a bare "9876543210" is refused by Firebase.
    expect(sendSmsCode).toHaveBeenCalledWith("+919876543210", expect.any(String));
  });

  it("strips punctuation out of a pasted number instead of refusing it", async () => {
    const user = userEvent.setup();
    render(<PhoneSignInForm next="/dashboard" enabled />);

    await requestCode(user, "(98765) 43-210");

    expect(sendSmsCode).toHaveBeenCalledWith("+919876543210", expect.any(String));
  });

  it("uses the chosen country's dial code", async () => {
    const user = userEvent.setup();
    render(<PhoneSignInForm next="/dashboard" enabled />);

    await user.selectOptions(screen.getByLabelText("Country dialling code"), "+971");
    await requestCode(user, "501234567");

    expect(sendSmsCode).toHaveBeenCalledWith("+971501234567", expect.any(String));
  });

  it("does not spend an SMS on an obviously incomplete number", async () => {
    const user = userEvent.setup();
    render(<PhoneSignInForm next="/dashboard" enabled />);

    await user.type(screen.getByLabelText("Mobile number"), "98");
    await user.click(screen.getByRole("button", { name: /Text me a code/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Enter your mobile number.");
    expect(sendSmsCode).not.toHaveBeenCalled();
  });

  it("reports a Firebase failure and stays on the number step", async () => {
    const user = userEvent.setup();
    sendSmsCode.mockRejectedValue({ code: "auth/too-many-requests" });
    render(<PhoneSignInForm next="/dashboard" enabled />);

    await user.type(screen.getByLabelText("Mobile number"), "9876543210");
    await user.click(screen.getByRole("button", { name: /Text me a code/ }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByLabelText("Mobile number")).toBeInTheDocument();
    expect(screen.queryByLabelText("Your 6-digit code")).not.toBeInTheDocument();
  });
});

describe("PhoneSignInForm — entering the code", () => {
  it("signs in and navigates on a correct code", async () => {
    const user = userEvent.setup();
    render(<PhoneSignInForm next="/my-projects" enabled />);

    const codeField = await requestCode(user);
    await user.type(codeField, "123456");
    await user.click(screen.getByRole("button", { name: /^Sign in/ }));

    await waitFor(() => expect(signInWithPhoneAction).toHaveBeenCalled());
    expect(signInWithPhoneAction).toHaveBeenCalledWith(
      expect.objectContaining({ idToken: "firebase-id-token", next: "/my-projects" }),
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
  });

  it("passes the typed name through, for a number we have never seen", async () => {
    const user = userEvent.setup();
    render(<PhoneSignInForm next="/dashboard" enabled />);

    await user.type(screen.getByLabelText("Mobile number"), "9876543210");
    await user.type(screen.getByLabelText(/Your name/), "Asha Patel");
    await user.click(screen.getByRole("button", { name: /Text me a code/ }));

    await user.type(await screen.findByLabelText("Your 6-digit code"), "123456");
    await user.click(screen.getByRole("button", { name: /^Sign in/ }));

    await waitFor(() =>
      expect(signInWithPhoneAction).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Asha Patel" }),
      ),
    );
  });

  it("does not call the backend for a code that is not six digits", async () => {
    const user = userEvent.setup();
    render(<PhoneSignInForm next="/dashboard" enabled />);

    const codeField = await requestCode(user);
    await user.type(codeField, "123");
    await user.click(screen.getByRole("button", { name: /^Sign in/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("6-digit code");
    expect(confirmSmsCode).not.toHaveBeenCalled();
  });

  it("says the code is wrong when Firebase rejects it", async () => {
    const user = userEvent.setup();
    confirmSmsCode.mockRejectedValue({ code: "auth/invalid-verification-code" });
    render(<PhoneSignInForm next="/dashboard" enabled />);

    const codeField = await requestCode(user);
    await user.type(codeField, "000000");
    await user.click(screen.getByRole("button", { name: /^Sign in/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That code isn't right");
    expect(signInWithPhoneAction).not.toHaveBeenCalled();
  });

  it("does NOT blame the code when it was our backend that refused", async () => {
    // The distinction matters: the customer would otherwise be sent back to re-read
    // a text that was perfectly correct. An admin account hitting this path is the
    // real case — the backend refuses it and explains why.
    const user = userEvent.setup();
    signInWithPhoneAction.mockResolvedValue({
      error: "Admin accounts sign in with an email address and password.",
    });
    render(<PhoneSignInForm next="/dashboard" enabled />);

    const codeField = await requestCode(user);
    await user.type(codeField, "123456");
    await user.click(screen.getByRole("button", { name: /^Sign in/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("email address and password");
    expect(replace).not.toHaveBeenCalled();
  });

  it("offers a way back when the number was typed wrong", async () => {
    const user = userEvent.setup();
    render(<PhoneSignInForm next="/dashboard" enabled />);

    await requestCode(user);
    await user.click(screen.getByRole("button", { name: /Wrong number/ }));

    expect(screen.getByLabelText("Mobile number")).toBeInTheDocument();
    expect(screen.queryByLabelText("Your 6-digit code")).not.toBeInTheDocument();
  });

  it("holds the resend button shut until the cooldown has run", async () => {
    const user = userEvent.setup();
    render(<PhoneSignInForm next="/dashboard" enabled />);

    await requestCode(user);

    // One SMS per press, and not one per impatient double-press.
    expect(screen.getByRole("button", { name: /Send another code in \d+s/ })).toBeDisabled();
    expect(sendSmsCode).toHaveBeenCalledTimes(1);
  });
});

describe("PhoneSignInForm — when the feature is off", () => {
  it("says so instead of showing a button that cannot work", () => {
    render(<PhoneSignInForm next="/dashboard" enabled={false} />);

    expect(screen.getByRole("alert")).toHaveTextContent("isn't switched on");
    expect(screen.queryByLabelText("Mobile number")).not.toBeInTheDocument();
  });
});
