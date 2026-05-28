export function ClassicAtelierHeader() {
  return (
    <div className="ctopbar">
      <h1>Visualiser</h1>
      <span style={{ color: "var(--fg-mute)", fontSize: 13 }}>WebGL · 60 fps</span>
      <div className="grow" />
      <span style={{ font: "500 13px/1 var(--sans)", color: "var(--fg-mute)" }}>4 / 60 renders this month</span>
    </div>
  );
}
