"use client";

import { useEffect, useRef, useState } from "react";
import { completeGoogleSignIn } from "@/lib/auth";

/**
 * Google OAuth landing page.
 *
 * The backend success handler redirects here with the tokens in the URL fragment
 * (`#accessToken=...&refreshToken=...&expiresIn=...`). Fragments never reach the
 * server, so we read them client-side and hand them to the `completeGoogleSignIn`
 * server action, which sets the HttpOnly session cookies and redirects into the app.
 */
export default function GoogleCallbackPage() {
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // guard against React StrictMode double-invoke
    started.current = true;

    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : "";
    const params = new URLSearchParams(hash);
    const accessToken = params.get("accessToken");
    const refreshToken = params.get("refreshToken");
    const expiresIn = Number(params.get("expiresIn") ?? "0");

    // Strip the tokens out of the address bar immediately (defense in depth).
    window.history.replaceState(null, "", window.location.pathname);

    if (!accessToken || !refreshToken) {
      setFailed(true);
      return;
    }

    completeGoogleSignIn({ accessToken, refreshToken, expiresIn }).catch(() =>
      setFailed(true),
    );
  }, []);

  return (
    <main
      style={{
        display: "flex",
        minHeight: "60vh",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "2rem",
      }}
    >
      {failed ? (
        <p>
          Sign-in failed. <a href="/sign-in">Return to sign in</a>.
        </p>
      ) : (
        <p>Signing you in…</p>
      )}
    </main>
  );
}
