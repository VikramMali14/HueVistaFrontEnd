import type { Metadata } from "next";
import Link from "next/link";
import {
  getPaymentAttempts,
  getPaymentAuditSummary,
  requireRole,
} from "@/lib/auth";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { PaymentAudit } from "@/components/admin/payment-audit";

export const metadata: Metadata = {
  title: "Admin · Payment audit",
  description: "Every checkout opened — paid, abandoned, declined or failed in verification.",
};

/**
 * The payment audit.
 *
 * Every other billing record in this product exists because a payment SUCCEEDED. That
 * left the most common thing that happens at a checkout — somebody opening it and not
 * paying — with no evidence anywhere except an application log line that rotates away
 * within days. So the two questions support actually gets, "I paid and got nothing" and
 * "why did sales drop this week", had no answer that survived the week.
 *
 * This page is the answer. Each row is one trip through a Razorpay Checkout, and it keeps
 * what a log line does not: the page the buyer clicked Pay on, their IP and browser, the
 * amount they were quoted, the gateway's own decline code, and a timestamp on every step.
 *
 * Always live: an admin opening this is investigating something that just happened, and a
 * cached report is a report about a different moment.
 */
export const dynamic = "force-dynamic";

export default async function PaymentAuditPage() {
  await requireRole(["ADMIN"]);
  const [attempts, summary] = await Promise.all([
    getPaymentAttempts({}, 0),
    getPaymentAuditSummary(30),
  ]);

  return (
    <div className="measure" style={{ maxWidth: 1080 }}>
      <Eyebrow>Admin · payment audit</Eyebrow>
      <h1 className="display" style={{ fontSize: "clamp(34px, 5vw, 56px)", margin: "12px 0 14px" }}>
        Every checkout, <i>including the ones nobody paid.</i>
      </h1>
      <Lead style={{ maxWidth: "62ch" }}>
        A record opens the moment someone is handed a payment window, and closes when they
        pay, close it, or are refused. Open a row to see exactly where that buyer was, what
        they were quoted, what their browser was, and what the gateway said — so a payment
        question has an answer months later, without going near the logs.
      </Lead>

      <p style={{ marginTop: 16 }}>
        <Link href="/admin" style={{ font: "500 13px/1 var(--sans)", color: "var(--accent-text)" }}>
          ← Back to the accounts console
        </Link>
      </p>

      <div style={{ marginTop: 44 }}>
        <PaymentAudit
          initial={attempts}
          initialSummary={summary}
          searchAction={getPaymentAttempts}
          summaryAction={getPaymentAuditSummary}
        />
      </div>
    </div>
  );
}
