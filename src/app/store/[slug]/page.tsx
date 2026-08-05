import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HttpError, storeServerApi } from "@/lib/api";
import { hasGuestSession } from "@/lib/auth";
import type { StorePublicInfo } from "@/lib/types";
import { Footer } from "@/components/layout/footer";
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
    <>
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "64px var(--gutter) 120px" }}>
        <StoreKiosk info={info} hasGuestSession={hasSession} />
      </main>
      {/* The one page on this site where a member of the public — no account, nobody at
          the counter to ask — hands over money. It carried no merchant identity and no
          policy links at all: whose business is taking this payment, what the refund terms
          are, how to reach a human. The footer is where all of that already lives, so it
          belongs here more than on any other page.

          Deliberately the footer and NOT SiteHeader: a kiosk should not offer a walk-in
          customer a navigation bar to wander off into mid-purchase. */}
      <Footer />
    </>
  );
}
