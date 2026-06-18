"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Mono } from "@/components/ui/eyebrow";

type Phase = "idle" | "waiting" | "received" | "error";

/**
 * "Upload from your phone" hand-off (like signing a PDF on mobile). The desktop
 * opens a session, shows a QR code to /m/<id>; the phone uploads a photo there
 * and we poll the relay until it arrives, then hand the File to the parent.
 */
export function PhoneHandoff({ onImage }: { onImage: (file: File) => void }) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [qr, setQr] = useState<string | null>(null);
  const [mobileUrl, setMobileUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<{ cancelled: boolean } | null>(null);

  // A phone can't reach localhost/127.0.0.1 over the LAN — warn if the desktop
  // opened this page that way instead of via the machine's network IP.
  const isLocalOrigin = (() => {
    if (!mobileUrl) return false;
    try {
      const h = new URL(mobileUrl).hostname;
      return h === "localhost" || h === "127.0.0.1" || h === "::1";
    } catch {
      return false;
    }
  })();

  const stop = useCallback(() => {
    if (pollRef.current) pollRef.current.cancelled = true;
    pollRef.current = null;
  }, []);

  const close = useCallback(() => {
    stop();
    setOpen(false);
    setPhase("idle");
    setQr(null);
    setError(null);
  }, [stop]);

  const start = useCallback(async () => {
    stop();
    setOpen(true);
    setPhase("waiting");
    setError(null);
    setQr(null);
    try {
      const res = await fetch("/api/handoff", { method: "POST" });
      if (!res.ok) throw new Error("Could not start a session.");
      const { sessionId } = (await res.json()) as { sessionId: string };
      const url = `${window.location.origin}/m/${sessionId}`;
      setMobileUrl(url);
      setQr(await QRCode.toDataURL(url, { width: 240, margin: 1 }));

      const token = { cancelled: false };
      pollRef.current = token;
      const startedAt = performance.now();
      while (!token.cancelled) {
        await new Promise((r) => setTimeout(r, 1500));
        if (token.cancelled) return;
        if (performance.now() - startedAt > 10 * 60 * 1000) {
          setError("This code expired. Close and try again.");
          setPhase("error");
          return;
        }
        let status: string;
        try {
          const s = await fetch(`/api/handoff/${sessionId}`, { cache: "no-store" });
          if (s.status === 404) {
            setError("This code expired. Close and try again.");
            setPhase("error");
            return;
          }
          status = ((await s.json()) as { status: string }).status;
        } catch {
          continue; // transient network hiccup — keep polling
        }
        if (status === "ready") {
          const img = await fetch(`/api/handoff/${sessionId}/image`, { cache: "no-store" });
          if (!img.ok) {
            setError("Could not fetch the photo. Try sending it again.");
            setPhase("error");
            return;
          }
          const blob = await img.blob();
          const type = blob.type || "image/jpeg";
          const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
          onImage(new File([blob], `phone-photo.${ext}`, { type }));
          setPhase("received");
          setTimeout(() => close(), 700);
          return;
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setPhase("error");
    }
  }, [onImage, stop, close]);

  useEffect(() => () => stop(), [stop]);

  return (
    <>
      <button type="button" className="btn btn-ghost" onClick={() => void start()} disabled={open}>
        Scan with phone
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Upload from your phone"
          onClick={close}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--bg)",
              border: "1px solid var(--rule-strong)",
              padding: 28,
              maxWidth: 360,
              width: "100%",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 14,
            }}
          >
            <Mono brass>Upload from your phone</Mono>

            {phase === "received" ? (
              <>
                <span aria-hidden style={{ fontSize: 40, color: "var(--accent)" }}>✓</span>
                <p style={{ font: "400 18px/1.3 var(--serif)", margin: 0 }}>Photo received.</p>
              </>
            ) : phase === "error" ? (
              <>
                <p style={{ font: "400 17px/1.4 var(--serif)", color: "var(--fg-soft)", margin: 0 }}>{error}</p>
                <button type="button" className="btn" onClick={() => void start()}>Try again</button>
              </>
            ) : (
              <>
                <p style={{ font: "400 16px/1.45 var(--serif)", color: "var(--fg-soft)", margin: 0, maxWidth: "30ch" }}>
                  Scan this with your phone&apos;s camera, then choose a photo. It&apos;ll appear here.
                </p>
                {isLocalOrigin && (
                  <p
                    role="alert"
                    style={{
                      font: "500 12px/1.45 var(--sans, system-ui)",
                      color: "var(--terracotta)",
                      background: "rgba(var(--fg-rgb), .05)",
                      border: "1px solid var(--rule-strong)",
                      padding: "8px 10px",
                      margin: 0,
                      maxWidth: "32ch",
                    }}
                  >
                    Your phone can&apos;t reach <strong>localhost</strong>. Open this page on your computer using
                    its network address (e.g. <strong>http://192.168.x.x:3000</strong>), then scan again.
                  </p>
                )}
                <div style={{ width: 240, height: 240, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--rule)" }}>
                  {qr ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={qr} alt="QR code to upload from your phone" width={240} height={240} />
                  ) : (
                    <Mono>Generating…</Mono>
                  )}
                </div>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--fg-mute)" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)", animation: "hvpulse 1.2s ease-in-out infinite" }} />
                  <Mono>Waiting for your phone…</Mono>
                </span>
                <Mono>Phone must be on the same Wi-Fi</Mono>
              </>
            )}

            <button
              type="button"
              onClick={close}
              style={{ marginTop: 4, background: "transparent", border: "none", cursor: "pointer", color: "var(--fg-mute)", font: "400 11px/1 var(--mono)", letterSpacing: ".22em", textTransform: "uppercase" }}
            >
              {phase === "received" ? "Close" : "Cancel"}
            </button>
          </div>
          <style>{`@keyframes hvpulse { 0%,100%{opacity:.3} 50%{opacity:1} }`}</style>
        </div>
      )}
    </>
  );
}
