"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { createPainterAction } from "@/lib/auth";

/**
 * Retailer-side painter creation: provisions a PAINTER account already linked
 * to the shop. The invitation-code flow (customer portal) still exists for
 * painters who sign themselves up.
 */
export function CreatePainterForm() {
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        if (!e.currentTarget.reportValidity()) return;
        const fd = new FormData(e.currentTarget);
        const painter = String(fd.get("name") ?? "");
        startTransition(async () => {
          setError(null);
          setCreated(null);
          const res = await createPainterAction(fd);
          if (res.error) setError(res.error);
          else {
            setCreated(painter);
            formRef.current?.reset();
            router.refresh(); // re-fetch the server-rendered network report below
          }
        });
      }}
      noValidate
      aria-busy={pending}
      style={{ marginTop: 40 }}
    >
      <div className="cp-grid">
        <Field label="Painter name" name="name" required placeholder="Santosh Pawar" autoComplete="off" />
        <Field label="Email" name="email" type="email" required placeholder="santosh.pawar@gmail.com" autoComplete="off" />
        <div className="field">
          <label className="field-label" htmlFor="cp-password">Initial password</label>
          <div style={{ position: "relative" }}>
            <input id="cp-password" name="password" type={showPw ? "text" : "password"} required minLength={8}
              placeholder="At least eight characters" autoComplete="new-password" style={{ paddingRight: 56 }} />
            <button type="button" onClick={() => setShowPw((v) => !v)} aria-pressed={showPw}
              aria-label={showPw ? "Hide password" : "Show password"}
              style={{ position: "absolute", right: 0, bottom: 8, background: "transparent", border: "none", cursor: "pointer", color: "var(--fg-mute)", font: "400 10px/1 var(--mono)", letterSpacing: ".22em", textTransform: "uppercase" }}>
              {showPw ? "Hide" : "Show"}
            </button>
          </div>
        </div>
        <Field label="Phone · WhatsApp" name="phone" type="tel" placeholder="+91 91 5688 3402" autoComplete="off" />
      </div>

      {created && (
        <div role="status" style={{ marginTop: 24, padding: "14px 16px", border: "1px solid var(--sage)", color: "var(--fg)", font: "400 15px/1.5 var(--sans)", borderRadius: "var(--radius)" }}>
          ✓ Painter account created for <strong>{created}</strong> and linked to your shop. Hand them
          the password you set — they can change it after signing in.
        </div>
      )}
      {error && <div className="field-error" role="alert" aria-live="assertive" style={{ marginTop: 24 }}>{error}</div>}

      <Button type="submit" variant="brass" disabled={pending} style={{ marginTop: 32 }}>
        {pending ? <><Spinner size={14} color="currentColor" decorative /> Creating…</> : <>Create painter account <span className="arr">→</span></>}
      </Button>

      <style>{`
        .cp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
        @media (max-width: 720px) { .cp-grid { grid-template-columns: 1fr; } }
      `}</style>
    </form>
  );
}

function Field({ label, name, type = "text", required, placeholder, autoComplete }: {
  label: string; name: string; type?: string; required?: boolean; placeholder?: string; autoComplete?: string;
}) {
  const id = `cp-${name}`;
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      <input id={id} name={name} type={type} required={required} placeholder={placeholder} autoComplete={autoComplete} />
    </div>
  );
}
