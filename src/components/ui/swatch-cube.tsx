import type { CSSProperties } from "react";

const FACE_TONES = ["#b96b48", "#7b8a72", "#3e4a52", "#c9a17a", "#7a3a2f", "var(--ivory)"];

/**
 * A slow-spinning 3D cube of paint faces — pure CSS 3D, decorative.
 * Honours reduced-motion (settles to a static angle) via globals.css.
 */
export function SwatchCube({ size = 112, className = "" }: { size?: number; className?: string }) {
  const half = size / 2;
  const faces: CSSProperties[] = [
    { transform: `rotateY(0deg) translateZ(${half}px)` },
    { transform: `rotateY(90deg) translateZ(${half}px)` },
    { transform: `rotateY(180deg) translateZ(${half}px)` },
    { transform: `rotateY(-90deg) translateZ(${half}px)` },
    { transform: `rotateX(90deg) translateZ(${half}px)` },
    { transform: `rotateX(-90deg) translateZ(${half}px)` },
  ];
  return (
    <div className={`hv-cube ${className}`.trim()} style={{ width: size, height: size }} aria-hidden>
      <div className="hv-cube-inner" style={{ width: size, height: size }}>
        {faces.map((f, i) => (
          <span key={i} className="hv-cube-face" style={{ ...f, background: FACE_TONES[i] }} />
        ))}
      </div>
    </div>
  );
}
