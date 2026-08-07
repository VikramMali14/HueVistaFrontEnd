"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { CompareSlider } from "@/components/home/compare-slider";
import { ImageCropper } from "@/components/ui/image-cropper";
import { IMAGE_ACCEPT, imageFileError } from "@/lib/image-upload";
import { clearSiteAssetAction, putSiteAssetAction } from "@/lib/auth";
import {
  ASPECT_WARN_AT,
  SITE_ASSET_GROUPS,
  SITE_ASSET_SLOTS,
  aspectDrift,
  type SiteAsset,
  type SiteAssetMap,
  SITE_ASSET_MAX_BYTES,
  SITE_ASSET_MAX_DIM,
  type SiteAssetSlot,
} from "@/lib/site-assets";

/**
 * Putting pictures on the marketing site.
 *
 * The thing that makes this worth building rather than just wiring a file input
 * to an endpoint is the preview. An image for the home page's before/after
 * slider is not judged on its own — it is judged against the other half of the
 * pair, at the size and crop the hero actually draws, with the handle dragged
 * across it. So the preview here is the real {@link CompareSlider}, fed the
 * pending files straight off the disk via object URLs. What you drag is what
 * visitors will drag.
 *
 * Nothing is uploaded until Save. Picking a file only changes the preview, so an
 * admin can try three photographs against each other and walk away having
 * changed nothing.
 */
export function SiteAssetManager({ initial }: { initial: SiteAssetMap }) {
  const [assets, setAssets] = useState<SiteAssetMap>(initial);
  // Files chosen but not yet saved, as object URLs for the preview.
  const [pending, setPending] = useState<Record<string, { file: File; url: string }>>({});
  // The file a slot has just been given, before it has been framed. Held apart
  // from `pending` because it is not yet a candidate for anything: it has not been
  // cropped to the slot's shape or squeezed under the size limit.
  const [cropping, setCropping] = useState<Record<string, File>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  // Object URLs are a manual allocation; without this every re-pick leaks the
  // previous file's blob for the lifetime of the page.
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  useEffect(() => () => {
    Object.values(pendingRef.current).forEach((p) => URL.revokeObjectURL(p.url));
  }, []);

  const groups = useMemo(() => {
    const byGroup = new Map<string, SiteAssetSlot[]>();
    for (const slot of SITE_ASSET_SLOTS) {
      const list = byGroup.get(slot.group) ?? [];
      list.push(slot);
      byGroup.set(slot.group, list);
    }
    return [...byGroup.entries()];
  }, []);

  /** What a slot should show right now: the pending pick, else what is saved. */
  const shownUrl = (slotId: string): string | null =>
    pending[slotId]?.url ?? assets[slotId]?.url ?? null;

  /** Drop whatever a slot is holding — the pending pick and any crop in progress. */
  const clearPending = (slotId: string) => {
    setPending((prev) => {
      if (!prev[slotId]) return prev;
      URL.revokeObjectURL(prev[slotId].url);
      const next = { ...prev };
      delete next[slotId];
      return next;
    });
    setCropping((prev) => {
      if (!prev[slotId]) return prev;
      const next = { ...prev };
      delete next[slotId];
      return next;
    });
  };

  /**
   * A file has been picked. It is NOT a candidate yet — it goes to the cropper
   * first, which frames it to the slot's shape and re-encodes it under the size
   * limit. Only what comes back from there can be saved, which is what makes
   * "too large" and "wrong shape" impossible to reach rather than merely reported.
   *
   * The type check still runs here: a cropper cannot open a file the browser
   * cannot decode, so that has to be caught before it is handed over.
   */
  const choose = (slotId: string, file: File | null) => {
    setError(null);
    setNotice(null);
    if (!file) {
      clearPending(slotId);
      return;
    }
    const bad = imageFileError(file);
    if (bad) {
      setError(bad);
      return;
    }
    clearPending(slotId);
    setCropping((prev) => ({ ...prev, [slotId]: file }));
  };

  /** The cropper's output: framed, downscaled and under the limit. */
  const cropped = (slotId: string, file: File) => {
    setCropping((prev) => {
      const next = { ...prev };
      delete next[slotId];
      return next;
    });
    setPending((prev) => {
      if (prev[slotId]) URL.revokeObjectURL(prev[slotId].url);
      return { ...prev, [slotId]: { file, url: URL.createObjectURL(file) } };
    });
  };

  const save = (slotId: string) => {
    const chosen = pending[slotId];
    if (!chosen) return;
    setError(null);
    setNotice(null);
    setBusySlot(slotId);
    startSaving(async () => {
      const form = new FormData();
      form.append("file", chosen.file);
      const res = await putSiteAssetAction(slotId, form);
      setBusySlot(null);
      if (res.error || !res.asset) {
        setError(res.error ?? "Could not upload that image.");
        return;
      }
      // Saved: adopt the server's URL and drop the local preview, so what is on
      // screen from here on is what the public site is serving.
      setAssets((prev) => ({ ...prev, [slotId]: res.asset as SiteAsset }));
      setPending((prev) => {
        if (prev[slotId]) URL.revokeObjectURL(prev[slotId].url);
        const next = { ...prev };
        delete next[slotId];
        return next;
      });
      setNotice("Saved — the live page is showing it now.");
    });
  };

  const clear = (slotId: string) => {
    setError(null);
    setNotice(null);
    setBusySlot(slotId);
    startSaving(async () => {
      const res = await clearSiteAssetAction(slotId);
      setBusySlot(null);
      if (res.error) {
        setError(res.error);
        return;
      }
      setAssets((prev) => {
        const next = { ...prev };
        delete next[slotId];
        return next;
      });
      setNotice("Slot emptied — the page is back to its built-in artwork.");
    });
  };

  return (
    <div className="sa">
      {error && <p className="field-error" role="alert" style={{ marginBottom: 14 }}>{error}</p>}
      {notice && <p className="sa-notice" role="status">{notice}</p>}

      {groups.map(([groupId, slots]) => {
        const group = SITE_ASSET_GROUPS[groupId];
        return (
          <section key={groupId} className="sa-group">
            <h3 className="sa-group-title">{group?.title ?? groupId}</h3>
            {group?.blurb && <p className="sa-group-blurb">{group.blurb}</p>}

            {/* The real component, fed whatever is currently chosen. This is the
                whole point of the page: judged in place, at the real crop. */}
            {groupId === "home-compare" && (
              <div className="sa-preview">
                <div className="sa-preview-head">
                  <span className="sa-preview-label">Live preview</span>
                  <span className="sa-preview-hint">Drag the handle, exactly as a visitor would</span>
                </div>
                <CompareSlider
                  // No `reveal`: that class waits for the marketing pages'
                  // scroll observer, which this page does not mount, and the
                  // preview would sit at opacity 0 forever.
                  className="compare"
                  style={{ marginTop: 0 }}
                  beforeBg={bgFor(shownUrl("home.compare.before"))}
                  afterBg={bgFor(shownUrl("home.compare.after"))}
                />
                {(!shownUrl("home.compare.before") || !shownUrl("home.compare.after")) && (
                  <p className="sa-preview-note">
                    {!shownUrl("home.compare.before") && !shownUrl("home.compare.after")
                      ? "Both panes are showing the built-in colour washes. Upload a pair to replace them."
                      : "One pane is still the built-in wash. A slider with only one photograph in it proves nothing — upload the other half too."}
                  </p>
                )}
              </div>
            )}

            <div className="sa-slots">
              {slots.map((slot) => (
                <SlotCard
                  key={slot.id}
                  slot={slot}
                  asset={assets[slot.id] ?? null}
                  pendingFile={pending[slot.id]?.file ?? null}
                  pendingUrl={pending[slot.id]?.url ?? null}
                  croppingFile={cropping[slot.id] ?? null}
                  busy={saving && busySlot === slot.id}
                  disabled={saving}
                  onChoose={(f) => choose(slot.id, f)}
                  onCropped={(f) => cropped(slot.id, f)}
                  onSave={() => save(slot.id)}
                  onClear={() => clear(slot.id)}
                />
              ))}
            </div>
          </section>
        );
      })}

      <style>{`
        .sa-notice { font: 400 14px/1.5 var(--sans); color: var(--sage-text); margin: 0 0 16px; }
        .sa-group { margin-bottom: 56px; }
        .sa-group-title { font: 600 22px/1.15 var(--serif); letter-spacing: -.01em; color: var(--fg); margin: 0 0 8px; }
        .sa-group-blurb { font: 400 15px/1.6 var(--sans); color: var(--fg-soft); max-width: 68ch; margin: 0 0 22px; }
        .sa-preview { border: 1px solid var(--rule-strong); border-radius: 10px; padding: 16px; background: var(--surface-soft); margin-bottom: 22px; }
        .sa-preview-head { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 12px; }
        .sa-preview-label { font: 600 12px/1 var(--sans); letter-spacing: .08em; text-transform: uppercase; color: var(--fg-mute); }
        .sa-preview-hint { font: 400 13px/1.4 var(--sans); color: var(--fg-mute); }
        .sa-preview-note { font: 400 13.5px/1.5 var(--sans); color: var(--fg-mute); margin: 12px 0 0; }
        .sa-slots { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 18px; }
        .sa-card { border: 1px solid var(--rule-strong); border-radius: 10px; padding: 18px; background: var(--surface); display: flex; flex-direction: column; gap: 12px; }
        .sa-card-title { font: 600 16px/1.25 var(--sans); color: var(--fg); }
        .sa-card-where { font: 400 13px/1.45 var(--sans); color: var(--fg-mute); }
        .sa-card-guidance { font: 400 13.5px/1.5 var(--sans); color: var(--fg-soft); }
        .sa-thumb { position: relative; aspect-ratio: 21 / 10; border-radius: 8px; overflow: hidden; background: var(--surface-soft); border: 1px solid var(--rule); display: flex; align-items: center; justify-content: center; }
        .sa-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .sa-thumb-empty { font: 400 13px/1.5 var(--sans); color: var(--fg-mute); text-align: center; padding: 0 16px; }
        .sa-badge { position: absolute; top: 8px; left: 8px; font: 600 11px/1 var(--sans); letter-spacing: .06em; text-transform: uppercase; padding: 5px 8px; border-radius: var(--radius-pill); background: var(--accent-warm-fill); color: #fff; }
        .sa-meta { font: 400 12.5px/1.5 var(--sans); color: var(--fg-mute); overflow-wrap: anywhere; }
        .sa-warn { font: 400 13px/1.5 var(--sans); color: var(--accent-warm); }
        .sa-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: auto; }
        .sa-file { font: 400 13px/1.4 var(--sans); color: var(--fg-soft); }
        .sa-file::file-selector-button { font: 600 12px/1 var(--sans); padding: 9px 14px; margin-right: 12px; border-radius: var(--radius-pill); border: 1px solid var(--rule-strong); background: transparent; color: var(--fg); cursor: pointer; }
        .sa-file::file-selector-button:hover { border-color: var(--fg-mute); }
      `}</style>
    </div>
  );
}

/**
 * The CSS background for a pane, or undefined to let the slider keep its own
 * default. `cover` and a centred origin match how the hero crops, so the preview
 * is not a kinder framing than the real thing.
 */
function bgFor(url: string | null): string | undefined {
  return url ? `url("${url}") center / cover no-repeat` : undefined;
}

function SlotCard({
  slot,
  asset,
  pendingFile,
  pendingUrl,
  croppingFile,
  busy,
  disabled,
  onChoose,
  onCropped,
  onSave,
  onClear,
}: {
  slot: SiteAssetSlot;
  asset: SiteAsset | null;
  pendingFile: File | null;
  /** Object URL owned by the parent — the card must not create or revoke one of
   *  its own, or picking a file would allocate the same blob twice. */
  pendingUrl: string | null;
  /** Picked but not yet framed: the cropper takes over the card while this is set. */
  croppingFile: File | null;
  busy: boolean;
  disabled: boolean;
  onChoose: (file: File | null) => void;
  onCropped: (file: File) => void;
  onSave: () => void;
  onClear: () => void;
}) {
  const inputId = `sa-${slot.id}`;
  const drift = asset ? aspectDrift(asset, slot) : null;
  const thumb = pendingUrl ?? asset?.url ?? null;

  // Framing takes the whole card. It is one decision about one picture, and
  // leaving the file input and Save button live beside it would offer two ways
  // out of a step that has to finish first.
  if (croppingFile) {
    return (
      <div className="sa-card">
        <div>
          <div className="sa-card-title">{slot.label}</div>
          <div className="sa-card-where">{slot.where}</div>
        </div>
        <ImageCropper
          file={croppingFile}
          aspect={slot.aspect}
          aspectLabel={slot.aspectLabel}
          maxBytes={SITE_ASSET_MAX_BYTES}
          maxDim={SITE_ASSET_MAX_DIM}
          onCancel={() => onChoose(null)}
          onCropped={onCropped}
        />
      </div>
    );
  }

  return (
    <div className="sa-card">
      <div>
        <div className="sa-card-title">{slot.label}</div>
        <div className="sa-card-where">{slot.where}</div>
      </div>

      <div className="sa-thumb">
        {thumb ? (
          /* A blob: URL straight off the file picker, or a cross-origin API path.
             next/image can optimise neither, and this is an admin-only preview
             that has to show the exact bytes about to be published. */
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" />
        ) : (
          <span className="sa-thumb-empty">
            Nothing uploaded — the page draws its built-in artwork here.
          </span>
        )}
        {pendingFile && <span className="sa-badge">Not saved yet</span>}
      </div>

      <p className="sa-card-guidance">{slot.guidance}</p>

      {asset && !pendingFile && (
        <p className="sa-meta">
          {asset.originalFilename ?? "Uploaded image"}
          {asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : ""}
          {` · ${Math.round(asset.fileSize / 1024).toLocaleString("en-IN")} KB`}
        </p>
      )}
      {/* Only ever seen on something uploaded before the cropper existed —
          anything framed here leaves at exactly the slot's shape. */}
      {drift != null && drift > ASPECT_WARN_AT && !pendingFile && (
        <p className="sa-warn">
          This picture is a long way off {slot.aspectLabel}, so the page is cropping a lot of
          it away. Upload it again to frame the crop yourself.
        </p>
      )}

      <label htmlFor={inputId} className="sr-only">{`Choose an image for ${slot.label}`}</label>
      <input
        id={inputId}
        className="sa-file"
        type="file"
        accept={IMAGE_ACCEPT}
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          // Clear the input straight away. It now leads to the CROPPER rather
          // than to a saved pick, and cancelling out of that leaves the input
          // still holding the file — so re-picking the same photograph fires no
          // change event and the card sits there doing nothing.
          e.target.value = "";
          onChoose(file);
        }}
      />

      <div className="sa-actions">
        <button
          type="button"
          className="btn btn-sm"
          onClick={onSave}
          disabled={!pendingFile || disabled}
        >
          {busy ? "Saving…" : "Save to the live site"}
        </button>
        {pendingFile && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChoose(null)} disabled={disabled}>
            Discard
          </button>
        )}
        {asset && !pendingFile && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClear} disabled={disabled}>
            {busy ? "Removing…" : "Remove"}
          </button>
        )}
      </div>
    </div>
  );
}
