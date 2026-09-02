/**
 * The HueVista arch mark, drawn inline so it stays crisp at nav and footer
 * sizes and costs no request.
 *
 * Two marks exist and they are not interchangeable. The painterly one
 * (`/brand/mark.png`) carries the real brushstroke, the H, the brush and the
 * sprig — it turns to mush below about 64px, so it is for hero, print and
 * social use only. This simplified sibling keeps the silhouette (arch),
 * the crescent stroke and the H, and stays readable down to 16px.
 *
 * The crescent and the H are painted in a colour rather than knocked out, so
 * the mark holds its contrast on the translucent nav bar in either theme
 * instead of letting the scrolling page show through the letter. That colour
 * is `--hv-mark-negative`, which callers override when the mark sits on
 * something other than the page background — `Logo`'s inverted plate sets it
 * to `--fg`. Left alone it falls back to the page background.
 */
export function BrandMark({ height = 22, className }: { height?: number; className?: string }) {
  const id = "hv-mark-grad";
  return (
    <svg
      className={className}
      viewBox="0 0 48 31"
      height={height}
      width={(height * 48) / 31}
      aria-hidden="true"
      focusable="false"
      style={{ display: "block", flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent-soft, #d6a66e)" />
          <stop offset="1" stopColor="var(--accent-deep, #9a6a33)" />
        </linearGradient>
      </defs>
      <path
        d="M0 24 A24 24 0 0 1 48 24 L48 27 A4 4 0 0 1 44 31 L4 31 A4 4 0 0 1 0 27 Z"
        fill={`url(#${id})`}
      />
      <path
        d="M14.6 6.4 A10.2 10.2 0 0 0 8.4 22.8 A19 19 0 0 1 14.6 6.4 Z"
        fill="var(--hv-mark-negative, var(--bg, #0a090f))"
        opacity=".85"
      />
      <path
        d="M16.6 9.2 H20.8 V14.4 H27.2 V9.2 H31.4 V22.4 H27.2 V17.6 H20.8 V22.4 H16.6 Z"
        fill="var(--hv-mark-negative, var(--bg, #0a090f))"
      />
    </svg>
  );
}
