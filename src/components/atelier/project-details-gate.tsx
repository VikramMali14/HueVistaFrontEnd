"use client";

import { useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { t } from "@/lib/i18n";
import type { UiLocale, UiVariant } from "@/lib/types";

export interface ProjectDetails {
  name: string;
  roomType?: string;
  notes?: string;
}

const ROOM_TYPES = [
  "Living room",
  "Bedroom",
  "Kitchen",
  "Bathroom",
  "Office",
  "Hallway",
  "Exterior",
  "Other",
] as const;

/**
 * Step 0 of a new project: collect a name (and a little context) BEFORE we
 * create anything on the backend. Replaces the old behaviour where uploading a
 * photo silently created an untitled project.
 */
export function ProjectDetailsGate({
  variant = "premium",
  locale: _locale = "en",
  onSubmit,
}: {
  variant?: UiVariant;
  locale?: UiLocale;
  onSubmit: (details: ProjectDetails) => void;
}) {
  const isClassic = variant === "classic";
  const [name, setName] = useState("");
  const [roomType, setRoomType] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [touched, setTouched] = useState(false);

  const valid = name.trim().length > 0;
  const submit = () => {
    if (!valid) {
      setTouched(true);
      return;
    }
    onSubmit({ name: name.trim(), roomType: roomType || undefined, notes: notes.trim() || undefined });
  };

  const fieldStyle: React.CSSProperties = {
    width: "100%",
    padding: isClassic ? "10px 12px" : "10px 0",
    border: isClassic ? "1px solid var(--rule-strong)" : "none",
    borderBottom: "1px solid " + (isClassic ? "var(--rule-strong)" : "var(--rule-strong)"),
    borderRadius: isClassic ? 8 : 0,
    background: isClassic ? "var(--surface)" : "transparent",
    color: "var(--fg)",
    fontFamily: isClassic ? "var(--sans, system-ui)" : "var(--serif)",
    fontSize: isClassic ? 15 : 18,
    outline: "none",
  };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(20px, 5vw, 56px)",
        overflow: "auto",
      }}
    >
      <div style={{ width: "min(440px, 100%)", display: "flex", flexDirection: "column", gap: 22 }}>
        <div>
          {isClassic ? (
            <span
              style={{
                display: "block",
                marginBottom: 8,
                font: "600 11px/1 var(--sans, system-ui)",
                letterSpacing: ".08em",
                textTransform: "uppercase",
                color: "var(--accent)",
              }}
            >
              New project
            </span>
          ) : (
            <Mono brass style={{ marginBottom: 10, display: "block" }}>New project</Mono>
          )}
          <h2
            style={{
              margin: 0,
              ...(isClassic
                ? { font: "600 28px/1.2 var(--sans, system-ui)" }
                : { fontFamily: "var(--serif)", fontWeight: 300, fontSize: "clamp(30px, 5vw, 46px)", lineHeight: 1 }),
              color: "var(--fg)",
            }}
          >
            {isClassic ? "Name your project" : <>Name your <i style={{ color: "var(--accent-soft)" }}>project.</i></>}
          </h2>
          <p
            style={{
              margin: "10px 0 0",
              ...(isClassic
                ? { font: "400 14px/1.5 var(--sans, system-ui)" }
                : { font: "300 italic 16px/1.5 var(--serif)" }),
              color: "var(--fg-soft)",
            }}
          >
            A few details first — then upload the room photo.
          </p>
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Mono>Project name *</Mono>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder={isClassic ? "e.g. Sharma residence — hall" : "Belgavi 3 BHK · living room"}
            aria-label="Project name"
            autoFocus
            style={fieldStyle}
          />
          {touched && !valid && (
            <span className="field-error" role="alert" style={{ font: "400 12px/1.3 var(--sans, system-ui)", color: "#dc2626" }}>
              Please enter a name to continue.
            </span>
          )}
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Mono>Room type (optional)</Mono>
          <select value={roomType} onChange={(e) => setRoomType(e.target.value)} aria-label="Room type" style={{ ...fieldStyle, cursor: "pointer" }}>
            <option value="">Not specified</option>
            {ROOM_TYPES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Mono>Notes (optional)</Mono>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Client preferences, deadline, anything to remember…"
            aria-label="Notes"
            rows={2}
            style={{ ...fieldStyle, resize: "vertical", fontSize: isClassic ? 14 : 16 }}
          />
        </label>

        <button
          type="button"
          onClick={submit}
          className={isClassic ? "btn" : undefined}
          style={
            isClassic
              ? { alignSelf: "flex-start" }
              : {
                  alignSelf: "flex-start",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 22px",
                  background: "var(--accent)",
                  color: "var(--bg)",
                  border: "none",
                  cursor: "pointer",
                  font: "400 11px/1 var(--mono)",
                  letterSpacing: ".22em",
                  textTransform: "uppercase",
                }
          }
        >
          Continue to photo <span className="arr">→</span>
        </button>
      </div>
    </div>
  );
}
