import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser, requireAccessToken, requireFeature } from "@/lib/auth";
import { billingApi, entitlementApi } from "@/lib/api";
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
 * Why a CUSTOMER cannot start a room right now — checked up front so they see a clear
 * screen instead of being invited to upload a photo and rejected afterwards.
 *
 * There are TWO ways a customer holds a project and this has to ask about both:
 *
 *  - A shop onboarded them: an entitlement row carries the allowance and the window.
 *  - They BOUGHT project credits, which is open to any customer — including one who
 *    already has a shop behind them, and most often exactly that customer, since the
 *    cart is what /my-projects offers when a shop's allowance runs out.
 *
 * Only the first was asked about, so the second kind was turned away at the door for
 * want of a code they were never given — with the dashboard beside it saying "projects
 * paid for and ready, start one whenever you like", and the backend perfectly willing
 * to spend the credit. Somebody had paid and the studio would not open.
 *
 * Note the ORDER below, which is the part worth keeping right: a live entitlement is
 * enough on its own, and bought credits are asked about only once it isn't. Neither
 * excludes the other, so the answer is "does anything at all let them start a room".
 *
 * Fail-open on any fetch problem — the backend enforces the same rules authoritatively
 * on every write.
 */
async function customerGate(user: Awaited<ReturnType<typeof getCurrentUser>>, accessToken: string): Promise<CustomerGate> {
  if (user?.role !== "CUSTOMER") return null;
  let ent: Awaited<ReturnType<typeof entitlementApi.my>>;
  try {
    ent = await entitlementApi.my(accessToken);
  } catch {
    return null; // backend hiccup — let them through; the API still gates every action
  }
  // Shop access is live. Whether any of its allowance is LEFT is a different question,
  // answered inside the studio by a panel that offers the ways forward in place.
  if (ent && !ent.expired) return null;

  // Either no shop at all, or a shop window that has closed. Both come down to the same
  // question, and it is not "have you got a code": a project this account bought with
  // its own money opens the studio either way, and the backend will spend it.
  try {
    const options = await billingApi.projectPurchaseOptions(accessToken);
    if (options.availableCredits > 0) return null;
  } catch {
    return null;
  }
  return ent ? "expired" : "missing";
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
        {/* The other two ways forward, offered next to the code. A customer who lands
            here has already tried to start something; sending them back to the
            dashboard alone was a dead end with no suggestion in it — and the prose
            above has been offering "buy one yourself" with no button behind it. */}
        {kind === "missing" && (
          <Link className="btn btn-ghost" href="/my-projects">
            Buy a project <span className="arr">→</span>
          </Link>
        )}
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
  // A customer OPENING A PROJECT THEY ALREADY OWN is never turned away here, whichever
  // gate applies. Two cases need it and neither has anything to do with a code: a
  // ready-made library room costs nothing to open (the backend asks only for a session),
  // and a room the account BOUGHT is governed by its own validity window rather than by
  // any shop's. The backend decides per project — a room a shop's code paid for is
  // refused once that code's window closes, and one the customer paid for is not — so
  // this page only answers the question it can answer on its own: may they start
  // something NEW.
  if (gate && !project) {
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
        isCustomer={user?.role === "CUSTOMER"}
      />
    </div>
  );
}
