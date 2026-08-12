// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AdminProjectRow } from "@/lib/types";
import { MaskViewer } from "../mask-viewer";

/**
 * The picker, not the compositor. Everything below stops short of "Load masks" on
 * purpose: pressing it rasterizes masks onto a real canvas, which jsdom does not
 * implement, and the layer maths is not what changed here. What changed is WHICH rooms
 * this screen can reach — it used to be the admin's own, which are the one set of rooms
 * nobody ever reports.
 */

function row(overrides: Partial<AdminProjectRow> = {}): AdminProjectRow {
  return {
    id: "proj-1",
    name: "Front bedroom",
    status: "SEGMENTED",
    maskMode: "AUTO",
    regionCount: 3,
    hasCleanedImage: true,
    updatedAt: "2026-08-11T09:00:00",
    ownerName: "Asha Rao",
    ownerEmail: "asha@example.com",
    ownerRole: "CUSTOMER",
    ...overrides,
  };
}

const noop = {
  search: () => Promise.resolve({ rows: [] }),
  load: () => Promise.resolve({ project: undefined, error: "not used in these tests" }),
};

function renderViewer(props: Partial<Parameters<typeof MaskViewer>[0]> = {}) {
  return render(
    <MaskViewer
      initial={[row()]}
      searchAction={noop.search}
      loadAction={noop.load}
      {...props}
    />,
  );
}

describe("MaskViewer — reaching rooms the admin does not own", () => {
  it("names the account each room belongs to", async () => {
    renderViewer();
    const picker = screen.getByLabelText(/^Room/) as HTMLSelectElement;
    expect(picker.options[0]!.text).toContain("Front bedroom");
    expect(picker.options[0]!.text).toContain("asha@example.com");
  });

  it("identifies a walk-in's room by its shop and code, since no account exists", async () => {
    renderViewer({
      initial: [
        row({
          id: "proj-walkin",
          name: "Sunita's living room",
          ownerName: null,
          ownerEmail: null,
          ownerRole: null,
          customerName: "Sunita",
          shopName: "Asha Paints Kolhapur",
          accessCode: "WALKIN01",
        }),
      ],
    });
    const picker = screen.getByLabelText(/^Room/) as HTMLSelectElement;
    expect(picker.options[0]!.text).toContain("Sunita (walk-in)");
    expect(picker.options[0]!.text).toContain("Asha Paints Kolhapur");
  });

  it("flags the run states worth opening — no regions, manual, never cleaned", async () => {
    renderViewer({
      initial: [row({ regionCount: 0, maskMode: "MANUAL", hasCleanedImage: false })],
    });
    const text = (screen.getByLabelText(/^Room/) as HTMLSelectElement).options[0]!.text;
    expect(text).toContain("no regions");
    expect(text).toContain("manual");
    expect(text).toContain("not cleaned");
  });

  it("opens on the room it was linked to, so a report goes straight to its masks", () => {
    renderViewer({
      initial: [row({ id: "proj-1" }), row({ id: "proj-2", name: "Back wall" })],
      initialProjectId: "proj-2",
    });
    expect((screen.getByLabelText(/^Room/) as HTMLSelectElement).value).toBe("proj-2");
  });

  it("puts the whole platform behind one search box", async () => {
    const user = userEvent.setup();
    const searchAction = vi.fn(async () => ({
      rows: [row({ id: "proj-9", name: "Shop counter wall" })],
    }));
    renderViewer({ searchAction });

    await user.type(screen.getByLabelText("Find a room"), "asha@shop.test");
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(searchAction).toHaveBeenCalledWith("asha@shop.test");
    await waitFor(() =>
      expect((screen.getByLabelText(/^Room/) as HTMLSelectElement).value).toBe("proj-9"),
    );
  });

  it("keeps the chosen room selected when it survives a narrower search", async () => {
    const user = userEvent.setup();
    const searchAction = vi.fn(async () => ({
      rows: [row({ id: "proj-2", name: "Back wall" }), row({ id: "proj-1" })],
    }));
    renderViewer({
      initial: [row({ id: "proj-1" }), row({ id: "proj-2", name: "Back wall" })],
      initialProjectId: "proj-1",
      searchAction,
    });

    await user.click(screen.getByRole("button", { name: "Search" }));

    // Refining a query must not quietly move the admin to a different room.
    await waitFor(() => expect(searchAction).toHaveBeenCalled());
    expect((screen.getByLabelText(/^Room/) as HTMLSelectElement).value).toBe("proj-1");
  });

  it("says nothing matched, rather than pretending the platform is empty", async () => {
    const user = userEvent.setup();
    renderViewer({ searchAction: async () => ({ rows: [] }) });

    await user.type(screen.getByLabelText("Find a room"), "nobody");
    await user.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() =>
      expect(screen.getByText("Nothing matched that search")).toBeInTheDocument(),
    );
  });

  it("distinguishes an outage from an empty platform", () => {
    // Null initial means the fetch FAILED. Rendering that as "no rooms" would send an
    // admin looking for a room that is actually right there.
    renderViewer({ initial: null });
    expect(screen.getByRole("alert")).toHaveTextContent(/could not load the rooms/i);
    expect(screen.getByText("Rooms unavailable")).toBeInTheDocument();
  });

  it("surfaces a failed search instead of blanking the list", async () => {
    const user = userEvent.setup();
    renderViewer({ searchAction: async () => ({ error: "Your session expired." }) });

    await user.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Your session expired."),
    );
    expect((screen.getByLabelText(/^Room/) as HTMLSelectElement).value).toBe("proj-1");
  });
});
