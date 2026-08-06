import type { Metadata } from "next";
import Link from "next/link";
import { billingApi } from "@/lib/api";
import { getCurrentUser, requireAccessToken } from "@/lib/auth";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { SubscriptionPanel } from "@/components/app/subscription-panel";
import type { PlanOption, SubscriptionSummary } from "@/lib/types";

export const metadata: Metadata = {
  title: "Subscription",
  description: "Your HueVista plan, usage and billing.",
};

/**
 * The signed-in subscription page: current plan + usage, renew/upgrade with the
 * in-app Razorpay Checkout (also the path back from an ENDED subscription), and
 * history. CUSTOMER accounts can't hold shop plans — they're pointed at their
 * shop's access code instead of being sold retailer tiers.
 */
export default async function SubscriptionPage() {
  const token = await requireAccessToken();
  const user = await getCurrentUser();

  if (user?.role === "CUSTOMER") {
    return (
      <div style={{ maxWidth: 640 }}>
        <Eyebrow>Subscription</Eyebrow>
        <h1 className="display" style={{ fontSize: "clamp(34px, 5vw, 56px)", margin: "12px 0 14px" }}>
          No plan <i>needed.</i>
        </h1>
        <Lead>
          Plans are for paint shops. Visualising your own room is free for you — redeem the
          access code from your paint shop and start painting.
        </Lead>
        <Link className="btn btn-brass" href="/redeem" style={{ marginTop: 28 }}>
          I have a code <span className="arr">→</span>
        </Link>
      </div>
    );
  }

  let current: SubscriptionSummary | null = null;
  let history: SubscriptionSummary[] = [];
  let plans: PlanOption[] = [];
  try {
    current = await billingApi.currentSubscription(token);
  } catch {
    /* 404 = never subscribed — the panel shows the plan picker */
  }
  try {
    history = await billingApi.subscriptionHistory(token);
  } catch {
    /* non-fatal — page renders without the history list */
  }
  try {
    plans = await billingApi.plans(token);
  } catch {
    /* non-fatal — the panel hides the plan cards when empty */
  }

  return (
    <div style={{ maxWidth: 880 }}>
      <Eyebrow>Subscription</Eyebrow>
      <h1 className="display" style={{ fontSize: "clamp(34px, 5vw, 56px)", margin: "12px 0 14px" }}>
        Your <i>plan.</i>
      </h1>
      <Lead style={{ maxWidth: "56ch", marginBottom: 40 }}>
        Everything about your HueVista plan in one place — what you&rsquo;re on, how much
        you&rsquo;ve used this cycle, and how to renew or upgrade.
      </Lead>
      <SubscriptionPanel initialSubscription={current} history={history} plans={plans} />
    </div>
  );
}
