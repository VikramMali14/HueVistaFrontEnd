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
export function Lead({ children, style, className }: BaseProps) {
  return <p className={`lead${className ? " " + className : ""}`} style={style}>{children}</p>;
}
export function Small({ children, style, className }: BaseProps) {
  return <span className={`small${className ? " " + className : ""}`} style={style}>{children}</span>;
}
export function Roman({ children, style, className }: BaseProps) {
  return <span className={`roman${className ? " " + className : ""}`} style={style}>{children}</span>;
}
