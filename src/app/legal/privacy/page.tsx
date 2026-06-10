import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { Footer } from "@/components/layout/footer";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How HueVista handles your data.",
};

const SECTIONS: ReadonlyArray<{ h: string; p: string }> = [
  {
    h: "What we collect",
    p: "Account details (name, email, optional mobile number), the photographs you upload, the colour selections you make, and basic usage/diagnostic data. We collect a mobile number only when you choose to verify one.",
  },
  {
    h: "How we use it",
    p: "To provide the visualiser (segmentation, recolouring, recommendations), to operate your account and any retailer/customer relationship, to send verification and transactional messages, and to improve the service.",
  },
  {
    h: "AI processing",
    p: "Uploaded photographs may be sent to our AI providers (e.g. for classification, clean-up and segmentation) strictly to generate your previews. We do not sell your photographs or use them to train third-party models.",
  },
  {
    h: "Sharing",
    p: "We share data only with processors that help run the service (hosting, storage, payments, email/SMS, AI) under contract, and with the paint retailer whose access code you redeem. We do not sell personal data.",
  },
  {
    h: "Retention",
    p: "We keep project data while your account is active. Deleting a project removes its images and masks from storage. You may request account deletion at any time.",
  },
  {
    h: "Your choices",
    p: "You can update your profile, verify or change your contact details, and request a copy or deletion of your data through support. Verification is optional and does not gate basic use.",
  },
  {
    h: "Security",
    p: "Passwords are hashed (BCrypt), access is token-based, and verification codes are one-time and short-lived. No system is perfectly secure, but we take reasonable measures to protect your data.",
  },
  {
    h: "Contact",
    p: "Privacy questions? Reach us through the in-app support chat, or write to hello@huevista.com.",
  },
];

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "96px var(--gutter) 140px" }}>
        <Eyebrow>Legal</Eyebrow>
        <h1 className="display" style={{ fontSize: "clamp(40px, 6vw, 72px)", marginTop: 16 }}>
          Privacy <i>policy.</i>
        </h1>
        <Lead style={{ marginTop: 20 }}>
          What we collect, why we collect it, and the choices you keep. Last updated June 2026.
        </Lead>
        <div style={{ marginTop: 56, display: "flex", flexDirection: "column", gap: 36 }}>
          {SECTIONS.map((s) => (
            <section key={s.h}>
              <h2 style={{ font: "600 18px/1.3 var(--sans, system-ui)", color: "var(--fg)", margin: "0 0 8px" }}>{s.h}</h2>
              <p style={{ font: "300 18px/1.6 var(--serif)", color: "var(--fg-soft)", margin: 0 }}>{s.p}</p>
            </section>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
