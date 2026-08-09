"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, HttpError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Mono } from "@/components/ui/eyebrow";
import { Spinner } from "@/components/ui/spinner";

/**
 * "Open this in my own projects", for a signed-in viewer of someone else's room.
 *
 * The room is already photographed, cleaned and masked, so nothing here runs the
 * AI pipeline — the backend copies the files and the walls across. What it costs
 * is one project, the same unit as any other room, because what the viewer gets
 * is the same thing: a room of their own to repaint and keep.
 *
 * The price is stated on the button rather than discovered afterwards, and the
 * confirmation step exists because a project is not refundable once spent.
 */
export function ClaimSharedRoom({ token }: { token: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function claim() {
    setBusy(true);
    setError(null);
    try {
      const project = await api.claimSharedProject(token);
      // Full navigation: the studio loads the new project fresh, and this page was
      // server-rendered for an anonymous reader.
      window.location.href = `/studio?project=${encodeURIComponent(project.id)}`;
    } catch (e) {
      if (e instanceof HttpError && e.status === 402) {
        // Out of projects. Their own plan page is the answer, not a retry.
        setError(e.message || "You have no projects left this month.");
      } else if (e instanceof HttpError && e.status === 404) {
        setError("This link has expired, so there is nothing to copy.");
      } else {
        setError(e instanceof Error ? e.message : "Could not copy this room. Please try again.");
      }
      setBusy(false);
      setConfirming(false);
      router.refresh();
    }
  }

  return (
    <div>
      <Mono brass style={{ display: "block", marginBottom: 12 }}>Make it yours</Mono>
      <p style={{ font: "400 19px/1.45 var(--serif)", color: "var(--fg)", margin: "0 0 18px", maxWidth: "36ch" }}>
        Copy this room into your own projects — the photo and every wall come with it — and
        repaint it whenever you like.
      </p>

      {confirming ? (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <Button variant="brass" onClick={() => void claim()} disabled={busy}>
            {busy ? <><Spinner size={14} color="currentColor" /> Copying…</> : <>Yes, use 1 project</>}
          </Button>
          {!busy && (
            <Button variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
          )}
        </div>
      ) : (
        <Button variant="brass" onClick={() => setConfirming(true)}>
          See it in your projects · 1 project <span className="arr">→</span>
        </Button>
      )}

      {error && (
        <p className="field-error" role="alert" style={{ marginTop: 14, maxWidth: "40ch" }}>{error}</p>
      )}
    </div>
  );
}
