"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolveMediaUrl } from "@/lib/media";
import { ROOM_SHELVES, SPACE_LABEL, TARGET_PER_SHELF, firstShelfFor, roomLabelFor } from "@/lib/free-project-rooms";
import { Button } from "@/components/ui/button";
import { Mono } from "@/components/ui/eyebrow";
import type {
  FreeProjectTemplate,
  PublishFreeProjectBody,
  PublishableProject,
  StartedFreeProject,
  TemplateDeletionResult,
  TemplateSpace,
} from "@/lib/api";

interface FreeProjectLibraryProps {
  /** Null = the shelf could not be loaded — shown as an error, never as "empty". */
  initial: FreeProjectTemplate[] | null;
  /** Null = the admin's own projects could not be loaded. */
  sources: PublishableProject[] | null;
  publishAction: (input: PublishFreeProjectBody) => Promise<{ template?: FreeProjectTemplate; error?: string }>;
  startAction: (templateId: string) => Promise<{ started?: StartedFreeProject; error?: string }>;
  setPublishedAction: (templateId: string, published: boolean) => Promise<{ template?: FreeProjectTemplate; error?: string }>;
  refreshAction: (templateId: string) => Promise<{ template?: FreeProjectTemplate; error?: string }>;
  deleteAction: (
    templateIds: string[],
    purgeFiles: boolean,
  ) => Promise<{ result?: TemplateDeletionResult; error?: string }>;
}

const SPACES: readonly TemplateSpace[] = ["INTERIOR", "EXTERIOR"];

const CARD: React.CSSProperties = {
  border: "1px solid var(--rule)",
  borderRadius: 8,
  overflow: "hidden",
  background: "var(--surface-soft)",
  display: "flex",
  flexDirection: "column",
};

const FIELD: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid var(--rule-strong)",
  borderRadius: 6,
  background: "var(--surface)",
  color: "var(--fg)",
  font: "300 15px/1.4 var(--serif)",
};

const LABEL: React.CSSProperties = {
  display: "block",
  font: "400 12px/1.6 var(--mono)",
  letterSpacing: ".14em",
  textTransform: "uppercase",
  color: "var(--fg-mute)",
  marginBottom: 6,
};

/**
 * The free-project library.
 *
 * Reads as a shelf rather than a list: every room type gets its heading and its
 * "3 of 5" count whether or not anything sits there, because the gaps are the
 * work. Publishing takes one of your own finished projects and freezes it —
 * photo and masks copied once — and everything opened from the shelf afterwards
 * reuses those same files, so no mask is ever generated a second time.
 */
export function FreeProjectLibrary({
  initial,
  sources,
  publishAction,
  startAction,
  setPublishedAction,
  refreshAction,
  deleteAction,
}: FreeProjectLibraryProps) {
  const router = useRouter();
  const [templates, setTemplates] = useState(initial ?? []);
  const [space, setSpace] = useState<TemplateSpace>("INTERIOR");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Ticked rooms. Survives switching between interiors and exteriors, so a
  // selection can span both — the toolbar always says how many are held.
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  /** The rooms a confirmation is currently open for. Null = no dialog. */
  const [confirming, setConfirming] = useState<FreeProjectTemplate[] | null>(null);

  const eligibleSources = useMemo(() => (sources ?? []).filter((p) => p.eligible), [sources]);

  // Shelves for the selected space, each with the templates sitting on it. Room
  // keys that were hand-typed (not in ROOM_SHELVES) still get a shelf, appended
  // after the known ones, so nothing published can become invisible.
  const shelves = useMemo(() => {
    const known = ROOM_SHELVES.filter((s) => s.space === space);
    const extraKeys = templates
      .filter((t) => t.space === space && !known.some((s) => s.key === t.roomKey))
      .map((t) => t.roomKey);
    const all = [
      ...known,
      ...Array.from(new Set(extraKeys)).map((key) => ({
        space,
        key,
        label: roomLabelFor(key, templates.find((t) => t.roomKey === key)?.roomLabel),
      })),
    ];
    return all.map((shelf) => ({
      ...shelf,
      items: templates.filter((t) => t.space === space && t.roomKey === shelf.key),
    }));
  }, [templates, space]);

  const total = templates.length;
  const live = templates.filter((t) => t.published).length;

  function run<T>(id: string | null, fn: () => Promise<T>, after: (result: T) => void) {
    setBusyId(id);
    startTransition(async () => {
      setError(null);
      setNotice(null);
      const result = await fn();
      setBusyId(null);
      after(result);
    });
  }

  function handleStart(template: FreeProjectTemplate) {
    run(template.id, () => startAction(template.id), (res) => {
      if (res.error) {
        setError(res.error);
        return;
      }
      // The copy is a normal project from here on, so hand it to the studio.
      if (res.started) router.push(`/studio?project=${encodeURIComponent(res.started.projectId)}`);
    });
  }

  function handleTogglePublished(template: FreeProjectTemplate) {
    run(template.id, () => setPublishedAction(template.id, !template.published), (res) => {
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.template) {
        setTemplates((prev) => prev.map((t) => (t.id === template.id ? res.template! : t)));
      }
    });
  }

  /**
   * Pull the room's pictures back from the project it was published from.
   *
   * The one thing a published room could not do was change. Publishing takes a
   * COPY of the masks — that is what stops the shelf shifting when the admin keeps
   * repainting the original — so a wall that needed widening, or one that had been
   * missed, was frozen in place. Fix it in the studio, press this.
   */
  function handleRefresh(template: FreeProjectTemplate) {
    run(template.id, () => refreshAction(template.id), (res) => {
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.template) {
        setTemplates((prev) => prev.map((t) => (t.id === template.id ? res.template! : t)));
        setNotice(
          `"${res.template.title}" now shows this project's current walls — ${res.template.regionCount} of them. `
          + "Copies people already opened keep the version they started on.",
        );
      }
    });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedTemplates = useMemo(
    () => templates.filter((t) => selected.has(t.id)),
    [templates, selected],
  );

  /** Confirm before anything is removed — one room or a whole selection. */
  function askToRemove(items: FreeProjectTemplate[]) {
    if (items.length === 0) return;
    setError(null);
    setNotice(null);
    setConfirming(items);
  }

  function handleRemove(items: FreeProjectTemplate[], purgeFiles: boolean) {
    const ids = items.map((t) => t.id);
    run(ids.length === 1 ? (ids[0] ?? null) : null, () => deleteAction(ids, purgeFiles), (res) => {
      setConfirming(null);
      if (res.error) {
        setError(res.error);
        return;
      }
      const result = res.result;
      if (!result) return;
      const goneIds = new Set(result.removed.map((r) => r.id));
      setTemplates((prev) => prev.filter((t) => !goneIds.has(t.id)));
      setSelected((prev) => new Set([...prev].filter((id) => !goneIds.has(id))));

      const count = result.removed.length;
      const roomWord = `${count} room${count === 1 ? "" : "s"}`;
      let message = purgeFiles
        ? `${roomWord} removed, along with ${result.filesPurged} stored file${result.filesPurged === 1 ? "" : "s"}.`
        : `${roomWord} off the shelf. The stored files stayed, so every copy already opened still works.`;
      if (purgeFiles && result.copiesBroken > 0) {
        message += ` ${result.copiesBroken} copy/copies that were pointing at those files have lost their picture.`;
      }
      if (result.failed.length > 0) {
        message += ` ${result.failed.length} could not be removed.`;
      }
      setNotice(message);
    });
  }

  function handlePublished(template: FreeProjectTemplate) {
    setTemplates((prev) => [...prev, template]);
    setSpace(template.space);
    setNotice(
      `"${template.title}" is on the shelf under ${template.roomLabel}, with ` +
        `${template.regionCount} wall${template.regionCount === 1 ? "" : "s"} ready to paint.`,
    );
  }

  if (initial === null) {
    return (
      <p className="field-error" role="alert">
        Could not load the free-project library — refresh the page, or sign in again if it keeps happening.
      </p>
    );
  }

  return (
    <div>
      <PublishPanel
        sources={sources}
        eligibleSources={eligibleSources}
        publishAction={publishAction}
        onPublished={handlePublished}
        onError={setError}
      />

      {error && (
        <p className="field-error" role="alert" style={{ marginTop: 20 }}>
          {error}
        </p>
      )}
      {notice && (
        <p role="status" style={{ marginTop: 20, font: "300 15px/1.6 var(--serif)", color: "var(--accent-soft)" }}>
          {notice}
        </p>
      )}

      {/* ── The shelf ───────────────────────────────────────────────────── */}
      <div style={{ marginTop: 56, borderTop: "1px solid var(--rule)", paddingTop: 32 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "12px 20px" }}>
          <h2 className="display" style={{ fontSize: "clamp(24px, 3vw, 34px)", margin: 0 }}>
            On the <i>shelf.</i>
          </h2>
          <Mono style={{ color: "var(--fg-mute)" }}>
            {total} room{total === 1 ? "" : "s"} · {live} visible
          </Mono>
        </div>

        {confirming && (
          <RemoveConfirm
            items={confirming}
            busy={pending}
            onCancel={() => setConfirming(null)}
            onConfirm={(purgeFiles) => handleRemove(confirming, purgeFiles)}
          />
        )}

        {selected.size > 0 && !confirming && (
          <div
            style={{
              marginTop: 20,
              padding: "12px 16px",
              border: "1px solid var(--accent-soft)",
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              gap: "10px 16px",
              flexWrap: "wrap",
            }}
          >
            <Mono style={{ color: "var(--fg-soft)" }}>
              {selected.size} selected
            </Mono>
            <Button size="sm" onClick={() => askToRemove(selectedTemplates)} disabled={pending}>
              Remove selected
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} disabled={pending}>
              Clear
            </Button>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 20, flexWrap: "wrap" }}>
          {SPACES.map((s) => {
            const count = templates.filter((t) => t.space === s).length;
            const active = s === space;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSpace(s)}
                aria-pressed={active}
                style={{
                  padding: "8px 16px",
                  borderRadius: 999,
                  cursor: "pointer",
                  border: `1px solid ${active ? "var(--accent-soft)" : "var(--rule-strong)"}`,
                  background: active ? "var(--accent-soft)" : "transparent",
                  color: active ? "var(--surface)" : "var(--fg-soft)",
                  font: "500 12px/1 var(--mono)",
                  letterSpacing: ".1em",
                  textTransform: "uppercase",
                }}
              >
                {SPACE_LABEL[s]} ({count})
              </button>
            );
          })}
        </div>

        {shelves.map((shelf) => (
          <section key={shelf.key} style={{ marginTop: 40 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <h3 style={{ font: "400 20px/1.3 var(--serif)", margin: 0 }}>{shelf.label}</h3>
              <Mono
                style={{
                  color: shelf.items.length >= TARGET_PER_SHELF ? "var(--accent-soft)" : "var(--fg-mute)",
                }}
              >
                {shelf.items.length} of {TARGET_PER_SHELF}
              </Mono>
              {shelf.items.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const ids = shelf.items.map((t) => t.id);
                    const allHeld = ids.every((id) => selected.has(id));
                    setSelected((prev) => {
                      const next = new Set(prev);
                      ids.forEach((id) => (allHeld ? next.delete(id) : next.add(id)));
                      return next;
                    });
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    font: "500 12px/1 var(--mono)",
                    letterSpacing: ".1em",
                    textTransform: "uppercase",
                    color: "var(--accent-soft)",
                  }}
                >
                  {shelf.items.every((t) => selected.has(t.id)) ? "Deselect all" : "Select all"}
                </button>
              )}
            </div>

            {shelf.items.length === 0 ? (
              <p style={{ marginTop: 10, font: "300 15px/1.6 var(--serif)", color: "var(--fg-mute)" }}>
                Nothing here yet. Publish a segmented project above to fill this shelf.
              </p>
            ) : (
              <div
                className="r-cols-md-2 r-cols-xs-1"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 20,
                  marginTop: 16,
                  alignItems: "start",
                }}
              >
                {shelf.items.map((t) => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    busy={pending && busyId === t.id}
                    disabled={pending}
                    selected={selected.has(t.id)}
                    onToggleSelect={() => toggleSelect(t.id)}
                    onStart={() => handleStart(t)}
                    onTogglePublished={() => handleTogglePublished(t)}
                    onRefresh={() => handleRefresh(t)}
                    onDelete={() => askToRemove([t])}
                  />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function TemplateCard({
  template,
  busy,
  disabled,
  selected,
  onToggleSelect,
  onStart,
  onTogglePublished,
  onRefresh,
  onDelete,
}: {
  template: FreeProjectTemplate;
  busy: boolean;
  disabled: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onStart: () => void;
  onTogglePublished: () => void;
  onRefresh: () => void;
  onDelete: () => void;
}) {
  const src = resolveMediaUrl(template.imageUrl);
  return (
    <article style={{ ...CARD, outline: selected ? "2px solid var(--accent-soft)" : undefined }}>
      <div style={{ position: "relative", aspectRatio: "4 / 3", background: "var(--surface)" }}>
        <label
          title="Select this room"
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            zIndex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 30,
            height: 30,
            borderRadius: 6,
            cursor: "pointer",
            background: "var(--surface)",
            border: `1px solid ${selected ? "var(--accent-soft)" : "var(--rule-strong)"}`,
          }}
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            aria-label={`Select ${template.title}`}
            style={{ cursor: "pointer", margin: 0 }}
          />
        </label>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- backend-signed URL, not a static asset
          <img
            src={src}
            alt={template.title}
            loading="lazy"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : null}
        {!template.published && (
          <span
            style={{
              position: "absolute",
              top: 10,
              left: 10,
              padding: "4px 10px",
              borderRadius: 999,
              background: "var(--surface)",
              border: "1px solid var(--rule-strong)",
              font: "500 12px/1 var(--mono)",
              letterSpacing: ".12em",
              textTransform: "uppercase",
              color: "var(--fg-mute)",
            }}
          >
            Hidden
          </span>
        )}
      </div>

      <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
        <div>
          <h4 style={{ font: "400 18px/1.3 var(--serif)", margin: 0 }}>{template.title}</h4>
          <Mono style={{ color: "var(--fg-mute)", display: "block", marginTop: 6 }}>
            {template.regionCount} wall{template.regionCount === 1 ? "" : "s"} · opened {template.timesUsed}×
            {template.copiesInUse > 0 && ` · ${template.copiesInUse} copy/copies live`}
          </Mono>
        </div>

        {template.description && (
          <p style={{ margin: 0, font: "300 14px/1.6 var(--serif)", color: "var(--fg-soft)" }}>
            {template.description}
          </p>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: "auto", paddingTop: 6 }}>
          <Button size="sm" onClick={onStart} disabled={disabled || !template.published}>
            {busy ? "Opening…" : "Open a copy"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onTogglePublished} disabled={disabled}>
            {template.published ? "Hide" : "Show"}
          </Button>
          {/* Only offered where it can work: a room published before we recorded
              which project it came from has nothing to refresh against, and saying
              so on the button beats a failure after the click. */}
          <Button
            size="sm"
            variant="ghost"
            onClick={onRefresh}
            disabled={disabled || !template.sourceProjectId}
            title={
              template.sourceProjectId
                ? "Re-copy the photo and walls from the project this was published from — "
                  + "how you fix a mask after publishing. Copies people already opened are left as they are."
                : "Published before we started recording the source project, so there is nothing to refresh from."
            }
          >
            Update walls
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete} disabled={disabled}>
            Remove
          </Button>
        </div>
      </div>
    </article>
  );
}

/**
 * The removal choice, spelled out rather than hidden behind a checkbox.
 *
 * There are two different operations here and only one of them is reversible in
 * any practical sense. Taking a room off the shelf stops anyone opening a new
 * copy and changes nothing for the people already holding one. Deleting the
 * stored files ALSO takes the picture away from every one of those copies —
 * they share the file, that is the entire point of the design — so the count of
 * live copies is put in front of the button, and that button is the second one,
 * not the default.
 */
function RemoveConfirm({
  items,
  busy,
  onCancel,
  onConfirm,
}: {
  items: FreeProjectTemplate[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: (purgeFiles: boolean) => void;
}) {
  const copies = items.reduce((sum, t) => sum + t.copiesInUse, 0);
  const files = items.reduce((sum, t) => sum + t.regionCount + 1, 0);
  const what =
    items.length === 1 ? `“${items[0]?.title ?? ""}”` : `${items.length} rooms`;

  return (
    <div
      role="alertdialog"
      aria-label="Remove from the library"
      style={{
        marginTop: 20,
        padding: "20px 22px",
        border: "1px solid var(--rule-strong)",
        borderRadius: 8,
        background: "var(--surface-soft)",
      }}
    >
      <h3 style={{ font: "400 20px/1.3 var(--serif)", margin: "0 0 8px" }}>Remove {what}?</h3>
      <p style={{ margin: "0 0 18px", font: "300 15px/1.7 var(--serif)", color: "var(--fg-soft)", maxWidth: "62ch" }}>
        {copies > 0 ? (
          <>
            {copies} copy/copies of {items.length === 1 ? "this room" : "these rooms"} {copies === 1 ? "is" : "are"}{" "}
            open in people&apos;s accounts right now, sharing the same stored photo and masks.
          </>
        ) : (
          <>Nobody is holding a copy of {items.length === 1 ? "this room" : "these rooms"} at the moment.</>
        )}
      </p>

      <div style={{ display: "grid", gap: 12 }}>
        <div
          style={{
            padding: "14px 16px",
            border: "1px solid var(--rule)",
            borderRadius: 6,
            background: "var(--surface)",
          }}
        >
          <Button onClick={() => onConfirm(false)} disabled={busy}>
            {busy ? "Removing…" : "Take off the shelf"}
          </Button>
          <p style={{ margin: "10px 0 0", font: "300 14px/1.6 var(--serif)", color: "var(--fg-soft)" }}>
            Keeps the stored files. Nobody can start a new copy, and every copy already
            open carries on working exactly as it does now. This is almost always the one
            you want.
          </p>
        </div>

        <div
          style={{
            padding: "14px 16px",
            border: `1px solid ${copies > 0 ? "var(--accent-soft)" : "var(--rule)"}`,
            borderRadius: 6,
            background: "var(--surface)",
          }}
        >
          <Button variant="ghost" onClick={() => onConfirm(true)} disabled={busy}>
            {busy ? "Removing…" : `Delete the stored files too (${files})`}
          </Button>
          <p style={{ margin: "10px 0 0", font: "300 14px/1.6 var(--serif)", color: "var(--fg-soft)" }}>
            Frees the storage by deleting the photo and every mask.{" "}
            {copies > 0 ? (
              <strong>
                The {copies} open cop{copies === 1 ? "y" : "ies"} point at these exact files and
                will lose {copies === 1 ? "its" : "their"} picture.
              </strong>
            ) : (
              <>Safe here — no copies are pointing at them.</>
            )}{" "}
            There is no undo.
          </p>
        </div>
      </div>

      <p style={{ marginTop: 16 }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            font: "500 12px/1 var(--mono)",
            letterSpacing: ".1em",
            textTransform: "uppercase",
            color: "var(--fg-mute)",
          }}
        >
          Cancel
        </button>
      </p>
    </div>
  );
}

/**
 * Publishing: pick one of your own finished projects, say which shelf it belongs
 * on, and its photo and masks are copied into the library. Projects with no walls
 * are listed but not selectable — publishing one would put an empty room on the
 * shelf, which is the one thing the library must never contain.
 */
function PublishPanel({
  sources,
  eligibleSources,
  publishAction,
  onPublished,
  onError,
}: {
  sources: PublishableProject[] | null;
  eligibleSources: PublishableProject[];
  publishAction: (input: PublishFreeProjectBody) => Promise<{ template?: FreeProjectTemplate; error?: string }>;
  onPublished: (template: FreeProjectTemplate) => void;
  onError: (message: string) => void;
}) {
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [space, setSpace] = useState<TemplateSpace>("INTERIOR");
  const [roomKey, setRoomKey] = useState(firstShelfFor("INTERIOR").key);
  const [description, setDescription] = useState("");
  const [pending, startTransition] = useTransition();

  const roomOptions = ROOM_SHELVES.filter((s) => s.space === space);
  const chosen = eligibleSources.find((p) => p.id === projectId) ?? null;

  function changeSpace(next: TemplateSpace) {
    setSpace(next);
    setRoomKey(firstShelfFor(next).key);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) {
      onError("Pick the project to publish.");
      return;
    }
    if (!title.trim()) {
      onError("Give the template a title.");
      return;
    }
    startTransition(async () => {
      const res = await publishAction({
        projectId,
        title: title.trim(),
        space,
        roomKey,
        roomLabel: roomLabelFor(roomKey),
        description: description.trim() || undefined,
      });
      if (res.error) {
        onError(res.error);
        return;
      }
      if (res.template) {
        onPublished(res.template);
        setProjectId("");
        setTitle("");
        setDescription("");
      }
    });
  }

  return (
    <section
      style={{
        marginTop: 32,
        padding: "24px 24px 26px",
        border: "1px solid var(--rule-strong)",
        borderRadius: 8,
        background: "var(--surface-soft)",
      }}
    >
      <h2 style={{ font: "400 22px/1.3 var(--serif)", margin: "0 0 6px" }}>Put a room on the shelf</h2>
      <p style={{ margin: "0 0 20px", font: "300 15px/1.7 var(--serif)", color: "var(--fg-soft)", maxWidth: "62ch" }}>
        Pick one of your own projects that already has its walls marked. Its photo and
        every mask are copied into the library once, here — after that the room opens
        for anyone straight from those files, and wall detection never runs on it again.
      </p>

      {sources === null ? (
        <p className="field-error" role="alert">
          Could not load your projects — refresh the page and try again.
        </p>
      ) : eligibleSources.length === 0 ? (
        <p style={{ margin: 0, font: "300 15px/1.7 var(--serif)", color: "var(--fg-mute)" }}>
          None of your projects have walls yet. Open the studio, upload a room, let it
          detect the walls (or mark them yourself), then come back — that finished
          project is what becomes a free one.
        </p>
      ) : (
        <form onSubmit={submit} style={{ display: "grid", gap: 18 }}>
          <div className="r-cols-xs-1" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
            <div>
              <label htmlFor="fp-project" style={LABEL}>
                Project to freeze
              </label>
              <select
                id="fp-project"
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  const picked = eligibleSources.find((p) => p.id === e.target.value);
                  if (picked && !title.trim()) setTitle(picked.name);
                }}
                style={{ ...FIELD, cursor: "pointer" }}
              >
                <option value="">Choose one…</option>
                {eligibleSources.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.regionCount} wall{p.regionCount === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
              {sources.some((p) => !p.eligible) && (
                <Mono style={{ color: "var(--fg-mute)", display: "block", marginTop: 8 }}>
                  {sources.filter((p) => !p.eligible).length} of your projects have no walls yet and aren&apos;t listed.
                </Mono>
              )}
            </div>

            <div>
              <label htmlFor="fp-title" style={LABEL}>
                Title
              </label>
              <input
                id="fp-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Sunlit living room"
                maxLength={160}
                style={FIELD}
              />
            </div>

            <div>
              <label htmlFor="fp-space" style={LABEL}>
                Interior or exterior
              </label>
              <select
                id="fp-space"
                value={space}
                onChange={(e) => changeSpace(e.target.value as TemplateSpace)}
                style={{ ...FIELD, cursor: "pointer" }}
              >
                <option value="INTERIOR">Interior</option>
                <option value="EXTERIOR">Exterior</option>
              </select>
            </div>

            <div>
              <label htmlFor="fp-room" style={LABEL}>
                {space === "INTERIOR" ? "Room" : "Style"}
              </label>
              <select
                id="fp-room"
                value={roomKey}
                onChange={(e) => setRoomKey(e.target.value)}
                style={{ ...FIELD, cursor: "pointer" }}
              >
                {roomOptions.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="fp-description" style={LABEL}>
              Description <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span>
            </label>
            <input
              id="fp-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="South-facing, one accent wall behind the sofa."
              style={FIELD}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <Button type="submit" disabled={pending}>
              {pending ? "Copying files…" : "Publish to the library"}
            </Button>
            {chosen && (
              <Mono style={{ color: "var(--fg-mute)" }}>
                Copies {chosen.regionCount} mask{chosen.regionCount === 1 ? "" : "s"} + the photo, once.
              </Mono>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
