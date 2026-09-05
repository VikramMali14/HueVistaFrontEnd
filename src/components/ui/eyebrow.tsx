import type { CSSProperties, ReactNode } from "react";

interface BaseProps {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}

export function Eyebrow({ children, style, className }: BaseProps) {
  return <span className={`eyebrow${className ? " " + className : ""}`} style={style}>{children}</span>;
}
/**
 * A label in the mono face: letter-spaced small capitals.
 *
 * @param literal keeps the text's own case. The uppercasing is a label treatment,
 * and it is wrong for anything the reader is meant to copy or type back — a web
 * address most of all. "APP.HUEVISTA.ORG/UNLOCK" is not the address: a path is
 * case-sensitive, so a shop reading that one off the screen to a customer is
 * reading out something that need not work.
 */
export function Mono({ children, style, brass, literal, className }: BaseProps & { brass?: boolean; literal?: boolean }) {
  return (
    <span
      className={`mono${brass ? " brass" : ""}${literal ? " literal" : ""}${className ? " " + className : ""}`}
      style={style}
    >
      {children}
    </span>
  );
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
