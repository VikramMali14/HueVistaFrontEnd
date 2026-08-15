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
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FreeProjectTemplate, PublishableProject } from "@/lib/api";
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

function template(overrides: Partial<FreeProjectTemplate> = {}): FreeProjectTemplate {
  return {
    id: "tpl-1",
    slug: "sunlit-hall",
    title: "Sunlit hall",
    space: "INTERIOR",
    roomKey: "LIVING_ROOM",
    roomLabel: "Living room",
    imageUrl: "https://media.example.com/free-projects/sunlit-hall/source.jpg",
    published: true,
    placement: "WORK",
    displayOrder: 0,
    timesUsed: 0,
    regionCount: 2,
    copiesInUse: 0,
    regions: [],
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
      updateAction={vi.fn()}
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

/**
 * Choosing where a room goes.
 *
 * Publishing used to mean one thing — the room appears on /gallery — because
 * /gallery was the only page the library fed. "Our work" was twelve invented
 * rooms in a source file that nothing an admin did could reach. The form now
 * asks which page, and defaults to the portfolio, since that is the page this
 * was built to fill.
 */
describe("FreeProjectLibrary — choosing the page", () => {
  beforeEach(() => vi.clearAllMocks());

  /** The "Show on" pill that is currently chosen. */
  function chosenPlacement(scope: HTMLElement = document.body): string {
    const pressed = within(scope).getAllByRole("button", { pressed: true });
    const pill = pressed.find((b) => ["Our work", "Gallery", "Both pages"].includes(b.textContent ?? ""));
    return pill?.textContent ?? "";
  }

  it("opens on Our work", () => {
    renderLibrary();
    expect(chosenPlacement()).toBe("Our work");
  });

  it("names the destination on the button, so it is never a surprise", async () => {
    const user = userEvent.setup();
    renderLibrary();

    expect(screen.getByRole("button", { name: /Publish to Our work/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Gallery" }));
    expect(screen.getByRole("button", { name: /Publish to Gallery/i })).toBeInTheDocument();
  });

  it("sends the destination and the story with the publish", async () => {
    const user = userEvent.setup();
    const publishAction = vi.fn().mockResolvedValue({ template: template() });
    renderLibrary({ publishAction, preselectProjectId: "proj-1", preselectTitle: "Sunlit hall" });

    await user.type(screen.getByLabelText(/^Location$/i), "Pune");
    await user.type(screen.getByLabelText(/^The story$/i), "They arrived with a phone photo.");
    await user.click(screen.getByRole("button", { name: /Publish to Our work/i }));

    expect(publishAction).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "proj-1",
      placement: "WORK",
      location: "Pune",
      story: "They arrived with a phone photo.",
    }));
  });

  /**
   * The gallery card reads everything it shows off the room itself, so six text
   * fields on a gallery-only publish would be six questions with no answer.
   */
  it("stops asking for a story when the room is only going in the grid", async () => {
    const user = userEvent.setup();
    renderLibrary();

    expect(screen.getByLabelText(/^The story$/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Gallery" }));
    expect(screen.queryByLabelText(/^The story$/i)).not.toBeInTheDocument();
  });
});

/**
 * Moving a room after it is up.
 *
 * Until this existed, where a room showed was decided once and permanently:
 * changing it meant deleting the room — losing its slug, every link to it and
 * its usage count — and publishing again. Rooms published before placements
 * existed are all on the Gallery, so being able to move them is the whole
 * migration path.
 */
describe("FreeProjectLibrary — editing a room on the shelf", () => {
  beforeEach(() => vi.clearAllMocks());

  /** The room's card. Scoped, because the publish form above asks the same questions. */
  const card = () => screen.getByRole("article");

  /** The open edit panel for the fixture room. */
  const panel = () => screen.getByRole("form", { name: /Edit Sunlit hall/i });

  it("shows which page each room is on, since the shelf groups by room type", () => {
    renderLibrary({ initial: [template({ placement: "GALLERY" })] });
    expect(within(card()).getByText("Gallery")).toBeInTheDocument();
  });

  it("says so on the badge when a room is hidden from the page it is filed under", () => {
    renderLibrary({ initial: [template({ placement: "WORK", published: false })] });
    expect(within(card()).getByText(/Our work · hidden/i)).toBeInTheDocument();
  });

  it("treats a room published before placements existed as a gallery room", () => {
    renderLibrary({ initial: [template({ placement: null })] });
    expect(within(card()).getByText("Gallery")).toBeInTheDocument();
  });

  it("opens the edit panel on what is stored, not on blanks", async () => {
    const user = userEvent.setup();
    renderLibrary({ initial: [template({ placement: "GALLERY", location: "Pune", credit: "At the counter" })] });

    await user.click(within(card()).getByRole("button", { name: "Edit" }));
    // A gallery room's story fields stay hidden until it is moved.
    expect(within(panel()).queryByLabelText(/^Location$/i)).not.toBeInTheDocument();

    await user.click(within(panel()).getByRole("button", { name: "Our work" }));
    expect(within(panel()).getByLabelText(/^Location$/i)).toHaveValue("Pune");
    expect(within(panel()).getByLabelText(/^Credit$/i)).toHaveValue("At the counter");
  });

  it("moves a room from the gallery to the portfolio", async () => {
    const user = userEvent.setup();
    const updateAction = vi.fn().mockResolvedValue({ template: template({ placement: "WORK" }) });
    renderLibrary({ initial: [template({ placement: "GALLERY" })], updateAction });

    await user.click(within(card()).getByRole("button", { name: "Edit" }));
    await user.click(within(panel()).getByRole("button", { name: "Our work" }));
    await user.click(within(panel()).getByRole("button", { name: "Save" }));

    expect(updateAction).toHaveBeenCalledWith("tpl-1", expect.objectContaining({
      placement: "WORK",
      title: "Sunlit hall",
    }));
  });

  /**
   * Every managed field is sent, empty ones included — an empty string is how
   * the backend is told to clear one, and it is the only way to delete a credit
   * line that is now wrong.
   */
  it("sends an emptied field rather than dropping it, so it can be cleared", async () => {
    const user = userEvent.setup();
    const updateAction = vi.fn().mockResolvedValue({ template: template() });
    renderLibrary({ initial: [template({ placement: "WORK", credit: "At the counter" })], updateAction });

    await user.click(within(card()).getByRole("button", { name: "Edit" }));
    await user.clear(within(panel()).getByLabelText(/^Credit$/i));
    await user.click(within(panel()).getByRole("button", { name: "Save" }));

    expect(updateAction).toHaveBeenCalledWith("tpl-1", expect.objectContaining({ credit: "" }));
  });

  /** The slug is the room's public URL and its storage folder — not editable. */
  it("does not offer to change the slug", async () => {
    const user = userEvent.setup();
    renderLibrary({ initial: [template()] });

    await user.click(within(card()).getByRole("button", { name: "Edit" }));
    expect(within(panel()).queryByLabelText(/slug/i)).not.toBeInTheDocument();
  });
});
