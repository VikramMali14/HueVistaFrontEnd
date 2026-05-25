import type { CSSProperties, ReactNode } from "react";

export function Eyebrow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <span className="eyebrow" style={style}>{children}</span>;
}
export function Mono({ children, style, brass }: { children: ReactNode; style?: CSSProperties; brass?: boolean }) {
  return <span className={`mono${brass ? " brass" : ""}`} style={style}>{children}</span>;
}
export function Lead({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <p className="lead" style={style}>{children}</p>;
}
export function Small({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <span className="small" style={style}>{children}</span>;
}
export function Roman({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <span className="roman" style={style}>{children}</span>;
}
