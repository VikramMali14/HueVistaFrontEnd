import { redirect } from "next/navigation";

// Shops are provisioned by an admin only — public self-signup is retired. Anyone
// following an old "start free trial" link is sent to the public customer signup.
export default function TrialPage() {
  redirect("/join");
}
