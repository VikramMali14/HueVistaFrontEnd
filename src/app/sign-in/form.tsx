"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GoogleButton } from "@/components/auth/google-button";

interface SignInFormProps {
  action: (formData: FormData) => Promise<{ error?: string } | void>;
  next: string;
}

export function SignInForm({ action, next }: SignInFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form
      style={{ display: "flex", flexDirection: "column", gap: 28, marginTop: 48 }}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          setError(null);
          try {
            const res = await action(fd);
            if (res && "error" in res && res.error) setError(res.error);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not sign in.");
          }
        });
      }}
      noValidate
      aria-busy={pending}
    >
      <input type="hidden" name="next" value={next} />

      <GoogleButton next={next} />

      <div
        aria-hidden
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          color: "var(--fg-mute)",
          font: "400 10px/1 var(--mono)",
          letterSpacing: ".24em",
          textTransform: "uppercase",
        }}
      >
        <span style={{ flex: 1, height: 1, background: "var(--rule)" }} />
        or use your email
        <span style={{ flex: 1, height: 1, background: "var(--rule)" }} />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          placeholder="suresh@shardapaints.in"
          required
          autoComplete="email"
          inputMode="email"
          aria-invalid={error ? "true" : undefined}
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="password">
          Password
        </label>
        <div style={{ position: "relative" }}>
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            placeholder="••••••••••••"
            required
            minLength={8}
            autoComplete="current-password"
            aria-invalid={error ? "true" : undefined}
            style={{ paddingRight: 56 }}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-pressed={showPassword}
            aria-controls="password"
            aria-label={showPassword ? "Hide password" : "Show password"}
            style={{
              position: "absolute",
              right: 0,
              bottom: 8,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--fg-mute)",
              font: "400 10px/1 var(--mono)",
              letterSpacing: ".22em",
              textTransform: "uppercase",
            }}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          gap: 16,
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
        }}
      >
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            font: "400 10px/1 var(--mono)",
            letterSpacing: ".22em",
            textTransform: "uppercase",
            color: "var(--fg-soft)",
            cursor: "pointer",
          }}
        >
          <input type="checkbox" name="remember" defaultChecked style={{ accentColor: "var(--accent)" }} />
          Remember me
        </label>
        <Link
          href="/sign-in/forgot"
          style={{
            font: "400 15px/1 var(--serif)",
            color: "var(--accent-soft)",
            borderBottom: "1px solid var(--rule-brass)",
            paddingBottom: 2,
          }}
        >
          Forgot password?
        </Link>
      </div>
      {error && (
        <div className="field-error" role="alert" aria-live="assertive">
          {error}
        </div>
      )}
      <Button type="submit" disabled={pending} style={{ justifyContent: "center" }}>
        {pending ? (
          <>
            <span className="hv-mix" aria-hidden>
              <i style={{ background: "#b96b48" }} />
              <i style={{ background: "#7b8a72" }} />
              <i style={{ background: "#8c98a8" }} />
            </span>
            <span>Mixing your colours…</span>
          </>
        ) : (
          <>
            Sign in <span className="arr">→</span>
          </>
        )}
      </Button>
    </form>
  );
}
