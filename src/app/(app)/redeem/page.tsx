import type { Metadata } from "next";
import { RedeemForm } from "./redeem-form";

export const metadata: Metadata = {
  title: "Redeem a code",
  description: "Enter the access code from your paint shop to unlock your project.",
};

export default function RedeemPage() {
  // Auth is enforced by the (app) layout (requireAccessToken) + middleware refresh.
  return (
    <div style={{ maxWidth: 620, margin: "0 auto" }}>
      <RedeemForm />
    </div>
  );
}
