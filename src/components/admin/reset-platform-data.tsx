"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { DataResetResult } from "@/lib/api";

/** Typed exactly (case-insensitive) to arm the reset — must match the backend's phrase. */
const CONFIRM_PHRASE = "RESET ALL DATA";

/** Human labels for the tables worth naming on the confirmation screen. */
const HEADLINE_TABLES: Array<[string, string]> = [
  ["users", "accounts"],
  ["organizations", "shops & distributors"],
  ["projects", "projects"],
  ["regions", "wall regions"],
  ["customer_access_codes", "access codes"],
  ["subscriptions", "subscriptions"],
  ["store_payments", "kiosk payments"],
  ["uploaded_images", "uploaded images"],
];

type Props = {
  previewAction: () => Promise<{ result?: DataResetResult; error?: string }>;
  resetAction: (
    confirmation: string,
    deleteImageFiles: boolean,
  ) => Promise<{ result?: DataResetResult; error?: string }>;
};

/**
 * Danger zone: empties the platform of every account, shop, project and payment while
 * keeping the paint catalogue.
 *
 * Two deliberate speed bumps before anything is destroyed — you have to load the preview
 * (so the numbers on screen are the real ones, not a promise) and then type the phrase.
 * The catalogue is never included: shades are uploaded by hand and AI-enriched once, with
 * no copy in the repo, so there is no version of this button that deletes them.
 */
export function ResetPlatformData({ previewAction, resetAction }: Props) {
  const [confirm, setConfirm] = useState("");
  const [deleteFiles, setDeleteFiles] = useState(true);
  const [preview, setPreview] = useState<DataResetResult | null>(null);
  const [done, setDone] = useState<DataResetResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const armed = preview !== null && confirm.trim().toUpperCase() === CONFIRM_PHRASE && !pending;

  function loadPreview() {
    startTransition(async () => {
      setError(null);
      setDone(null);
      const res = await previewAction();
      if (res.error || !res.result) {
        setError(res.error ?? "Could not read the current data.");
        return;
      }
      setPreview(res.result);
    });
  }

  function submit() {
    if (!armed) return;
    startTransition(async () => {
      setError(null);
      const res = await resetAction(CONFIRM_PHRASE, deleteFiles);
      if (res.error || !res.result) {
        setError(res.error ?? "Reset failed.");
        return;
      }
      setDone(res.result);
      setPreview(null);
      setConfirm("");
    });
  }

  const rows = (counts: Record<string, number>) =>
    HEADLINE_TABLES.map(([table, label]) => [label, counts[table] ?? 0] as const)
      .filter(([, n]) => n > 0)
      .map(([label, n]) => (
        <li key={label} style={{ font: "400 14px/1.7 var(--serif)", color: "var(--fg-soft)" }}>
          <strong style={{ color: "var(--fg)" }}>{n.toLocaleString()}</strong> {label}
        </li>
      ));

  return (
    <section
      style={{
        marginTop: 56,
        padding: "24px 24px 28px",
        border: "1px solid color-mix(in srgb, var(--danger, #c0392b) 45%, var(--rule-strong))",
        background: "color-mix(in srgb, var(--danger, #c0392b) 5%, var(--surface))",
      }}
    >
      <p
        style={{
          font: "600 12px/1 var(--mono)",
          letterSpacing: ".08em",
          textTransform: "uppercase",
          color: "var(--danger, #c0392b)",
          margin: 0,
        }}
      >
        Danger zone
      </p>
      <h2 style={{ font: "600 22px/1.3 var(--serif)", color: "var(--fg)", margin: "10px 0 8px" }}>
        Reset all platform data
      </h2>
      <p style={{ font: "400 14px/1.6 var(--serif)", color: "var(--fg-mute)", maxWidth: "62ch", margin: 0 }}>
        Deletes <strong style={{ color: "var(--fg)" }}>every account, shop, project, subscription,
        wallet, payment and access code</strong> on the platform. The paint catalogue — companies,
        product lines and shades — is kept, and so is your own admin account, so you stay signed in.
        This cannot be undone: take a database snapshot first.
      </p>
      {preview && !done && (
        <label
          style={{
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
            margin: "20px 0 0",
            maxWidth: "62ch",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={deleteFiles}
            onChange={(e) => setDeleteFiles(e.target.checked)}
            style={{ marginTop: 3, width: 16, height: 16, accentColor: "var(--danger, #c0392b)" }}
          />
          <span style={{ font: "400 14px/1.6 var(--serif)", color: "var(--fg-soft)" }}>
            <strong style={{ color: "var(--fg)" }}>Also delete the uploaded image files.</strong>{" "}
            Every photo and mask in the image store. They become unreachable anyway once the rows
            naming them are gone, so leaving this off just means paying to keep files nothing can
            read — but note a database snapshot can restore the rows and cannot restore these.
          </span>
        </label>
      )}

      {!done && (
        <div style={{ marginTop: 22 }}>
          <Button onClick={() => loadPreview()} disabled={pending}>
            {pending && !preview ? (
              <>
                <Spinner size={14} color="currentColor" decorative /> Checking…
              </>
            ) : preview ? (
              "Refresh what will be deleted"
            ) : (
              "Show me what will be deleted"
            )}
          </Button>
        </div>
      )}

      {preview && !done && (
        <div
          style={{
            marginTop: 20,
            padding: "16px 18px",
            border: "1px solid var(--rule-strong)",
            background: "var(--surface)",
          }}
        >
          <p style={{ font: "600 14px/1.4 var(--serif)", color: "var(--fg)", margin: "0 0 8px" }}>
            This will delete {preview.totalDeleted.toLocaleString()} row
            {preview.totalDeleted === 1 ? "" : "s"} across {preview.clearedTables.length} tables:
          </p>
          <ul style={{ margin: "0 0 14px", paddingLeft: 20 }}>{rows(preview.deletedRows)}</ul>
          <p style={{ font: "600 14px/1.4 var(--serif)", color: "var(--fg)", margin: "0 0 8px" }}>
            Kept:
          </p>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {Object.entries(preview.preservedTables).map(([table, n]) => (
              <li key={table} style={{ font: "400 14px/1.7 var(--serif)", color: "var(--fg-soft)" }}>
                <strong style={{ color: "var(--fg)" }}>{n.toLocaleString()}</strong> {table.replace(/_/g, " ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      {preview && !done && (
        <>
          <label
            htmlFor="confirm-reset-data"
            style={{
              display: "block",
              font: "600 13px/1 var(--mono)",
              letterSpacing: ".04em",
              textTransform: "uppercase",
              color: "var(--fg-mute)",
              margin: "22px 0 10px",
            }}
          >
            Type <span style={{ color: "var(--danger, #c0392b)" }}>{CONFIRM_PHRASE}</span> to confirm
          </label>
          <input
            id="confirm-reset-data"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={CONFIRM_PHRASE}
            autoComplete="off"
            spellCheck={false}
            aria-label={`Type ${CONFIRM_PHRASE} to confirm`}
            style={{
              width: "100%",
              maxWidth: 360,
              padding: "12px 14px",
              border: "1px solid var(--rule-strong)",
              background: "var(--surface)",
              color: "var(--fg)",
              font: "500 15px/1.3 var(--mono)",
              letterSpacing: ".02em",
            }}
          />

          <div style={{ marginTop: 20, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            <Button
              onClick={() => submit()}
              disabled={!armed}
              style={{
                background: armed ? "var(--danger, #c0392b)" : undefined,
                borderColor: armed ? "var(--danger, #c0392b)" : undefined,
                color: armed ? "#fff" : undefined,
              }}
            >
              {pending ? (
                <>
                  <Spinner size={14} color="currentColor" decorative /> Resetting…
                </>
              ) : (
                "Reset all data"
              )}
            </Button>
            {!armed && !pending && (
              <span style={{ font: "400 13px/1.5 var(--serif)", color: "var(--fg-mute)" }}>
                Type the phrase exactly to enable.
              </span>
            )}
          </div>
        </>
      )}

      {error && (
        <p className="field-error" role="alert" style={{ marginTop: 16 }}>
          {error}
        </p>
      )}

      {done && (
        <div
          role="status"
          style={{
            marginTop: 20,
            padding: "16px 18px",
            border: "1px solid var(--rule-strong)",
            background: "var(--surface)",
          }}
        >
          <p style={{ font: "600 15px/1.4 var(--serif)", color: "var(--fg)", margin: 0 }}>
            <span aria-hidden style={{ color: "var(--accent)" }}>✓</span> Platform reset
          </p>
          <p style={{ font: "400 13px/1.5 var(--serif)", color: "var(--fg-mute)", margin: "6px 0 0" }}>
            {done.totalDeleted.toLocaleString()} row{done.totalDeleted === 1 ? "" : "s"} removed from{" "}
            {done.clearedTables.length} tables
            {done.deletedImageFiles > 0
              ? `, plus ${done.deletedImageFiles.toLocaleString()} image file${
                  done.deletedImageFiles === 1 ? "" : "s"
                }`
              : ""}
            . Catalogue kept:{" "}
            {Object.entries(done.preservedTables)
              .map(([table, n]) => `${n.toLocaleString()} ${table.replace(/_/g, " ")}`)
              .join(" · ")}
            .
          </p>
        </div>
      )}
    </section>
  );
}
