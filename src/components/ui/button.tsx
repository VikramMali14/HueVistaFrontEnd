import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";

type Variant = "primary" | "ghost" | "brass";
type Size = "sm" | "md" | "lg";

interface CommonProps {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

function classes(variant: Variant = "primary", size: Size = "md") {
  return [
    "btn",
    variant === "ghost" && "btn-ghost",
    variant === "brass" && "btn-brass",
    size === "sm" && "btn-sm",
    size === "lg" && "btn-lg",
  ].filter(Boolean).join(" ");
}

export function Button({ variant, size, children, ...rest }: CommonProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={classes(variant, size)} {...rest}>{children}</button>;
}

interface LinkButtonProps extends CommonProps, Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children"> {
  href: string;
  external?: boolean;
}

export function LinkButton({ href, variant, size, children, external, ...rest }: LinkButtonProps) {
  if (external) {
    return (
      <a className={classes(variant, size)} href={href} rel="noopener noreferrer" target="_blank" {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link className={classes(variant, size)} href={href} {...rest}>
      {children}
    </Link>
  );
}
