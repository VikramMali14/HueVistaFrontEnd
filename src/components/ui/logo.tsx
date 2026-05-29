import type { CSSProperties } from "react";

type LogoSize = "sm" | "md" | "lg" | "xl";

interface LogoProps {
  /** Whether to render the pill frame around the wordmark. Defaults to true. */
  framed?: boolean;
  /** Subtitle under the wordmark. Pass `false` to hide. Defaults to "AI SHADE VISUALISER". */
  subtitle?: string | false;
  /** Preset size — sm: nav-chip, md: footer, lg: header, xl: hero. Defaults to "md". */
  size?: LogoSize;
  /** Extra CSS class on the outer element. */
  className?: string;
  /** Inline style overrides on the outer element. Use this to lock the colour to a fixed value (e.g. ivory on a dark gradient panel). */
  style?: CSSProperties;
  /**
   * Accessible name. Defaults to "HueVista". When the logo is decorative (because
   * the page already has the wordmark elsewhere), pass `null` to make it aria-hidden.
   */
  ariaLabel?: string | null;
}

export function Logo({
  framed = true,
  subtitle = "AI SHADE VISUALISER",
  size = "md",
  className = "",
  style,
  ariaLabel = "HueVista",
}: LogoProps) {
  const ariaProps = ariaLabel === null ? { "aria-hidden": true } : { role: "img" as const, "aria-label": ariaLabel };
  return (
    <span
      {...ariaProps}
      className={`hv-logo hv-logo-${size} ${framed ? "is-framed" : ""} ${className}`.trim()}
      style={style}
    >
      <span className="hv-logo-inner">
        <span className="hv-logo-dot" aria-hidden />
        <span className="hv-logo-text">
          <span className="hv-logo-word">HueVista</span>
          {subtitle !== false && subtitle && (
            <>
              <span className="hv-logo-rule" aria-hidden />
              <span className="hv-logo-sub">{subtitle}</span>
            </>
          )}
        </span>
      </span>
    </span>
  );
}
