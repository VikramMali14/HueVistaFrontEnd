import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { Eyebrow } from "@/components/ui/eyebrow";
import { DeleteAccountButton } from "@/components/app/delete-account-button";

export const metadata: Metadata = {
  title: "Account",
  description: "Manage your HueVista account.",
};

const label: React.CSSProperties = {
  font: "400 10px/1 var(--mono)",
  letterSpacing: ".22em",
  textTransform: "uppercase",
  color: "var(--fg-mute)",
  alignSelf: "center",
};
const value: React.CSSProperties = { font: "400 17px/1.4 var(--serif)", color: "var(--fg)", margin: 0 };

function roleLabel(role: string): string {
  if (role === "CUSTOMER") return "Customer";
  if (role === "RETAILER") return "Retailer";
  return role.charAt(0) + role.slice(1).toLowerCase();
}

export default async function AccountPage() {
  const user = await getCurrentUser();
  return (
    <div style={{ maxWidth: 640 }}>
      <Eyebrow>Account</Eyebrow>
      <h1 className="display" style={{ fontSize: "clamp(34px, 5vw, 56px)", margin: "12px 0 28px" }}>
        Your <i>account.</i>
      </h1>

      {user && (
        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "14px 28px", margin: 0 }}>
          <dt style={label}>Name</dt>
          <dd style={value}>{user.name}</dd>
          <dt style={label}>Email</dt>
          <dd style={value}>{user.email}</dd>
          <dt style={label}>Account</dt>
          <dd style={value}>{roleLabel(user.role)}</dd>
        </dl>
      )}

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
    </div>
  );
}
