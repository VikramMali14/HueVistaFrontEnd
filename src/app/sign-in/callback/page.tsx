"use client";

import { useEffect, useRef, useState } from "react";
import { completeGoogleSignIn } from "@/lib/auth";

/**
 * Google OAuth landing page.
 *
 * The backend success handler redirects here with the tokens. They normally come
 * in the URL fragment (`#accessToken=...&refreshToken=...&expiresIn=...`) — which
 * never reaches the server — but some success handlers use the query string, so we
 * read both. We hand them to the `completeGoogleSignIn` server action, which sets
 * the HttpOnly session cookies and returns where to go; then we navigate there.
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
    const hashParams = new URLSearchParams(hash);
    const queryParams = new URLSearchParams(window.location.search);
    const pick = (key: string) => hashParams.get(key) ?? queryParams.get(key);

    const accessToken = pick("accessToken");
    const refreshToken = pick("refreshToken");
    const expiresIn = Number(pick("expiresIn") ?? "0");
    const oauthError = pick("error");

    // Strip the tokens out of the address bar immediately (defense in depth).
    window.history.replaceState(null, "", window.location.pathname);

    if (oauthError || !accessToken || !refreshToken) {
      setFailed(true);
      return;
    }

    completeGoogleSignIn({ accessToken, refreshToken, expiresIn })
      .then(({ next }) => {
        // Full navigation (not router.push): guarantees the freshly set session
        // cookies are sent and middleware re-runs for the destination, which may
        // be a protected route. replace() keeps this throwaway page out of history.
        window.location.replace(next);
      })
      .catch(() => setFailed(true));
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
