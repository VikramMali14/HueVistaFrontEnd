"use client";

import { useEffect, useRef, useState } from "react";
import { completeGoogleSignIn, completeGoogleSignInWithCode } from "@/lib/auth";

/**
 * Google OAuth landing page.
 *
 * The backend success handler redirects here with a SHORT-LIVED, SINGLE-USE
 * exchange code in the URL fragment (`#code=...`) — never the tokens, which
 * browser extensions and synced history could read. We trade the code for the
 * session via the `completeGoogleSignInWithCode` server action, which sets the
 * HttpOnly cookies and returns where to go; then we navigate there. The legacy
 * `#accessToken=...&refreshToken=...` shape is still accepted as a fallback so
 * a half-rolled deploy (old backend, new frontend) keeps signing people in.
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

    const code = pick("code");
    const accessToken = pick("accessToken");
    const refreshToken = pick("refreshToken");
    const expiresIn = Number(pick("expiresIn") ?? "0");
    const oauthError = pick("error");

    // Strip the code/tokens out of the address bar immediately (defense in depth).
    window.history.replaceState(null, "", window.location.pathname);

    if (oauthError || (!code && (!accessToken || !refreshToken))) {
      setFailed(true);
      return;
    }

    const complete = code
      ? completeGoogleSignInWithCode(code)
      : completeGoogleSignIn({ accessToken: accessToken!, refreshToken: refreshToken!, expiresIn });

    complete
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
