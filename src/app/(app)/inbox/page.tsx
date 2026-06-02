import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { SupportInbox } from "./inbox-client";

export const metadata: Metadata = {
  title: "Support inbox",
  description: "Conversations awaiting a human reply.",
};

export default async function InboxPage() {
  // Staff-only. Non-admins are redirected to /dashboard.
  await requireRole(["ADMIN"]);
  return (
    <div>
      <header style={{ marginBottom: 32 }}>
        <Eyebrow>Support · Inbox</Eyebrow>
        <h1 className="display" style={{ fontSize: "clamp(40px, 5vw, 72px)", marginTop: 12 }}>
          Awaiting <i>a human.</i>
        </h1>
        <Lead style={{ marginTop: 16, maxWidth: "52ch" }}>
          Conversations the AI escalated or where a customer asked for a person. Reply, then resolve.
        </Lead>
      </header>
      <SupportInbox />
    </div>
  );
}
