// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectDetailsGate, type ProjectDetails } from "../project-details-gate";

describe("ProjectDetailsGate", () => {
  it("renders the step-0 form", () => {
    render(<ProjectDetailsGate onSubmit={() => {}} />);

    expect(screen.getByRole("heading", { name: "Name your project" })).toBeInTheDocument();
    expect(screen.getByLabelText("Project name")).toBeInTheDocument();
    expect(screen.getByLabelText("Room type")).toBeInTheDocument();
    expect(screen.getByLabelText("Notes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continue to photo/ })).toBeInTheDocument();
  });

  it("refuses to submit while the name is empty and shows the inline error", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ProjectDetailsGate onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: /Continue to photo/ }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Please enter a name to continue.");

    // Whitespace-only names are still invalid.
    await user.type(screen.getByLabelText("Project name"), "   ");
    await user.click(screen.getByRole("button", { name: /Continue to photo/ }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits the trimmed name with room type and notes", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(details: ProjectDetails) => void>();
    render(<ProjectDetailsGate onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Project name"), "  Sharma residence — hall  ");
    await user.selectOptions(screen.getByLabelText("Room type"), "Living room");
    await user.type(screen.getByLabelText("Notes"), "Client prefers warm tones");
    await user.click(screen.getByRole("button", { name: /Continue to photo/ }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Sharma residence — hall",
      roomType: "Living room",
      notes: "Client prefers warm tones",
    });
  });

  it("omits the optional fields when left blank", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(details: ProjectDetails) => void>();
    render(<ProjectDetailsGate onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Project name"), "Hall repaint");
    await user.click(screen.getByRole("button", { name: /Continue to photo/ }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Hall repaint",
      roomType: undefined,
      notes: undefined,
    });
  });

  it("submits on Enter in the name field", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(details: ProjectDetails) => void>();
    render(<ProjectDetailsGate onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Project name"), "Bedroom refresh{Enter}");

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Bedroom refresh",
      roomType: undefined,
      notes: undefined,
    });
  });
});
