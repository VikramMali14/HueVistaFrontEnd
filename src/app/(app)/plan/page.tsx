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

  // An administrator runs the platform rather than buying from it. Sending them to the
  // panel below meant a plan picker and a "your trial has ended" prompt aimed at the
  // person who administers everyone else's subscriptions.
  if (user?.role === "ADMIN") {
    return (
      <div style={{ maxWidth: 640 }}>
        <Eyebrow>Subscription</Eyebrow>
        <h1 className="display" style={{ fontSize: "clamp(34px, 5vw, 56px)", margin: "12px 0 14px" }}>
          No plan <i>needed.</i>
        </h1>
        <Lead>
          Administrator accounts aren&rsquo;t billed. Every feature, every quota and every
          shop&rsquo;s console is open to you without a subscription — there is nothing here
          to buy, renew or cancel.
        </Lead>
        <Link className="btn btn-brass" href="/admin" style={{ marginTop: 28 }}>
          Admin console <span className="arr">→</span>
        </Link>
      </div>
    );
  }

  if (user?.role === "CUSTOMER") {
    return (
      <div style={{ maxWidth: 640 }}>
        <Eyebrow>Subscription</Eyebrow>
        <h1 className="display" style={{ fontSize: "clamp(34px, 5vw, 56px)", margin: "12px 0 14px" }}>
          No plan <i>needed.</i>
        </h1>
        {/* Two routes, because there are two kinds of customer here and only one of them
            has a shop. Naming just the code stranded anyone who signed up on their own —
            they were told to fetch something from a party they had never dealt with. */}
        <Lead>
          Monthly plans are for paint shops. You pay per room instead: buy a project when
          you want one, and it stays open for a month. If a paint shop gave you an access
          code, unlock with that and the room is on them.
        </Lead>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 28 }}>
          <Link className="btn btn-brass" href="/studio">
            Start a room <span className="arr">→</span>
          </Link>
          <Link className="btn" href="/unlock">
            I have a code <span className="arr">→</span>
          </Link>
        </div>
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
