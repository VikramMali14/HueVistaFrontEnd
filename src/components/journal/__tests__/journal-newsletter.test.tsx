// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { JournalNewsletter } from "../journal-newsletter";

const joinNewsletterAction = vi.fn();
vi.mock("@/lib/newsletter", () => ({
  joinNewsletterAction: (...args: unknown[]) => joinNewsletterAction(...args),
}));

/**
 * This form used to be a prop. Submitting it flipped a local `submitted` flag, printed
 * "Thank you ✓" and threw the address away — no request, no list, no letter. These
 * tests pin the two halves of the fix: the address really is sent, and the thank-you is
 * only shown once the server has said yes.
 */
describe("JournalNewsletter", () => {
  beforeEach(() => vi.clearAllMocks());

  const submit = (email: string) => {
    render(<JournalNewsletter />);
    const input = screen.getByLabelText(/email address/i) as HTMLInputElement;
    // jsdom does not implement reportValidity, which the form calls as a guard.
    input.form!.reportValidity = () => true;
    fireEvent.change(input, { target: { value: email } });
    fireEvent.click(screen.getByRole("button", { name: /subscribe/i }));
    return input;
  };

  it("sends the address to the newsletter endpoint", async () => {
    joinNewsletterAction.mockResolvedValue({ ok: true });

    submit("reader@example.com");

    await waitFor(() => expect(joinNewsletterAction).toHaveBeenCalledWith("reader@example.com"));
  });

  it("only thanks the reader once the signup actually landed", async () => {
    joinNewsletterAction.mockResolvedValue({ ok: true });

    submit("reader@example.com");

    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/on the list/i));
    expect(screen.getByText(/thank you/i)).toBeTruthy();
  });

  /**
   * The failure that mattered most: a rate limit, a bad address, a backend that is
   * down. The old form said "Thank you ✓" to every one of them, so a reader who was
   * never subscribed had no way to know.
   */
  it("surfaces a failure instead of claiming success", async () => {
    joinNewsletterAction.mockResolvedValue({ error: "Too many signups from here. Try later." });

    submit("reader@example.com");

    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/too many signups/i));
    expect(screen.queryByRole("status")).toBeNull();
    // Still editable, so they can try again.
    expect((screen.getByLabelText(/email address/i) as HTMLInputElement).disabled).toBe(false);
  });
});
