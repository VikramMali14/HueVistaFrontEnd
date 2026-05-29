"use client";

import { useFormStatus } from "react-dom";
import type { CSSProperties } from "react";
import { logoutAction } from "@/lib/auth";
import { Spinner } from "@/components/ui/spinner";

interface LogoutButtonProps {
  label?: string;
  className?: string;
  style?: CSSProperties;
}

export function LogoutButton({ label = "Sign out", className, style }: LogoutButtonProps) {
  return (
    <form action={logoutAction} style={{ display: "inline-flex" }}>
      <LogoutSubmit label={label} className={className} style={style} />
    </form>
  );
}

function LogoutSubmit({
  label,
  className,
  style,
}: {
  label: string;
  className?: string;
  style?: CSSProperties;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      aria-label={pending ? "Signing out" : label}
      title={label}
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        background: "transparent",
        border: className ? undefined : "1px solid var(--rule-strong)",
        borderRadius: className ? undefined : 6,
        padding: className ? undefined : "6px 12px",
        cursor: pending ? "wait" : "pointer",
        color: "var(--fg-soft)",
        font: className ? undefined : "500 12px/1 var(--sans)",
        opacity: pending ? 0.7 : 1,
        ...style,
      }}
    >
      {pending && <Spinner size={12} color="currentColor" />}
      <span>{pending ? "Signing out…" : label}</span>
    </button>
  );
}
