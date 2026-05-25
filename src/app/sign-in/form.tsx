"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

interface SignInFormProps {
  action: (formData: FormData) => Promise<{ error?: string } | void>;
  next: string;
}

export function SignInForm({ action, next }: SignInFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      style={{ display: "flex", flexDirection: "column", gap: 40, marginTop: 56 }}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          setError(null);
          const res = await action(fd);
          if (res && "error" in res && res.error) setError(res.error);
        });
      }}
      noValidate
    >
      <input type="hidden" name="next" value={next} />
      <div className="field">
        <label className="field-label" htmlFor="email">Shop email</label>
        <input id="email" name="email" type="email" placeholder="suresh@shardapaints.in" required autoComplete="email" />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="password">Passphrase</label>
        <input id="password" name="password" type="password" placeholder="••••••••••••" required minLength={8} autoComplete="current-password" />
      </div>
      <div style={{ display: "flex", gap: 16, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 10, font: "400 10px/1 var(--mono)", letterSpacing: ".26em", textTransform: "uppercase", color: "var(--ivory-soft)", cursor: "pointer" }}>
          <input type="checkbox" name="remember" defaultChecked style={{ accentColor: "var(--brass)" }} />
          Remember this counter
        </label>
      </div>
      {error && <div className="field-error" role="alert">{error}</div>}
      <Button type="submit" disabled={pending} style={{ justifyContent: "center" }}>
        {pending ? "Signing in…" : <>Sign in <span className="arr">→</span></>}
      </Button>
    </form>
  );
}
