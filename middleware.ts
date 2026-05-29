import { NextRequest, NextResponse } from "next/server";

const PROTECTED_PREFIXES = ["/atelier", "/dashboard", "/portal"];
const SESSION_COOKIE = "hv_refresh";

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // BFF gate — anything under /bff/* is an authenticated proxy.
  // Without a session cookie, fail fast with 401 instead of issuing a
  // redirect (the caller is fetch(), not the user).
  if (pathname.startsWith("/bff/")) {
    const refresh = req.cookies.get(SESSION_COOKIE)?.value;
    if (!refresh) {
      return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.next();
  }

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (isProtected) {
    const refresh = req.cookies.get(SESSION_COOKIE)?.value;
    if (!refresh) {
      const url = req.nextUrl.clone();
      url.pathname = "/sign-in";
      url.searchParams.set("next", pathname + search);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/atelier/:path*",
    "/dashboard/:path*",
    "/portal/:path*",
    "/bff/:path*",
  ],
};
