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
      <span className="hv-mix" aria-hidden>
        <i style={{ background: "#b96b48", width: 10, height: 10 }} />
        <i style={{ background: "#7b8a72", width: 10, height: 10 }} />
        <i style={{ background: "#8c98a8", width: 10, height: 10 }} />
      </span>
      <span
        style={{
          font: "400 10px/1 var(--mono, ui-monospace, monospace)",
          letterSpacing: ".3em",
          textTransform: "uppercase",
          color: "var(--accent)",
        }}
      >
        Mixing
      </span>
    </div>
  );
}
