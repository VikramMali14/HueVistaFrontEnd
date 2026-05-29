import { Spinner } from "@/components/ui/spinner";

export default function RootLoading() {
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
        gap: 18,
        color: "var(--fg)",
        background: "var(--bg)",
      }}
    >
      <Spinner size={40} color="var(--accent)" />
      <span
        style={{
          font: "400 10.5px/1 var(--mono, ui-monospace, monospace)",
          letterSpacing: ".32em",
          textTransform: "uppercase",
          color: "var(--accent)",
        }}
      >
        Loading
      </span>
    </div>
  );
}
