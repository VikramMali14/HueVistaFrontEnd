"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Mono } from "@/components/ui/eyebrow";

/**
 * Direct link to the Android build, inlined at build time. Blank — the default —
 * means "no APK published yet", and every affordance below renders nothing
 * rather than offering a download that 404s.
 */
export const APK_URL = (process.env.NEXT_PUBLIC_APK_URL ?? "").trim();

/** Optional label beside the download, e.g. "0.1.0". */
const APK_VERSION = (process.env.NEXT_PUBLIC_APK_VERSION ?? "").trim();

/** Whether there is an Android build to offer at all. */
export const hasApk = APK_URL.length > 0;

const DISMISS_KEY = "hv-apk-dismissed";

/**
 * Routes that keep the banner off. `/m/` is the phone hand-off — a single-purpose
 * upload screen reached by scanning a QR from a desktop, where a bar pinned to the
 * bottom sits on the one button that page exists for. Everything under the signed-in
 * app is excluded too: it already floats a support button in that corner, and someone
 * mid-project does not need to be sold the thing they are currently using.
 */
const HIDDEN_PREFIXES = [
  "/m/",
  "/dashboard",
  "/studio",
  "/account",
  "/admin",
  "/network",
  "/inbox",
  "/portal",
  "/products",
  "/assigned-products",
  "/colour-finder",
  "/plan",
];

/** iPadOS 13+ reports itself as a Mac, so touch support is what separates them. */
function isApple(ua: string): boolean {
  if (/iPhone|iPod|iPad/i.test(ua)) return true;
  return /Macintosh/i.test(ua) && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1;
}

/**
 * "Get the Android app" bar, pinned to the bottom on phone-width screens only.
 *
 * Visibility is decided in CSS (`display: none` above the mobile breakpoint) rather
 * than by measuring the window, so resizing into and out of mobile view — including
 * a desktop browser's device toolbar — is handled by the browser and there is no
 * server/client mismatch to hydrate around.
 *
 * It does not render on iOS: an APK cannot be installed there, and an offer that
 * ends in "this file can't be opened" is worse than no offer.
 */
export function AppDownloadBanner() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);

  // Reading localStorage and the user agent has to wait for the client, so the
  // banner mounts after hydration rather than being rendered on the server.
  useEffect(() => {
    if (!hasApk) return;
    if (isApple(navigator.userAgent)) return;
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      // Private mode / storage blocked — treat it as "not dismissed" and show.
    }
    setShow(!dismissed);
  }, []);

  const dismiss = () => {
    setShow(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Nothing to do: it stays dismissed for this page view either way.
    }
  };

  if (!show) return null;
  if (HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) return null;

  return (
    <aside className="hv-apk" aria-label="Download the Android app">
      <span className="hv-apk-icon" aria-hidden>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="6" y="2" width="12" height="20" rx="2.5" />
          <path d="M11 18.5h2" />
        </svg>
      </span>

      <span className="hv-apk-text">
        <strong>HueVista for Android</strong>
        <Mono>{APK_VERSION ? `APK · v${APK_VERSION}` : "Direct APK download"}</Mono>
      </span>

      <a className="hv-apk-get" href={APK_URL} download rel="noopener">
        Download
      </a>

      <button type="button" className="hv-apk-close" onClick={dismiss} aria-label="Dismiss the app download">
        ✕
      </button>
    </aside>
  );
}
