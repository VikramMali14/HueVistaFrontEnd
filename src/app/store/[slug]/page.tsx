import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HttpError, storeServerApi } from "@/lib/api";
import { hasGuestSession } from "@/lib/auth";
import type { StorePublicInfo } from "@/lib/types";
import { StoreKiosk } from "./store-kiosk";

export const metadata: Metadata = {
  title: "In-store studio",
  description: "Pay once, upload your room, pick your colours — right here in the shop.",
  robots: { index: false }, // each shop shares its own URL; don't index kiosks
};

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * PUBLIC kiosk page — the retailer prints/shares this URL and walk-in customers
 * order like at a fast-food kiosk or a metro ticket machine: pay the shop's
 * price, upload one room photo, pick colours in the studio, and keep the pickup
 * code. The SHOP redeems the chosen shades from that code at the counter — the
 * customer never sees shade codes.
 */
export default async function StoreKioskPage({ params }: Props) {
  const { slug } = await params;
  let info: StorePublicInfo;
  try {
    info = await storeServerApi.info(slug);
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) notFound();
    throw err;
  }
  // A customer who already paid (guest cookie still valid) can jump straight back in.
  const hasSession = await hasGuestSession();
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "64px var(--gutter) 120px" }}>
      <StoreKiosk info={info} hasGuestSession={hasSession} />
    </main>
  );
}
