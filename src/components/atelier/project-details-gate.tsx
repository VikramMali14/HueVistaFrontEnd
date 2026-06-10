"use client";

import { useState } from "react";
import { Mono } from "@/components/ui/eyebrow";

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
  onSubmit,
}: {
  onSubmit: (details: ProjectDetails) => void;
}) {
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
    padding: "10px 12px",
    border: "1px solid var(--rule-strong)",
    borderRadius: 8,
    background: "var(--surface)",
    color: "var(--fg)",
    fontFamily: "var(--sans)",
    fontSize: 15,
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
          <Mono brass style={{ marginBottom: 10, display: "block" }}>New project</Mono>
          <h2
            style={{
              margin: 0,
              font: "600 28px/1.2 var(--serif)", letterSpacing: "-.02em",
              color: "var(--fg)",
            }}
          >
            Name your project
          </h2>
          <p
            style={{
              margin: "10px 0 0",
              font: "400 14px/1.5 var(--sans)",
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
            placeholder="e.g. Sharma residence — hall"
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
            style={{ ...fieldStyle, resize: "vertical", fontSize: 14 }}
          />
        </label>

        <button
          type="button"
          onClick={submit}
          className="btn"
          style={{ alignSelf: "flex-start" }}
        >
          Continue to photo <span className="arr">→</span>
        </button>
      </div>
    </div>
  );
}
