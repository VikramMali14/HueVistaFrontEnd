"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { deleteAllShadesAction } from "@/lib/auth";
import type { DeleteAllShadesResult } from "@/lib/api";

/** Typed exactly (case-insensitive) to arm the wipe — a deliberate speed bump. */
const CONFIRM_PHRASE = "DELETE ALL SHADES";

/**
 * Danger zone: permanently deletes every shade across all brands. Guarded behind a
 * type-to-confirm so it can't be triggered by a stray click. The backend also clears
 * the applied-colour references projects' regions hold and evicts the shade caches.
 */
export function DeleteAllShades() {
  const [confirm, setConfirm] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<DeleteAllShadesResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const armed = confirm.trim().toUpperCase() === CONFIRM_PHRASE && !pending;

  function submit() {
    if (!armed) return;
    startTransition(async () => {
      setError(null);
      setResult(null);
      const res = await deleteAllShadesAction();
      if (res.error || !res.result) {
        setError(res.error ?? "Delete failed. Please try again.");
        return;
      }
      setResult(res.result);
      setConfirm("");
    });
  }

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
        Delete the entire catalogue
      </h2>
      <p style={{ font: "400 14px/1.6 var(--serif)", color: "var(--fg-mute)", maxWidth: "62ch", margin: 0 }}>
        Removes <strong style={{ color: "var(--fg)" }}>every shade across all brands</strong> and clears the
        colour applied to any project region. Companies themselves are kept. This cannot be undone — you&apos;d
        need to re-import shades afterwards.
      </p>

      <label
        htmlFor="confirm-delete-shades"
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
        id="confirm-delete-shades"
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
              <Spinner size={14} color="currentColor" decorative /> Deleting…
            </>
          ) : (
            "Delete all shades"
          )}
        </Button>
        {!armed && !pending && (
          <span style={{ font: "400 13px/1.5 var(--serif)", color: "var(--fg-mute)" }}>
            Type the phrase exactly to enable.
          </span>
        )}
      </div>

      {error && (
        <p className="field-error" role="alert" style={{ marginTop: 16 }}>
          {error}
        </p>
      )}

      {result && (
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
            <span aria-hidden style={{ color: "var(--accent)" }}>✓</span> Catalogue cleared
          </p>
          <p style={{ font: "400 13px/1.5 var(--serif)", color: "var(--fg-mute)", margin: "6px 0 0" }}>
            {result.deletedShades} shade{result.deletedShades === 1 ? "" : "s"} deleted ·{" "}
            {result.clearedRegionReferences} region colour reference
            {result.clearedRegionReferences === 1 ? "" : "s"} cleared
          </p>
        </div>
      )}
    </section>
  );
}
