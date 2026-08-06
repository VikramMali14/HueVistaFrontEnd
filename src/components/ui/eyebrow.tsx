import type { CSSProperties, ReactNode } from "react";

interface BaseProps {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}

export function Eyebrow({ children, style, className }: BaseProps) {
  return <span className={`eyebrow${className ? " " + className : ""}`} style={style}>{children}</span>;
}
export function Mono({ children, style, brass, className }: BaseProps & { brass?: boolean }) {
  return <span className={`mono${brass ? " brass" : ""}${className ? " " + className : ""}`} style={style}>{children}</span>;
}
/**
 * A system message — a count, an empty state, a hint, a status.
 *
 * These used to go through <Mono>, which is letter-spaced uppercase monospace.
 * That treatment is a label style: it works on two or three words and turns a
 * sentence into texture. "SHOWING 60 OF 10062" and "NOTHING MATCHES 'ZZZQQ'"
 * were information the shopkeeper had to decode rather than read. Sentence
 * case, normal spacing, and a size meant for reading.
 */
export function Note({ children, style, className }: BaseProps) {
  return <span className={`note${className ? " " + className : ""}`} style={style}>{children}</span>;
}
export function Lead({ children, style, className }: BaseProps) {
  return <p className={`lead${className ? " " + className : ""}`} style={style}>{children}</p>;
}
export function Small({ children, style, className }: BaseProps) {
  return <span className={`small${className ? " " + className : ""}`} style={style}>{children}</span>;
}
export function Roman({ children, style, className }: BaseProps) {
  return <span className={`roman${className ? " " + className : ""}`} style={style}>{children}</span>;
}
