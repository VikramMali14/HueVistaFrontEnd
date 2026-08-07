"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  centredCrop,
  clampCrop,
  cropAndEncode,
  loadImageFromFile,
  type CropRect,
} from "@/lib/image-upload";

/**
 * Frame a picture to the shape the page will draw it at, then hand back a file
 * small enough to upload.
 *
 * It exists because of two failures that were the same failure. A photograph off
 * a phone is 4–12 MB, and the server refuses anything over 8; and every slot on
 * the site is drawn at a fixed shape, so an upload of the wrong proportions is
 * cropped anyway — by CSS, invisibly, usually through the middle of whatever
 * mattered. So the person uploading was told "too large, use a smaller copy" and
 * left to find image-editing software, and if they got past that, the site then
 * silently re-framed their picture for them.
 *
 * Both are decided here instead. The crop box is locked to the slot's aspect and
 * starts where `object-fit: cover` would have put it, so doing nothing gives
 * exactly the old behaviour; dragging moves it, and the zoom slider trades
 * framing for detail. The result is re-encoded under the size limit on the way
 * out, which means the limit is not something a user can hit.
 *
 * Pointer-based rather than mouse-based: this is used from a phone at a counter
 * as often as from a desktop.
 */
export function ImageCropper({
  file,
  aspect,
  aspectLabel,
  maxBytes,
  maxDim = 2400,
  onCancel,
  onCropped,
}: {
  /** The picked file, uncropped. */
  file: File;
  /** Target shape as width / height — the slot's own aspect. */
  aspect: number;
  /** How to say that shape to a person, e.g. "21:10". */
  aspectLabel: string;
  /** Ceiling for the produced file. */
  maxBytes: number;
  /** Longest side of the produced file. */
  maxDim?: number;
  onCancel: () => void;
  onCropped: (cropped: File) => void;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  /** 1 = the largest box that fits; above that the box shrinks and detail grows. */
  const [zoom, setZoom] = useState(1);

  const frameRef = useRef<HTMLDivElement>(null);
  // Mirrors `crop` for the pointer handlers, so a drag reads the latest box
  // without re-subscribing a listener on every move.
  const cropRef = useRef<CropRect | null>(null);
  cropRef.current = crop;

  useEffect(() => {
    let cancelled = false;
    setError(null);
    loadImageFromFile(file)
      .then((loaded) => {
        if (cancelled) return;
        setImg(loaded);
        setCrop(centredCrop(loaded.naturalWidth, loaded.naturalHeight, aspect));
        setZoom(1);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not read that image.");
      });
    return () => {
      cancelled = true;
    };
  }, [file, aspect]);

  // Zoom keeps the box centred on what it was showing: a slider that pulled the
  // frame back towards the middle of the photo every time it moved would undo the
  // drag the user just made.
  const applyZoom = useCallback(
    (next: number) => {
      if (!img) return;
      setZoom(next);
      setCrop((prev) => {
        if (!prev) return prev;
        const base = centredCrop(img.naturalWidth, img.naturalHeight, aspect);
        const width = Math.max(16, Math.round(base.width / next));
        const height = Math.max(16, Math.round(base.height / next));
        const cx = prev.x + prev.width / 2;
        const cy = prev.y + prev.height / 2;
        return clampCrop(
          { x: Math.round(cx - width / 2), y: Math.round(cy - height / 2), width, height },
          img.naturalWidth,
          img.naturalHeight,
        );
      });
    },
    [img, aspect],
  );

  const startDrag = (down: React.PointerEvent<HTMLDivElement>) => {
    if (!img || !crop || !frameRef.current) return;
    if (down.pointerType === "mouse" && down.button !== 0) return;
    down.preventDefault();
    const frame = frameRef.current.getBoundingClientRect();
    // The preview draws the whole photo inside `frame`, so one preview pixel is
    // this many source pixels — the factor that turns a drag into a crop move.
    const perPx = img.naturalWidth / frame.width;
    const startX = down.clientX;
    const startY = down.clientY;
    const origin = { ...crop };
    const pointerId = down.pointerId;

    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      const next = clampCrop(
        {
          ...origin,
          x: Math.round(origin.x + (e.clientX - startX) * perPx),
          y: Math.round(origin.y + (e.clientY - startY) * perPx),
        },
        img.naturalWidth,
        img.naturalHeight,
      );
      setCrop(next);
    };
    const stop = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };

  /** Nudge the frame from the keyboard — a drag is not the only way in. */
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!img || !crop) return;
    const step = e.shiftKey ? 40 : 8;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    setCrop(clampCrop({ ...crop, x: crop.x + move[0], y: crop.y + move[1] }, img.naturalWidth, img.naturalHeight));
  };

  const confirm = () => {
    if (!img || !crop) return;
    setWorking(true);
    setError(null);
    void (async () => {
      try {
        onCropped(await cropAndEncode(img, crop, { maxDim, maxBytes, filename: file.name }));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not prepare that image.");
      } finally {
        setWorking(false);
      }
    })();
  };

  if (error && !img) {
    return (
      <div className="ic">
        <p className="field-error" role="alert">{error}</p>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
          Pick another
        </button>
        <CropperStyles />
      </div>
    );
  }

  if (!img || !crop) {
    return (
      <div className="ic">
        <p className="ic-hint" role="status">Opening the photo…</p>
        <CropperStyles />
      </div>
    );
  }

  // The mask is drawn as four dimmed strips around the crop, in percentages of
  // the preview — so it needs no canvas and stays exact as the frame resizes.
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;

  return (
    <div className="ic">
      <div className="ic-head">
        <span className="ic-title">Frame the picture</span>
        <span className="ic-hint">
          Drag to move · the box is locked to {aspectLabel}, the shape this slot is drawn at
        </span>
      </div>

      <div
        ref={frameRef}
        className="ic-frame"
        style={{ aspectRatio: `${img.naturalWidth} / ${img.naturalHeight}` }}
        onPointerDown={startDrag}
        onKeyDown={onKeyDown}
        role="application"
        tabIndex={0}
        aria-label="Crop area — drag, or use the arrow keys to move the frame"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img.src} alt="" draggable={false} />
        <div className="ic-shade" style={{ inset: `0 0 ${pct(img.naturalHeight - crop.y, img.naturalHeight)} 0` }} />
        <div className="ic-shade" style={{ inset: `${pct(crop.y + crop.height, img.naturalHeight)} 0 0 0` }} />
        <div
          className="ic-shade"
          style={{
            top: pct(crop.y, img.naturalHeight),
            height: pct(crop.height, img.naturalHeight),
            left: 0,
            width: pct(crop.x, img.naturalWidth),
          }}
        />
        <div
          className="ic-shade"
          style={{
            top: pct(crop.y, img.naturalHeight),
            height: pct(crop.height, img.naturalHeight),
            left: pct(crop.x + crop.width, img.naturalWidth),
            right: 0,
          }}
        />
        <div
          className="ic-box"
          style={{
            top: pct(crop.y, img.naturalHeight),
            left: pct(crop.x, img.naturalWidth),
            width: pct(crop.width, img.naturalWidth),
            height: pct(crop.height, img.naturalHeight),
          }}
        />
      </div>

      <label className="ic-zoom">
        <span>Zoom</span>
        <input
          type="range"
          min={1}
          max={4}
          step={0.05}
          value={zoom}
          onChange={(e) => applyZoom(Number(e.target.value))}
          aria-label="Zoom into the picture"
        />
      </label>

      {error && <p className="field-error" role="alert">{error}</p>}

      <div className="ic-actions">
        <button type="button" className="btn btn-sm" onClick={confirm} disabled={working}>
          {working ? "Preparing…" : "Use this crop"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={working}>
          Cancel
        </button>
        {/* Said plainly, because the size limit is the thing people were hitting.
            It is now arithmetic that happens on their behalf, not a rule. */}
        <span className="ic-note">
          Saved at up to {maxDim}px and squeezed under {Math.round(maxBytes / (1024 * 1024))} MB —
          whatever the original weighs.
        </span>
      </div>

      <CropperStyles />
    </div>
  );
}

function CropperStyles() {
  return (
    <style>{`
      .ic { display: flex; flex-direction: column; gap: 12px; }
      .ic-head { display: flex; flex-direction: column; gap: 4px; }
      .ic-title { font: 600 14px/1.2 var(--sans); color: var(--fg); }
      .ic-hint { font: 400 13px/1.5 var(--sans); color: var(--fg-mute); }
      .ic-frame {
        position: relative; overflow: hidden; border-radius: 8px;
        border: 1px solid var(--rule-strong); background: var(--surface-soft);
        cursor: grab; touch-action: none; user-select: none; max-height: 420px;
      }
      .ic-frame:active { cursor: grabbing; }
      .ic-frame:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
      .ic-frame img { display: block; width: 100%; height: 100%; object-fit: contain; pointer-events: none; }
      .ic-shade { position: absolute; background: rgba(10, 9, 15, .58); pointer-events: none; }
      .ic-box {
        position: absolute; pointer-events: none;
        border: 1px solid rgba(255,255,255,.9);
        box-shadow: 0 0 0 1px rgba(0,0,0,.35);
      }
      .ic-zoom { display: flex; align-items: center; gap: 12px; }
      .ic-zoom > span { font: 400 12px/1 var(--mono); letter-spacing: .18em; text-transform: uppercase; color: var(--fg-mute); }
      .ic-zoom input { flex: 1; accent-color: var(--accent); }
      .ic-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .ic-note { font: 400 12.5px/1.5 var(--sans); color: var(--fg-mute); }
    `}</style>
  );
}
