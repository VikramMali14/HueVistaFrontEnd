"use server";

import { headers } from "next/headers";
import { HttpError, newsletterApi } from "./api";
import { clientIpFromHeaders } from "./client-ip";

/**
 * Join the monthly letter.
 *
 * The journal form used to be theatre: it flipped to "Thank you ✓" in React state and
 * discarded the address, so nobody who ever pressed Subscribe was subscribed to
 * anything. This puts the address on the real list and gets the welcome mail sent.
 *
 * The real visitor IP is forwarded so the backend's per-IP limiter buckets by the
 * person signing up rather than by this Next server — otherwise one frontend host looks
 * like every reader at once and the first ten signups of the hour lock out the rest.
 */
export async function joinNewsletterAction(
  email: string,
  source = "journal",
): Promise<{ ok?: true; error?: string }> {
  const address = email.trim();
  if (!address) return { error: "Enter your email address." };

  const hdrs = await headers();
  const clientIp = clientIpFromHeaders(hdrs);

  try {
    await newsletterApi.subscribe(address, source, clientIp);
    return { ok: true };
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.fieldErrors) {
        const first = Object.values(err.fieldErrors)[0];
        if (first) return { error: first };
      }
      return { error: err.message };
    }
    return { error: "Could not sign you up just now. Please try again." };
  }
}

/**
 * Leave the list, using the token from the unsubscribe link. No session involved —
 * the token authorises removing exactly the address it belongs to and nothing else.
 */
export async function leaveNewsletterAction(
  token: string,
): Promise<{ ok?: true; error?: string }> {
  if (!token.trim()) return { error: "That unsubscribe link is missing its token." };

  const hdrs = await headers();
  const clientIp = clientIpFromHeaders(hdrs);

  try {
    await newsletterApi.unsubscribe(token.trim(), clientIp);
    return { ok: true };
  } catch (err) {
    if (err instanceof HttpError) return { error: err.message };
    return { error: "Could not unsubscribe you just now. Please try again." };
  }
}
