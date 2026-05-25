interface MarqueeProps {
  items: ReadonlyArray<string>;
}

export function Marquee({ items }: MarqueeProps) {
  const doubled = [...items, ...items];
  return (
    <div className="marquee" aria-hidden="true">
      <div className="marquee-track">
        {doubled.map((item, i) => (
          <span key={i}>
            <span>{item}</span>
            <span className="dot" />
          </span>
        ))}
      </div>
    </div>
  );
}
