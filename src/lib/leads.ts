"use server";

import { headers } from "next/headers";
import { HttpError, leadApi } from "./api";

/**
 * Submits the public "request a shop account" form. No account or session is
 * created — the lead lands in the admin queue and the shop gets a call back.
 */
export async function requestShopAccountAction(
  formData: FormData,
): Promise<{ ok?: true; error?: string }> {
  const str = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v || undefined;
  };
  const name = str("name");
  const email = str("email")?.toLowerCase();
  const shopName = str("shopName");
  if (!name) return { error: "Please tell us your name." };
  if (!email) return { error: "Please enter your email." };
  if (!shopName) return { error: "Please tell us your shop's name." };

  // Real visitor IP so the backend's per-IP lead limiter buckets by the actual
  // client, not the frontend server (mirrors login/register).
  const hdrs = await headers();
  const clientIp =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    hdrs.get("x-real-ip")?.trim() ||
    undefined;

  try {
    await leadApi.submitShopLead(
      {
        name,
        email,
        phone: str("phone"),
        shopName,
        city: str("city"),
        state: str("state"),
        tier: str("tier"),
        notes: str("notes"),
      },
      clientIp,
    );
    return { ok: true };
  } catch (err) {
    if (err instanceof HttpError) {
      if (err.status === 429) return { error: err.message };
      if (err.fieldErrors) {
        const first = Object.values(err.fieldErrors)[0];
        if (first) return { error: first };
      }
      return { error: err.message };
    }
    return { error: "Could not send your request. Please try again." };
  }
}
