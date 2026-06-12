/**
 * Favourites boards — named collections of shade codes ("Bedroom ideas"),
 * kept in localStorage so guests and signed-in users alike can collect
 * shades without any backend round trip. All functions are safe to call
 * when storage is unavailable (private mode): reads return empty, writes
 * are silently dropped.
 */

export interface ShadeBoard {
  id: string;
  name: string;
  /** Shade codes, newest first. */
  codes: string[];
  updatedAt: number;
}

const KEY = "hv-boards";
export const DEFAULT_BOARD_NAME = "My shades";
const MAX_BOARDS = 20;
const MAX_CODES = 60;

function read(): ShadeBoard[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (b): b is ShadeBoard =>
        typeof b === "object" && b !== null &&
        typeof (b as ShadeBoard).id === "string" &&
        typeof (b as ShadeBoard).name === "string" &&
        Array.isArray((b as ShadeBoard).codes),
    );
  } catch {
    return [];
  }
}

function write(boards: ShadeBoard[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(boards.slice(0, MAX_BOARDS)));
  } catch {
    // Storage full or unavailable — the in-memory state the caller holds
    // still works for this visit.
  }
}

function makeId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `b-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  }
}

export function loadBoards(): ShadeBoard[] {
  return read();
}

export function createBoard(name: string): ShadeBoard {
  const boards = read();
  const board: ShadeBoard = {
    id: makeId(),
    name: name.trim() || DEFAULT_BOARD_NAME,
    codes: [],
    updatedAt: Date.now(),
  };
  write([board, ...boards]);
  return board;
}

export function renameBoard(id: string, name: string): ShadeBoard[] {
  const boards = read().map((b) =>
    b.id === id ? { ...b, name: name.trim() || b.name, updatedAt: Date.now() } : b,
  );
  write(boards);
  return boards;
}

export function deleteBoard(id: string): ShadeBoard[] {
  const boards = read().filter((b) => b.id !== id);
  write(boards);
  return boards;
}

/**
 * Add or remove a shade on a board. Returns the new boards list plus whether
 * the shade ended up ON the board (true) or off it (false).
 */
export function toggleShade(boardId: string, code: string): { boards: ShadeBoard[]; added: boolean } {
  let added = false;
  const boards = read().map((b) => {
    if (b.id !== boardId) return b;
    if (b.codes.includes(code)) {
      return { ...b, codes: b.codes.filter((c) => c !== code), updatedAt: Date.now() };
    }
    added = true;
    return { ...b, codes: [code, ...b.codes].slice(0, MAX_CODES), updatedAt: Date.now() };
  });
  write(boards);
  return { boards, added };
}

/** True if any board holds this shade code (drives the filled-heart state). */
export function isSaved(boards: ReadonlyArray<ShadeBoard>, code: string): boolean {
  return boards.some((b) => b.codes.includes(code));
}

/**
 * The board a quick heart-tap should use: the most recently touched board,
 * or a fresh default board when none exist yet.
 */
export function quickBoard(): ShadeBoard {
  const boards = read();
  if (boards.length === 0) return createBoard(DEFAULT_BOARD_NAME);
  return [...boards].sort((a, b) => b.updatedAt - a.updatedAt)[0]!;
}
