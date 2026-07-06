import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser, requireAccessToken } from "@/lib/auth";
import { entitlementApi } from "@/lib/api";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { Visualizer } from "@/components/atelier/visualizer";
import { fetchCatalogue } from "@/lib/catalogue";
import { SHADES } from "@/lib/shades";
import type { PaintShade } from "@/lib/types";

export const metadata: Metadata = {
  title: "Studio",
  description: "Upload a photo, mark the walls, recolour — in seconds.",
};

/** Why a CUSTOMER can't enter the studio right now (never set for other roles). */
type CustomerGate = "missing" | "expired" | null;

/**
 * A CUSTOMER's studio access comes from a retailer-issued code. Check it up
 * front so they see a clear "redeem your code" screen instead of being invited
 * to upload a photo and rejected afterwards. Fail-open on any fetch problem —
 * the backend enforces the same rules authoritatively on every write.
 */
async function customerGate(accessToken: string): Promise<CustomerGate> {
  const user = await getCurrentUser();
  if (user?.role !== "CUSTOMER") return null;
  try {
    const ent = await entitlementApi.my(accessToken);
    if (!ent) return "missing";
    if (ent.expired) return "expired";
  } catch {
    /* backend hiccup — let them through; the API still gates every action */
  }
  return null;
}

function AccessGate({ kind }: { kind: "missing" | "expired" }) {
  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "72px var(--gutter) 120px", textAlign: "center" }}>
      <Eyebrow>Studio · access</Eyebrow>
      <h1 className="display" style={{ fontSize: "clamp(36px, 5vw, 60px)", margin: "16px 0 14px" }}>
        {kind === "missing" ? (
          <>One code, and <i>you&apos;re in.</i></>
        ) : (
          <>Your access has <i>ended.</i></>
        )}
      </h1>
      <Lead style={{ maxWidth: "46ch", margin: "0 auto 28px" }}>
        {kind === "missing"
          ? "The studio unlocks with an access code from your paint shop. Ask at the counter — redeeming it gives you a project and a validity window."
          : "Your access window has closed. Ask your paint shop for a fresh code to keep working — your saved work comes right back."}
      </Lead>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
        <Link className="btn btn-brass" href="/redeem">
          Redeem a code <span className="arr">→</span>
        </Link>
        <Link className="btn btn-ghost" href="/dashboard">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}

export default async function AtelierPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; name?: string }>;
}) {
  // Gate the route — the BFF proxy will pick up the cookie itself; we don't pass the token.
  const token = await requireAccessToken();
  const gate = await customerGate(token);
  if (gate) {
    return <AccessGate kind={gate} />;
  }
  const { project, name } = await searchParams;
  // Live catalogue from the backend; fall back to the bundled sample if it's unreachable.
  let shades: PaintShade[];
  try {
    const live = await fetchCatalogue();
    shades = live.length > 0 ? live : [...SHADES];
  } catch {
    shades = [...SHADES];
  }
  return (
    <div className="hv-atelier-page">
      <Visualizer projectId={project} shades={shades} initialName={name} />
    </div>
  );
}
