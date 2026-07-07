"use client";

import { useCallback, useRef, useState } from "react";
import { IMAGE_ACCEPT, imageFileError } from "@/lib/image-upload";

type Status = "idle" | "sending" | "sent" | "error";

export function MobileUpload({ sessionId }: { sessionId: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const choose = useCallback(async (f: File) => {
    setError(null);
    const problem = imageFileError(f);
    if (problem) {
      setError(problem);
      return;
    }
    // Downscale big camera photos before upload: a modern 48MP JPEG is routinely
    // 8–15 MB, the server caps uploads at 10 MB, and shop connections are slow.
    let picked = f;
    try {
      const bmp = await createImageBitmap(f);
      const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
      if (scale < 1) {
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(bmp.width * scale);
        canvas.height = Math.round(bmp.height * scale);
        canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
        if (blob) picked = new File([blob], "photo.jpg", { type: "image/jpeg" });
      }
      bmp.close();
    } catch {
      /* browser couldn't decode it — keep the original file */
    }
    setFile(picked);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(picked);
    });
    setStatus("idle");
  }, []);

  const send = useCallback(async () => {
    if (!file) return;
    setStatus("sending");
    setError(null);
    setProgress(0);
    try {
      const form = new FormData();
      form.append("file", file);
      // XMLHttpRequest instead of fetch for upload progress — on shop 4G a static
      // "Sending…" can't be told apart from a stall.
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/api/handoff/${sessionId}/image`);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
            return;
          }
          let message = "Could not send the photo.";
          try {
            const body = JSON.parse(xhr.responseText) as { message?: string } | null;
            if (body?.message) message = body.message;
          } catch {
            /* no JSON body */
          }
          reject(new Error(message));
        };
        xhr.onerror = () => reject(new Error("Could not send the photo."));
        xhr.send(form);
      });
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
          <h1 style={{ font: "400 28px/1.2 var(--serif)", margin: 0 }}>Sent to your computer.</h1>
          <p style={{ font: "400 15px/1.5 var(--sans, system-ui)", color: "var(--fg-soft)", maxWidth: "30ch" }}>
            Head back to the browser — your photo is loading there now.
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
          <h1 style={{ font: "400 30px/1.15 var(--serif)", margin: 0, maxWidth: "16ch" }}>
            Pick a photo to send.
          </h1>
          <p style={{ font: "400 15px/1.5 var(--sans, system-ui)", color: "var(--fg-soft)", maxWidth: "34ch", margin: 0 }}>
            Choose one from your phone (or take a new one). It appears on the computer that showed the code.
          </p>

          <input
            ref={fileRef}
            type="file"
            accept={IMAGE_ACCEPT}
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void choose(f);
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
                font: "400 18px/1.3 var(--serif)",
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
                {status === "sending" ? `Sending… ${progress}%` : "Send to computer →"}
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
