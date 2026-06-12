"use client";

import { useCallback, useEffect, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import {
  createBoard,
  deleteBoard,
  isSaved,
  loadBoards,
  quickBoard,
  renameBoard,
  toggleShade,
  type ShadeBoard,
} from "@/lib/boards";
import type { PaintShade } from "@/lib/types";

/**
 * Shared boards state for one page: every HeartButton and the BoardsPanel
 * read the same list, refreshed after each mutation. localStorage is the
 * source of truth, so a refresh costs one JSON.parse.
 */
export function useBoards() {
  const [boards, setBoards] = useState<ShadeBoard[]>([]);
  useEffect(() => setBoards(loadBoards()), []);
  const refresh = useCallback(() => setBoards(loadBoards()), []);
  return { boards, refresh };
}

/** Heart toggle: one tap saves to (or removes from) the latest board. */
export function HeartButton({
  shade,
  boards,
  refresh,
  onSaved,
}: {
  shade: PaintShade;
  boards: ReadonlyArray<ShadeBoard>;
  refresh: () => void;
  /** Toast hook: called with the board name after a save. */
  onSaved?: (boardName: string) => void;
}) {
  const saved = isSaved(boards, shade.code);
  const onClick = () => {
    if (saved) {
      // Remove from every board that has it — the heart means "saved at all".
      for (const b of boards) {
        if (b.codes.includes(shade.code)) toggleShade(b.id, shade.code);
      }
    } else {
      const b = quickBoard();
      toggleShade(b.id, shade.code);
      onSaved?.(b.name);
    }
    refresh();
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${shade.name} from your boards` : `Save ${shade.name} to a board`}
      title={saved ? "Remove from boards" : "Save to board"}
      className="hv-card-action"
    >
      {saved ? "♥" : "♡"}
    </button>
  );
}

/**
 * The boards themselves: rename, delete, remove shades, and share a board as
 * a single image (WhatsApp-ready) drawn on a canvas — name, swatches, codes.
 */
export function BoardsPanel({
  boards,
  refresh,
  catalogue,
  hideCodes = false,
}: {
  boards: ReadonlyArray<ShadeBoard>;
  refresh: () => void;
  catalogue: ReadonlyArray<PaintShade>;
  hideCodes?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const byCode = new Map(catalogue.map((s) => [s.code, s]));

  const shadesOf = (b: ShadeBoard): PaintShade[] =>
    b.codes.map((c) => byCode.get(c)).filter((s): s is PaintShade => Boolean(s));

  const shareBoard = async (b: ShadeBoard) => {
    const shades = shadesOf(b);
    if (shades.length === 0) return;
    setBusy(b.id);
    try {
      const blob = await renderBoardImage(b.name, shades, hideCodes);
      if (!blob) return;
      const file = new File([blob], `${b.name.replace(/[^\w\d-]+/g, "-").toLowerCase() || "board"}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: b.name });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      // Cancelled share sheets land here too — nothing to clean up.
    } finally {
      setBusy(null);
    }
  };

  if (boards.length === 0) {
    return (
      <p style={{ font: "400 15px/1.5 var(--serif)", color: "var(--fg-mute)", margin: 0 }}>
        Tap the ♡ on any shade to start your first board.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {boards.map((b) => {
        const shades = shadesOf(b);
        return (
          <div key={b.id} style={{ border: "1px solid var(--rule)", borderRadius: 10, padding: 16, background: "var(--surface)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <input
                defaultValue={b.name}
                aria-label="Board name"
                onBlur={(e) => {
                  if (e.target.value.trim() && e.target.value !== b.name) {
                    renameBoard(b.id, e.target.value);
                    refresh();
                  }
                }}
                style={{ flex: 1, minWidth: 140, background: "transparent", border: "none", outline: "none", color: "var(--fg)", font: "600 16px/1.2 var(--sans)", padding: 0 }}
              />
              <Mono>{shades.length} {shades.length === 1 ? "shade" : "shades"}</Mono>
              <button type="button" className="btn btn-ghost btn-sm" disabled={shades.length === 0 || busy === b.id} onClick={() => void shareBoard(b)}>
                {busy === b.id ? "Preparing…" : "Share as image"}
              </button>
              <button
                type="button"
                onClick={() => { deleteBoard(b.id); refresh(); }}
                aria-label={`Delete board ${b.name}`}
                style={{ background: "transparent", border: "none", color: "var(--fg-mute)", cursor: "pointer", font: "400 10px/1 var(--mono)", letterSpacing: ".14em", textTransform: "uppercase", padding: "6px 2px" }}
              >
                Delete
              </button>
            </div>
            {shades.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                {shades.map((s) => (
                  <button
                    key={s.code}
                    type="button"
                    onClick={() => { toggleShade(b.id, s.code); refresh(); }}
                    title={`${s.name} — tap to remove`}
                    aria-label={`Remove ${s.name} from ${b.name}`}
                    style={{ display: "flex", flexDirection: "column", gap: 4, background: "transparent", border: "none", cursor: "pointer", padding: 0, width: 64 }}
                  >
                    <span style={{ display: "block", width: 64, height: 44, background: s.hex, border: "1px solid var(--rule-strong)", borderRadius: 6 }} />
                    <span style={{ font: "400 9px/1.3 var(--mono)", color: "var(--fg-mute)", textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%" }}>
                      {hideCodes ? s.name : s.code}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { createBoard("New board"); refresh(); }}>
          + New board
        </button>
      </div>
    </div>
  );
}

/** Draw the board as a tall PNG: title, one row per shade, HueVista footer. */
async function renderBoardImage(
  name: string,
  shades: ReadonlyArray<PaintShade>,
  hideCodes: boolean,
): Promise<Blob | null> {
  const W = 1080;
  const PAD = 64;
  const HEAD = 200;
  const ROW = 150;
  const FOOT = 110;
  const H = HEAD + shades.length * ROW + FOOT;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#141413";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#f4f4f2";
  ctx.font = "600 56px 'Inter Tight', 'Inter', sans-serif";
  ctx.fillText(name, PAD, 108);
  ctx.fillStyle = "rgba(244,244,242,.5)";
  ctx.font = "400 26px 'IBM Plex Mono', monospace";
  ctx.fillText(`${shades.length} shades`, PAD, 156);

  shades.forEach((s, i) => {
    const y = HEAD + i * ROW;
    ctx.fillStyle = s.hex;
    ctx.fillRect(PAD, y, 220, ROW - 26);
    ctx.strokeStyle = "rgba(244,244,242,.25)";
    ctx.strokeRect(PAD + 0.5, y + 0.5, 219, ROW - 27);
    ctx.fillStyle = "#f4f4f2";
    ctx.font = "600 38px 'Inter', sans-serif";
    ctx.fillText(s.name, PAD + 260, y + 56);
    ctx.fillStyle = "rgba(244,244,242,.55)";
    ctx.font = "400 26px 'IBM Plex Mono', monospace";
    ctx.fillText(hideCodes ? `${s.hex.toUpperCase()} · LRV ${s.lrv}` : `${s.code} · ${s.hex.toUpperCase()} · LRV ${s.lrv}`, PAD + 260, y + 100);
  });

  ctx.fillStyle = "rgba(244,244,242,.4)";
  ctx.font = "400 24px 'IBM Plex Mono', monospace";
  ctx.fillText("Made with HueVista — see any colour on your walls", PAD, H - 48);

  return await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
