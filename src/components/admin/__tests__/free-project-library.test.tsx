// @vitest-environment jsdom
/**
 * Putting a room in the public gallery.
 *
 * The publishing form was reachable only from a text link on the admin console,
 * three screens away from the studio where you can actually SEE that a room is
 * worth publishing — so the feature read as missing. The studio now links straight
 * here with the room named in the URL, and what is pinned below is that arriving
 * that way lands you on a form that is already filled in, and that a link naming a
 * room which CAN'T be published says so instead of opening on nothing.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PublishableProject } from "@/lib/api";
import { FreeProjectLibrary } from "../free-project-library";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));

function source(overrides: Partial<PublishableProject> = {}): PublishableProject {
  return {
    id: "proj-1",
    name: "Sunlit living room",
    status: "SEGMENTED",
    imageUrl: "https://media.example.com/rooms/proj-1.jpg",
    regionCount: 3,
    eligible: true,
    ...overrides,
  };
}

function renderLibrary(props: Partial<React.ComponentProps<typeof FreeProjectLibrary>> = {}) {
  return render(
    <FreeProjectLibrary
      initial={[]}
      sources={[source()]}
      publishAction={vi.fn()}
      startAction={vi.fn()}
      setPublishedAction={vi.fn()}
      refreshAction={vi.fn()}
      deleteAction={vi.fn()}
      {...props}
    />,
  );
}

describe("FreeProjectLibrary — arriving from the studio", () => {
  beforeEach(() => vi.clearAllMocks());

  it("opens on the room you came from, with its title already in", () => {
    renderLibrary({ preselectProjectId: "proj-1", preselectTitle: "Sunlit living room" });

    expect(screen.getByLabelText(/Project to freeze/i)).toHaveValue("proj-1");
    expect(screen.getByLabelText(/^Title$/i)).toHaveValue("Sunlit living room");
  });

  it("falls back to the project's own name when the link carries no title", () => {
    renderLibrary({ preselectProjectId: "proj-1" });

    expect(screen.getByLabelText(/^Title$/i)).toHaveValue("Sunlit living room");
  });

  it("says why a room can't go up rather than opening on an empty picker", () => {
    // A room with no marked walls would publish an empty room — the one thing the
    // library must never contain — so the link is refused. Selecting an id that
    // isn't in the list would leave a blank dropdown, which reads as a broken page.
    renderLibrary({
      sources: [source({ eligible: false, regionCount: 0, ineligibleReason: "No walls on this project yet." })],
      preselectProjectId: "proj-1",
    });

    expect(screen.getByText(/can.t go on the shelf yet/i)).toBeInTheDocument();
  });

  it("is the ordinary blank form when nobody came from anywhere", () => {
    renderLibrary();

    expect(screen.getByLabelText(/Project to freeze/i)).toHaveValue("");
    expect(screen.getByLabelText(/^Title$/i)).toHaveValue("");
    expect(screen.queryByText(/can.t go on the shelf yet/i)).not.toBeInTheDocument();
  });
});
