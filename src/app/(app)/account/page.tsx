import type { Metadata } from "next";
import { getCurrentUserResult } from "@/lib/auth";
import { Eyebrow } from "@/components/ui/eyebrow";
import { AccountDetails } from "@/components/app/account-details";
import { DeleteAccountButton } from "@/components/app/delete-account-button";

export const metadata: Metadata = {
  title: "Account",
  description: "Manage your HueVista account.",
};

export default async function AccountPage() {
  const { user, unavailable } = await getCurrentUserResult();
  return (
    <div style={{ maxWidth: 640 }}>
      <Eyebrow>Account</Eyebrow>
      <h1 className="display" style={{ fontSize: "clamp(34px, 5vw, 56px)", margin: "12px 0 28px" }}>
        Your <i>account.</i>
      </h1>

      {user ? (
        <AccountDetails user={user} />
      ) : (
        <div
          role="alert"
          style={{
            padding: "12px 16px",
            border: "1px solid var(--rule-strong)",
            background: "var(--surface-soft)",
            color: "var(--fg)",
            font: "300 16px/1.4 var(--serif)",
            borderRadius: "var(--radius)",
          }}
        >
          {unavailable
            ? "We couldn't load your account details just now — you're still signed in. Refresh the page to try again."
            : "We couldn't load your account details. Try signing out and back in."}
        </div>
      )}

      {/* Destructive actions stay hidden while the profile couldn't load — an
          account page that shows ONLY "delete account" invites accidents. */}
      {user && (
        <section
          style={{
            marginTop: 56,
            border: "1px solid var(--terracotta)",
            borderRadius: "var(--radius)",
            padding: 24,
            background: "rgba(var(--fg-rgb), .02)",
          }}
        >
          <h2 style={{ font: "600 18px/1.2 var(--serif)", color: "var(--terracotta)", margin: "0 0 8px" }}>
            Delete account
          </h2>
          <p style={{ font: "400 15px/1.6 var(--sans)", color: "var(--fg-soft)", margin: "0 0 18px", maxWidth: "54ch" }}>
            Permanently delete your account and remove your personal details. Your sessions end immediately and your
            email is freed up. This can&apos;t be undone.
          </p>
          <DeleteAccountButton />
        </section>
      )}
    </div>
  );
}
