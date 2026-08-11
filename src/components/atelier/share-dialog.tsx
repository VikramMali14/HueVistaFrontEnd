"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * One colour on the shared room, already reduced to what the shop allows a
 * customer to read: its paint name only where the shop shows names, and its
 * code only in the shop's own numbering where the shop runs one. The studio
 * applies those rules before handing them over — this component never sees a
 * manufacturer's raw code it would have to remember to hide.
 */
export interface ShareShade {
  label: string;
  name: string;
  code?: string;
  hex: string;
}

interface ShareDialogProps {
  /** The public link, or null while it is still being created. */
  url: string | null;
  creating: boolean;
  error: string | null;
  projectName: string;
  shades: ShareShade[];
  /** Snapshot the painted room as a JPEG data URL, or null if it cannot be captured. */
  captureImage: () => string | null;
  onRetry: () => void;
  onClose: () => void;
}

/**
 * The share sheet.
 *
 * Sharing used to be a single button that copied a link to the clipboard and
 * reported itself in a status pill the width of two words. When the clipboard
 * write failed — and it fails often: any non-secure origin, Safari outside a
 * direct user gesture, a locked-down shop tablet — the link existed and the
 * person who asked for it had no way to reach it. It was in a `title`
 * attribute, which on a touch screen is nowhere.
 *
 * So the link is always shown, in a field that can be selected and copied by
 * hand, and every automatic path (clipboard, the OS share sheet, WhatsApp) is
 * an offer layered on top of that rather than the only way through. The dialog
 * opens on the click, before the link exists, because a person who pressed
 * Share should see something happen even when the network is slow.
 */
export function ShareDialog({
  url,
  creating,
  error,
  projectName,
  shades,
  captureImage,
  onRetry,
  onClose,
}: ShareDialogProps) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [imageNote, setImageNote] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Escape closes, and focus starts inside the dialog rather than wherever the
  // Share button left it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Offer the link the moment it lands: select it, so ⌘C / Ctrl-C works even
  // where the clipboard API is refused outright.
  useEffect(() => {
    if (url) inputRef.current?.select();
  }, [url]);

  const copy = useCallback(async () => {
    if (!url) return;
    inputRef.current?.select();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setCopyFailed(false);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard refused. The text is selected, so say what to press rather
      // than failing silently — this is the case the old status pill lost.
      setCopyFailed(true);
    }
  }, [url]);

  const shareNatively = useCallback(async () => {
    if (!url || typeof navigator.share !== "function") return;
    try {
      await navigator.share({ title: projectName, text: `${projectName} — colour preview`, url });
    } catch {
      /* the sheet was dismissed; nothing to report */
    }
  }, [url, projectName]);

  const downloadImage = useCallback(() => {
    const jpeg = captureImage();
    if (!jpeg) {
      setImageNote("Could not capture the room — apply a colour first, then try again.");
      return;
    }
    const a = document.createElement("a");
    a.href = jpeg;
    a.download = `${slugify(projectName) || "huevista-room"}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setImageNote(null);
  }, [captureImage, projectName]);

  const canShareNatively = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const whatsapp = url
    ? `https://wa.me/?text=${encodeURIComponent(`${projectName} — see the colours: ${url}`)}`
    : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Share this room"
      onClick={onClose}
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
          maxHeight: "86vh",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <Mono brass>Share this room</Mono>

        <p style={{ font: "400 16px/1.45 var(--serif)", color: "var(--fg-soft)", margin: 0 }}>
          Anyone with this link can see the room and try their own colours on it. It stops working
          in 10 days.
        </p>

        {error ? (
          <>
            <p role="alert" style={{ font: "400 15px/1.45 var(--serif)", color: "var(--terracotta)", margin: 0 }}>
              {error}
            </p>
            <Button variant="ghost" size="sm" onClick={onRetry}>Try again</Button>
          </>
        ) : creating || !url ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10, color: "var(--fg-mute)" }}>
            <Spinner />
            <Mono>Creating the link…</Mono>
          </span>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                ref={inputRef}
                readOnly
                value={url}
                aria-label="Share link"
                onFocus={(e) => e.currentTarget.select()}
                style={{
                  flex: 1,
                  minWidth: 0,
                  font: "400 13px/1.4 var(--mono)",
                  color: "var(--fg)",
                  background: "rgba(var(--fg-rgb), .04)",
                  border: "1px solid var(--rule)",
                  padding: "10px 12px",
                }}
              />
              <Button variant="brass" size="sm" onClick={() => void copy()}>
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>

            {copyFailed && (
              <Mono>The link is selected — press ⌘C or Ctrl-C to copy it.</Mono>
            )}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {canShareNatively && (
                <Button variant="ghost" size="sm" onClick={() => void shareNatively()}>Share…</Button>
              )}
              {whatsapp && (
                <a className="btn btn-ghost btn-sm" href={whatsapp} target="_blank" rel="noopener noreferrer">
                  WhatsApp
                </a>
              )}
              <Button variant="ghost" size="sm" onClick={downloadImage}>Download image</Button>
            </div>

            {imageNote && <Mono>{imageNote}</Mono>}
          </>
        )}

        {shades.length > 0 && (
          <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 14 }}>
            <Mono style={{ display: "block", marginBottom: 10 }}>On this room</Mono>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
              {shades.map((s, i) => (
                <li key={`${s.label}-${i}`} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    aria-hidden
                    style={{
                      width: 18,
                      height: 18,
                      background: s.hex,
                      border: "1px solid var(--rule-strong)",
                      flex: "0 0 auto",
                    }}
                  />
                  <span style={{ font: "400 15px/1.3 var(--serif)", color: "var(--fg)" }}>
                    {[s.label, s.name || null, s.code || null].filter(Boolean).join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          style={{
            marginTop: 2,
            alignSelf: "flex-start",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "var(--fg-mute)",
            font: "400 12px/1 var(--mono)",
            letterSpacing: ".22em",
            textTransform: "uppercase",
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
