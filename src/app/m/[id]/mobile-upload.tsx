"use client";

import { useCallback, useRef, useState } from "react";

type Status = "idle" | "sending" | "sent" | "error";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

export function MobileUpload({ sessionId }: { sessionId: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const choose = useCallback((f: File) => {
    setError(null);
    if (!ALLOWED.has(f.type)) {
      setError(
        /hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name)
          ? "iPhone HEIC photos aren't supported yet — in Camera settings choose “Most Compatible”, or pick a JPEG."
          : "Use a JPEG, PNG, or WebP photo.",
      );
      return;
    }
    setFile(f);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
    setStatus("idle");
  }, []);

  const send = useCallback(async () => {
    if (!file) return;
    setStatus("sending");
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/handoff/${sessionId}/image`, { method: "POST", body: form });
      if (!res.ok) {
        const msg = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(msg?.message || "Could not send the photo.");
      }
      setStatus("sent");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the photo.");
      setStatus("error");
    }
  }, [file, sessionId]);

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        padding: 24,
        background: "var(--bg)",
        color: "var(--fg)",
        textAlign: "center",
      }}
    >
      <span style={{ font: "400 11px/1 var(--mono)", letterSpacing: ".32em", textTransform: "uppercase", color: "var(--accent)" }}>
        HueVista · send a photo
      </span>

      {status === "sent" ? (
        <>
          <span aria-hidden style={{ fontSize: 44, color: "var(--accent)" }}>✓</span>
          <h1 style={{ font: "300 italic 28px/1.2 var(--serif)", margin: 0 }}>Sent to your computer.</h1>
          <p style={{ font: "400 15px/1.5 var(--sans, system-ui)", color: "var(--fg-soft)", maxWidth: "30ch" }}>
            Head back to the browser — your photo is loading into the colour finder.
          </p>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setStatus("idle");
              setFile(null);
              setPreview((prev) => {
                if (prev) URL.revokeObjectURL(prev);
                return null;
              });
            }}
          >
            Send another
          </button>
        </>
      ) : (
        <>
          <h1 style={{ font: "300 italic 30px/1.15 var(--serif)", margin: 0, maxWidth: "16ch" }}>
            Pick a photo to send.
          </h1>
          <p style={{ font: "400 15px/1.5 var(--sans, system-ui)", color: "var(--fg-soft)", maxWidth: "34ch", margin: 0 }}>
            Choose one from your phone (or take a new one). It appears on the computer that showed the code.
          </p>

          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) choose(f);
              e.target.value = "";
            }}
          />

          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Selected"
              style={{ maxWidth: "100%", maxHeight: "44vh", border: "1px solid var(--rule-strong)", objectFit: "contain" }}
            />
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              style={{
                width: "100%",
                maxWidth: 320,
                padding: "44px 20px",
                border: "1px dashed var(--rule-strong)",
                background: "var(--surface)",
                color: "var(--fg)",
                cursor: "pointer",
                font: "300 italic 18px/1.3 var(--serif)",
                borderRadius: 12,
              }}
            >
              Tap to choose a photo
            </button>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", width: "100%", maxWidth: 320 }}>
            {preview && (
              <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()} disabled={status === "sending"}>
                Change
              </button>
            )}
            {file && (
              <button type="button" className="btn btn-brass" onClick={() => void send()} disabled={status === "sending"}>
                {status === "sending" ? "Sending…" : "Send to computer →"}
              </button>
            )}
          </div>

          {error && (
            <div className="field-error" role="alert" style={{ maxWidth: 320 }}>
              {error}
            </div>
          )}
        </>
      )}
    </main>
  );
}
