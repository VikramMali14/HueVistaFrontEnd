"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { deleteAccountAction } from "@/lib/auth";
import { Spinner } from "@/components/ui/spinner";

const dangerBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  font: "600 14px/1 var(--sans)",
  padding: "12px 18px",
  borderRadius: "var(--radius-pill)",
  background: "transparent",
  color: "var(--terracotta)",
  border: "1px solid var(--terracotta)",
  cursor: "pointer",
};

/**
 * Two-step delete: reveal a confirmation, require typing DELETE, then submit a
 * real <form action> so the server action's redirect is handled by the framework.
 */
export function DeleteAccountButton() {
  const [confirming, setConfirming] = useState(false);
  const [text, setText] = useState("");
  const armed = text.trim().toUpperCase() === "DELETE";

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} style={dangerBtn}>
        Delete account
      </button>
    );
  }

  return (
    <form action={deleteAccountAction} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="field">
        <label className="field-label" htmlFor="confirm-delete">
          Type <strong>DELETE</strong> to confirm
        </label>
        <input
          id="confirm-delete"
          name="confirm"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="DELETE"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          style={{ maxWidth: 240 }}
        />
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <DeleteSubmit disabled={!armed} />
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            setConfirming(false);
            setText("");
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function DeleteSubmit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  const blocked = disabled || pending;
  return (
    <button
      type="submit"
      disabled={blocked}
      aria-busy={pending}
      style={{ ...dangerBtn, background: "var(--terracotta)", color: "var(--bg)", opacity: blocked ? 0.5 : 1, cursor: blocked ? "not-allowed" : "pointer" }}
    >
      {pending ? (
        <>
          <Spinner size={12} color="currentColor" decorative /> Deleting…
        </>
      ) : (
        "Permanently delete my account"
      )}
    </button>
  );
}
