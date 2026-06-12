// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  createBoard,
  DEFAULT_BOARD_NAME,
  deleteBoard,
  isSaved,
  loadBoards,
  quickBoard,
  renameBoard,
  toggleShade,
} from "../boards";

beforeEach(() => {
  localStorage.clear();
});

describe("boards storage", () => {
  it("starts empty and creates a named board", () => {
    expect(loadBoards()).toEqual([]);
    const b = createBoard("Bedroom ideas");
    expect(b.name).toBe("Bedroom ideas");
    expect(loadBoards()).toHaveLength(1);
  });

  it("falls back to the default name for blank input", () => {
    expect(createBoard("   ").name).toBe(DEFAULT_BOARD_NAME);
  });

  it("toggles a shade on and off", () => {
    const b = createBoard("Hall");
    const on = toggleShade(b.id, "AP-2118");
    expect(on.added).toBe(true);
    expect(isSaved(on.boards, "AP-2118")).toBe(true);

    const off = toggleShade(b.id, "AP-2118");
    expect(off.added).toBe(false);
    expect(isSaved(off.boards, "AP-2118")).toBe(false);
  });

  it("keeps newest shade first and dedupes", () => {
    const b = createBoard("Hall");
    toggleShade(b.id, "AP-1");
    toggleShade(b.id, "AP-2");
    const { boards } = toggleShade(b.id, "AP-3");
    expect(boards[0]!.codes).toEqual(["AP-3", "AP-2", "AP-1"]);
  });

  it("renames and deletes boards", () => {
    const b = createBoard("Old");
    renameBoard(b.id, "New");
    expect(loadBoards()[0]!.name).toBe("New");
    deleteBoard(b.id);
    expect(loadBoards()).toEqual([]);
  });

  it("quickBoard creates a default board when none exist, else reuses the latest", () => {
    const first = quickBoard();
    expect(first.name).toBe(DEFAULT_BOARD_NAME);
    expect(loadBoards()).toHaveLength(1);
    const again = quickBoard();
    expect(again.id).toBe(first.id);
    expect(loadBoards()).toHaveLength(1);
  });

  it("survives corrupted storage", () => {
    localStorage.setItem("hv-boards", "{not json");
    expect(loadBoards()).toEqual([]);
  });
});
