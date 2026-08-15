"use client";

import { useEffect } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";

interface BoardDownloadConfirmProps {
  /** Coloured options on the board about to be built. */
  pages: number;
  /** Boards this project has left INCLUDING this one, or null when unknown/guest. */
  boardsLeft: number | null;
  /** True when pressing Download finishes the project. */
  closesProject: boolean;
  /** True when the project's latest AI image will close the board. */
  withAiImage: boolean;
  /** Downloads left on the paying plan this month, or null when unlimited/unknown. */
  monthlyLeft: number | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * The "how many PDFs do I get?" moment, asked before the download rather than after it.
 *
 * A project hands over ONE colour board and is then finished. That is a good rule at a
 * counter — the customer leaves with one sheet, not a folder of near-identical ones —
 * but it makes the Download button irreversible in a way its label does not admit, and
 * the tray's line of prose underneath ("1 colour board on this project") is exactly the
 * kind of thing nobody reads while a customer is waiting.
 *
 * So the count is put in the way of the click. Everything on this panel is a number the
 * customer would otherwise only learn afterwards: how many options are on the sheet,
 * whether their AI image is on it, whether this is the last board, and — separately —
 * what the shop's monthly allowance has left. The two are genuinely different limits
 * and are shown as two lines, because a shop whose month has run out needs to know that
 * the project still has its board waiting, and vice versa.
 */
export function BoardDownloadConfirm({
  pages,
  boardsLeft,
  closesProject,
  withAiImage,
  monthlyLeft,
  onCancel,
  onConfirm,
}: BoardDownloadConfirmProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const sheets = pages + (withAiImage ? 1 : 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Download your colour board"
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 120,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg)",
          border: "1px solid var(--rule-strong)",
          padding: 28,
          maxWidth: 460,
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <Mono brass>Your colour board</Mono>

        <p style={{ font: "400 17px/1.45 var(--serif)", color: "var(--fg)", margin: 0 }}>
          {sheets} page{sheets === 1 ? "" : "s"} — {pages} colour option
          {pages === 1 ? "" : "s"}
          {withAiImage ? ", plus your AI image on the last page." : "."}
        </p>

        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            font: "400 14px/1.5 var(--sans)",
            color: "var(--fg-soft)",
            borderTop: "1px solid var(--rule)",
            borderBottom: "1px solid var(--rule)",
            paddingBlock: 14,
          }}
        >
          {boardsLeft !== null && (
            <li>
              <strong style={{ fontWeight: 500, color: "var(--fg)" }}>
                {boardsLeft === 1
                  ? "This is the only PDF for this project."
                  : `${boardsLeft} PDFs left on this project.`}
              </strong>{" "}
              {closesProject
                ? "Downloading it finishes the job, and the catalogue closes with it."
                : "You can build another one after this."}
            </li>
          )}
          {monthlyLeft !== null && (
            <li>
              {monthlyLeft === 1
                ? "One colour-board download left on your plan this month."
                : `${monthlyLeft} colour-board downloads left on your plan this month.`}
            </li>
          )}
        </ul>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Keep choosing
          </Button>
          {/* Autofocused: the customer opened this by pressing Download, so Download
              is what Enter should still do. */}
          <Button variant="brass" size="sm" onClick={onConfirm} autoFocus>
            Download the PDF
          </Button>
        </div>
      </div>
    </div>
  );
}
