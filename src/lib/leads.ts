"use server";

import { headers } from "next/headers";
import { HttpError, leadApi } from "./api";
import type { ShopRequestStatus } from "./api";
import { clientIpFromHeaders } from "./client-ip";

type StepResult = { status?: ShopRequestStatus; error?: string };

/**
 * Real visitor IP so the backend's per-IP limiters bucket by the actual client
 * rather than by the frontend server (mirrors login/register).
 */
async function visitorIp(): Promise<string | undefined> {
  return clientIpFromHeaders(await headers());
}

/** Turn a backend failure into one sentence a shop owner can act on. */
function readable(err: unknown, fallback: string): string {
  if (err instanceof HttpError) {
    // 409 carries the "you already have an account / a request" explanations,
    // and 429 the rate-limit message. Both are written for the shop, so they
    // are shown as-is rather than replaced with something vaguer.
    if (err.fieldErrors) {
      const first = Object.values(err.fieldErrors)[0];
      if (first) return first;
    }
    return err.message;
  }
  return fallback;
}

/**
 * Step one of the public "request a shop account" form: store the request and
 * email a 6-digit code. No account and no session is created here — the request
 * is not even visible to an admin until the code is confirmed.
 *
 * The password travels once, over HTTPS, straight to the backend, which hashes
 * it on arrival. It is not stored in a cookie, a session or this server's memory.
 */
export async function requestShopAccountAction(formData: FormData): Promise<StepResult> {
  const str = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v || undefined;
  };
  const name = str("name");
  const email = str("email")?.toLowerCase();
  const shopName = str("shopName");
  // Not trimmed: a password's leading or trailing space is part of it.
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!name) return { error: "Please tell us your name." };
  if (!email) return { error: "Please enter your email." };
  if (!shopName) return { error: "Please tell us your shop's name." };
  if (password.length < 8) return { error: "Choose a password of at least eight characters." };
  if (password !== confirmPassword) {
    return { error: "The two passwords don't match. Type the same one twice." };
  }

  try {
    const status = await leadApi.submitShopLead(
      {
        name,
        email,
        phone: str("phone"),
        shopName,
        city: str("city"),
        state: str("state"),
        password,
        confirmPassword,
        notes: str("notes"),
      },
      await visitorIp(),
    );
    return { status };
  } catch (err) {
    return { error: readable(err, "Could not send your request. Please try again.") };
  }
}

/**
 * Step two: confirm the emailed code. On success the request joins the admin
 * queue and starts its 24-hour clock — an account follows either way.
 */
export async function verifyShopRequestAction(
  requestId: string,
  code: string,
): Promise<StepResult> {
  if (!requestId) return { error: "Start the form again — we lost track of your request." };
  if (!code.trim()) return { error: "Enter the 6-digit code we emailed you." };
  try {
    return { status: await leadApi.verifyShopRequest(requestId, code.trim(), await visitorIp()) };
  } catch (err) {
    return { error: readable(err, "Could not check that code. Please try again.") };
  }
}

/** Send another code. The backend enforces a 60-second cooldown. */
export async function resendShopRequestCodeAction(requestId: string): Promise<StepResult> {
  if (!requestId) return { error: "Start the form again — we lost track of your request." };
  try {
    return { status: await leadApi.resendShopRequestCode(requestId, await visitorIp()) };
  } catch (err) {
    return { error: readable(err, "Could not send another code. Please try again.") };
  }
}
