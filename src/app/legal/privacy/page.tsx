import type { Metadata } from "next";
import { contact } from "@/lib/config";
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
    p: "Account details (name, email, optional mobile number), the photographs you upload, the colour selections you make, and basic usage/diagnostic data. We collect a mobile number only when you choose to verify one. If you subscribe to our monthly letter we store that email address for the list, whether or not you have an account.",
  },
  {
    h: "How we use it",
    p: "To provide the visualiser (segmentation, recolouring, recommendations), to operate your account and any retailer/customer relationship, to send verification and transactional messages, and to improve the service.",
  },
  {
    h: "Payments",
    p: "Card, UPI and netbanking details are entered on Razorpay's own checkout and never reach our servers — we never see or store a card number. What we keep is the record of the transaction: the payment and order references Razorpay returns, the amount, and what it bought. That record is what lets us verify a payment, honour a refund and meet our tax obligations, so it is retained even after an account closes.",
  },
  {
    h: "Emails we send",
    p: "Two kinds, and you can tell them apart. Transactional messages — verification codes, payment receipts, plan changes, points expiring — go with the service and cannot be turned off while the account is open. The monthly letter is the only marketing email we send: it is opt-in, every one carries a one-click unsubscribe that needs no login, and leaving affects nothing else about your account.",
  },
  {
    h: "AI processing",
    p: "Uploaded photographs may be sent to our AI providers (e.g. for classification, clean-up and segmentation) strictly to generate your previews. We do not sell your photographs or use them to train third-party models.",
  },
  {
    h: "Sharing",
    p: "We share data only with processors that help run the service — hosting, storage, payments (Razorpay), email/SMS, AI — under contract, and with the paint retailer whose access code you redeem. We do not sell personal data.",
  },
  {
    h: "Retention",
    p: "We keep project data while your account is active. Deleting a project removes its images and masks from storage. You may request account deletion at any time. Two things outlive an account by design: transaction records, which we are required to keep for tax and dispute handling, and a monthly-letter subscription, which is a separate list — unsubscribe from it directly if you want it gone.",
  },
  {
    h: "Your choices",
    p: "You can update your profile, verify or change your contact details, unsubscribe from the monthly letter using the link in any of them, and request a copy or deletion of your data through support. Verification is optional and does not gate basic use.",
  },
  {
    h: "Security",
    p: "Passwords are hashed (BCrypt), access is token-based, and verification codes are one-time and short-lived. No system is perfectly secure, but we take reasonable measures to protect your data.",
  },
  {
    h: "Contact",
    p: `HueVista is a ${contact.entityType.toLowerCase()}, ${contact.addressInline} — the data controller for the information described here. Privacy questions, or a request to access or delete your data? Reach us through the in-app support chat, write to ${contact.support}, or call ${contact.phone}.`,
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
          What we collect, why we collect it, and the choices you keep. Last updated August 2026.
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
