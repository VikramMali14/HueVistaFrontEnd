"use client";

import { useState } from "react";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api, HttpError } from "@/lib/api";

export function RedeemForm() {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "redeeming" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [validDays, setValidDays] = useState<number | null>(null);

  async function redeem() {
    const value = code.trim();
    if (!value) return;
    setStatus("redeeming");
    setError(null);
    try {
      const res = await api.redeemAccessCode({ code: value });
      setValidDays(res.validDays ?? null);
      setStatus("done");
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) {
        window.location.href = "/sign-in?next=/redeem";
        return;
      }
      setError(e instanceof Error ? e.message : "Could not redeem that code.");
      setStatus("idle");
    }
  }

  if (status === "done") {
    return (
      <div style={{ textAlign: "center", padding: "40px 0" }}>
        <span aria-hidden style={{ fontSize: 44, color: "var(--accent)" }}>✓</span>
        <h1 className="display" style={{ fontSize: "clamp(40px, 5vw, 64px)", margin: "12px 0 16px" }}>
          You&apos;re all set.
        </h1>
        <Lead style={{ maxWidth: "44ch", margin: "0 auto 28px" }}>
          Your account is now a customer of this shop{validDays ? `, with ${validDays}-day access and one project included` : ""}.
          Upload a room photo and start visualising — you pick colours by feel.
        </Lead>
        {/* Full reload so the app re-renders with the new CUSTOMER role. */}
        <a className="btn btn-brass" href="/atelier">Open the studio <span className="arr">→</span></a>
      </div>
    );
  }

  return (
    <div>
      <header style={{ marginBottom: 32 }}>
        <Eyebrow>Redeem · access code</Eyebrow>
        <h1 className="display" style={{ fontSize: "clamp(40px, 5vw, 72px)", marginTop: 12 }}>
          Have a code from<br /><i>your paint shop?</i>
        </h1>
        <Lead style={{ marginTop: 20, maxWidth: "48ch" }}>
          Enter it below to unlock your project. Your shop issues these from their counter.
        </Lead>
      </header>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", maxWidth: 460 }}>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && void redeem()}
          placeholder="e.g. 7K2NQ9PX"
          aria-label="Access code"
          spellCheck={false}
          style={{
            flex: 1,
            minWidth: 200,
            padding: "12px 14px",
            border: "1px solid var(--rule-strong)",
            background: "var(--surface)",
            color: "var(--fg)",
            fontFamily: "var(--mono)",
            letterSpacing: ".18em",
            fontSize: 16,
          }}
        />
        <Button onClick={() => void redeem()} disabled={status === "redeeming" || !code.trim()}>
          {status === "redeeming" ? <><Spinner size={14} color="currentColor" /> Redeeming…</> : <>Redeem <span className="arr">→</span></>}
        </Button>
      </div>

      {error && <div className="field-error" role="alert" style={{ marginTop: 16 }}>{error}</div>}

      <p style={{ font: "400 14px/1.5 var(--serif)", color: "var(--fg-mute)", marginTop: 20, maxWidth: "48ch" }}>
        Redeeming switches this account to a customer of the issuing shop — one project, valid for the
        code&apos;s window. Retailers don&apos;t need a code.
      </p>
    </div>
  );
}
