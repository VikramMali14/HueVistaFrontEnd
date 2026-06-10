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
        gap: 22,
        color: "var(--fg)",
        background: "var(--bg)",
      }}
    >
      <span className="hv-mix" aria-hidden style={{ transform: "scale(1.75)", transformOrigin: "center" }}>
        <i style={{ background: "#b96b48" }} />
        <i style={{ background: "#7b8a72" }} />
        <i style={{ background: "#8c98a8" }} />
      </span>
      <span
        style={{
          font: "400 10.5px/1 var(--mono, ui-monospace, monospace)",
          letterSpacing: ".32em",
          textTransform: "uppercase",
          color: "var(--accent)",
        }}
      >
        Mixing
      </span>
    </div>
  );
}
