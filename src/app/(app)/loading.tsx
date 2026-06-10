import { Spinner } from "@/components/ui/spinner";

export default function AppLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        color: "var(--fg)",
      }}
    >
      <Spinner size={32} color="var(--accent)" />
      <span
        style={{
          font: "400 10px/1 var(--mono, ui-monospace, monospace)",
          letterSpacing: ".3em",
          textTransform: "uppercase",
          color: "var(--accent)",
        }}
      >
        Loading…
      </span>
    </div>
  );
}
