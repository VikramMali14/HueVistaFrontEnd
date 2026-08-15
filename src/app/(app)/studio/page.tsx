import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser, requireAccessToken, requireFeature } from "@/lib/auth";
import { entitlementApi } from "@/lib/api";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { Visualizer } from "@/components/atelier/visualizer";
import { getCatalogueOrSample } from "@/lib/catalogue";

export const metadata: Metadata = {
  title: "Studio",
  description: "Upload a photo, mark the walls, recolour — in seconds.",
};

/** Project ids are backend UUIDs; anything else in ?project= is a typo or a probe. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Why a CUSTOMER can't enter the studio right now (never set for other roles). */
type CustomerGate = "missing" | "expired" | null;

/**
 * A CUSTOMER's studio access comes from a retailer-issued code. Check it up
 * front so they see a clear "unlock with your code" screen instead of being invited
 * to upload a photo and rejected afterwards. Fail-open on any fetch problem —
 * the backend enforces the same rules authoritatively on every write.
 */
async function customerGate(user: Awaited<ReturnType<typeof getCurrentUser>>, accessToken: string): Promise<CustomerGate> {
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
          ? "Uploading your own photo needs a project — unlock one with a code from your paint shop, or buy one yourself. The ready-made rooms in the library are free either way."
          : "Your access window has closed. Ask your paint shop for a fresh code to keep working — your saved work comes right back."}
      </Lead>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
        <Link className="btn btn-brass" href="/unlock">
          Unlock with a code <span className="arr">→</span>
        </Link>
        {/* The way forward that costs nothing, offered next to the one that doesn't.
            A customer who lands here has already tried to start something; sending
            them back to the dashboard alone was a dead end with no suggestion in it. */}
        {kind === "missing" && (
          <Link className="btn btn-ghost" href="/library">
            Open a ready-made room <span className="arr">→</span>
          </Link>
        )}
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
  // A shop's distributor may not have included the studio in what they sold.
  // Checked before the customer gate below so a restricted SHOP is bounced to
  // its dashboard rather than shown an "unlock with your code" screen meant for
  // customers — requireFeature is a no-op for every non-retailer, customers
  // included, so the two guards don't overlap.
  await requireFeature("STUDIO");
  const user = await getCurrentUser();
  const { project, name } = await searchParams;
  const gate = await customerGate(user, token);
  // A customer OPENING A PROJECT THEY ALREADY OWN is never turned away for want of a
  // code. The library is the case this exists for: a ready-made room costs nothing to
  // open (the backend asks only for a session — no entitlement claimed, no credit
  // reserved), and it lands the customer in the studio with ?project=. Gating that on
  // an access code meant a customer could start a free room and then be told to fetch
  // a code from a shop they may not have, one click later, with the room already made.
  //
  // Only the "no code at all" gate is lifted. An EXPIRED window still stops here,
  // because that is a customer whose access genuinely ran out rather than one who
  // never had any — and the backend locks their reads either way, so letting them
  // through would only replace a clear explanation with a wall of failed requests.
  if (gate === "expired" || (gate === "missing" && !project)) {
    return <AccessGate kind={gate} />;
  }
  // A ?project= that isn't even shaped like an id never reaches the backend — it
  // would 400 and leave the studio to work out what to say. Answering here also
  // covers the case the client cannot: nothing is mounted, so nothing renders an
  // empty "Untitled project" while the failed lookup is in flight.
  if (project !== undefined && !UUID_RE.test(project)) {
    notFound();
  }
  // Live catalogue from the backend; falls back to the bundled sample if it's unreachable.
  const shades = await getCatalogueOrSample();
  return (
    <div className="hv-atelier-page">
      <Visualizer
        projectId={project}
        shades={shades}
        initialName={name}
        isAdmin={user?.role === "ADMIN"}
      />
    </div>
  );
}
