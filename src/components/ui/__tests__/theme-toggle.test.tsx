// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "../theme-toggle";

beforeEach(() => {
  // The root layout's inline script normally sets this before paint; the
  // toggle itself only ever flips whatever is already applied.
  document.documentElement.setAttribute("data-theme", "dark");
  localStorage.clear();
});

describe("ThemeToggle", () => {
  it("offers the light theme while dark is applied", async () => {
    render(<ThemeToggle />);
    expect(
      await screen.findByRole("button", { name: "Switch to light theme" }),
    ).toBeInTheDocument();
  });

  it("flips <html data-theme> to light and persists the choice", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(await screen.findByRole("button", { name: "Switch to light theme" }));

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(localStorage.getItem("hv-theme")).toBe("light");
    // The button now offers the way back.
    expect(screen.getByRole("button", { name: "Switch to dark theme" })).toBeInTheDocument();
  });

  it("toggles back to dark on a second click", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(await screen.findByRole("button", { name: "Switch to light theme" }));
    await user.click(screen.getByRole("button", { name: "Switch to dark theme" }));

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("hv-theme")).toBe("dark");
  });

  it("respects a light theme applied before mount (e.g. by the layout script)", async () => {
    document.documentElement.setAttribute("data-theme", "light");
    render(<ThemeToggle />);
    expect(
      await screen.findByRole("button", { name: "Switch to dark theme" }),
    ).toBeInTheDocument();
  });
});
