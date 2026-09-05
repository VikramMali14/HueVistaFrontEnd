"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CountUp } from "@/components/ui/count-up";
import { Mono } from "@/components/ui/eyebrow";
import { Spinner } from "@/components/ui/spinner";
import { hasPassed } from "@/lib/dates";
import { api, HttpError } from "@/lib/api";
import { buyOneProject } from "@/lib/payments";
import type { CustomerEntitlement, ProjectPurchaseOptions } from "@/lib/types";

/**
 * "a year" / "30 days" — how long a room stays open, in words.
 *
 * A year reads as a year, not as "365 days": the catalogue sells the window in years and
 * quoting it in days makes a generous term sound like a countdown. Anything else is left in
 * days, which is how the shop-side windows are actually thought about.
 */
function validityPhrase(days: number | undefined): string {
  if (!days) return "30 days";
  if (days % 365 === 0) {
    const years = days / 365;
    return years === 1 ? "a year" : `${years} years`;
  }
  return `${days} days`;
}

/** Paise → a rupee figure for a sentence ("₹99", "₹9", "₹49.50"). */
function rupees(paise: number): string {
  return paise % 100 === 0 ? `₹${paise / 100}` : `₹${(paise / 100).toFixed(2)}`;
}

/**
 * The panel's shell, matching the wallet and the cart beside it.
 *
 * One card language across the customer's billing screens — a generous radius, a single
 * wash of accent from one corner, and a lit hairline along the top edge — because three
 * panels that differ in what they say and not in how they are built are what make a page
 * read as one thing rather than as three bolted together.
 *
 * A class rather than the inline object it used to be. The hairline is a pseudo-element
 * and the wash wants a hover state, and an inline style can express neither: this panel
 * was the one of the three carrying only two thirds of the language its own docstring
 * describes, which showed as the odd card out on a page of otherwise identical ones.
 */
function PanelStyles() {
  return (
    <style>{`
      .hv-cpp {
        position: relative; overflow: hidden;
        border: 1px solid var(--rule); border-radius: calc(var(--radius) * 1.8);
        padding: 30px;
        background:
          radial-gradient(110% 80% at 0% 0%, rgba(192,139,78,.07), transparent 60%),
          var(--surface);
      }
      .hv-cpp::before {
        content: ""; position: absolute; inset: 0 0 auto; height: 1px;
        background: linear-gradient(90deg, transparent, var(--rule-brass), transparent);
      }
      /* The headline figure, set as a figure: the number in the accent, the word under
         it in the label style. Same treatment as the wallet's balance beside it, which
         is the point — two counters that count different things should still look like
         a matched pair, and one in --fg and one in --accent-text did not. */
      .hv-cpp-figure { display: flex; align-items: baseline; gap: 10px; margin: 0 0 12px; }
      .hv-cpp-figure-n {
        font: 300 40px/1 var(--serif); color: var(--accent-text);
        letter-spacing: -.02em; font-variant-numeric: tabular-nums;
      }
      .hv-cpp-figure-w {
        font: 500 11px/1.5 var(--sans); letter-spacing: .14em; text-transform: uppercase;
        color: var(--fg-mute);
      }
    `}</style>
  );
}

/**
 * What a customer holds, and how they get more.
 *
 * There are two kinds of customer here and they need opposite answers, which is why
 * this panel branches rather than showing one set of buttons:
 *
 *   A shop ONBOARDED them with an access code. Their projects came out of that shop's
 *   monthly quota — the shop already paid — and the shop can add another in one click
 *   from its counter. Selling them a project directly would take money for something
 *   their shop is already responsible for, so they get a message to send instead of a
 *   payment sheet. The backend enforces the same split; a buy button here could only
 *   ever come back refused.
 *
 *   They SIGNED UP THEMSELVES (a Google login, an email address). Nobody is behind
 *   them, so buying is the only route they have, and the "ask your shop" line would
 *   point at a party they have never dealt with.
 *
 * The AI wallet sits below this and is the same for both: a project covers the room
 * and the colour board, never the photorealistic image at the end of it.
 *
 * @param showBuy whether the shopless branch sells projects here as well as counting them.
 *        False on the Projects &amp; credits page, where the cart above does the selling —
 *        one screen must not offer the same project at two prices through two buttons.
 */
/**
 * @param reloadKey bump it to refetch. Same reasoning as the wallet's: this panel
 *                  counts what the account holds, and something bought elsewhere on the
 *                  page changes that. See {@code ProjectsAndCredits}.
 */
/**
 * @param describe whether this panel also has to say WHAT a project is.
 *
 * True on a screen where it stands alone. False on Projects &amp; credits, whose header
 * defines a project and a credit once, as a pair — and where this panel repeating it in
 * slightly different words was two thirds of what made the page read as a wall of text
 * rather than as a statement of account. What is left here is what the header cannot
 * know: how many you hold, where they came from, and how long they last.
 */
export function CustomerProjectsPanel(
  { showBuy = true, describe = true, reloadKey = 0 }:
    { showBuy?: boolean; describe?: boolean; reloadKey?: number } = {},
) {
  // undefined = loading, null = no shop behind this account, "error" = fetch failed
  const [ent, setEnt] = useState<CustomerEntitlement | null | "error" | undefined>(undefined);
  const [options, setOptions] = useState<ProjectPurchaseOptions | null>(null);
  const [asked, setAsked] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    api
      .getMyEntitlement()
      .then((e) => !cancelled && setEnt(e ?? null))
      .catch(() => !cancelled && setEnt("error"));
    api
      .getProjectPurchaseOptions()
      .then((o) => !cancelled && setOptions(o))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  if (ent === undefined) {
    return (
      <p style={{ display: "inline-flex", alignItems: "center", gap: 8, font: "400 14px/1.4 var(--sans)", color: "var(--fg-mute)" }}>
        <Spinner size={12} color="currentColor" /> Loading your projects…
      </p>
    );
  }

  if (ent === "error") {
    return (
      <p role="alert" style={{ font: "400 15px/1.5 var(--sans)", color: "var(--fg-soft)", maxWidth: "58ch" }}>
        We couldn&rsquo;t load your projects just now — you&rsquo;re still signed in. Refresh
        the page to try again.
      </p>
    );
  }

  // ── No shop behind this account: buying is the only route, so it is the whole panel.
  if (ent === null) {
    const credits = options?.availableCredits ?? 0;
    return (
      <div className="hv-cpp">
        <PanelStyles />
        <Mono style={{ display: "block", marginBottom: 12 }}>Your projects</Mono>
        <p className="hv-cpp-figure">
          {/* Rolled up rather than printed. It is the answer the page was opened for,
              and a number that counts to itself is the one thing on a billing screen
              that can be animated without anybody having to wait for it — CountUp
              renders the final value outright under reduced motion and on the server. */}
          <CountUp className="hv-cpp-figure-n" value={credits} />
          <span className="hv-cpp-figure-w">ready to use</span>
        </p>
        <p style={{ font: "400 15px/1.6 var(--sans)", color: "var(--fg-soft)", maxWidth: "56ch", margin: "0 0 16px" }}>
          {credits > 0 ? (
            <>
              {describe && "Each one opens a room you can photograph, repaint and save. "}
              Open for {validityPhrase(options?.validDays)} once you begin it.{" "}
              {/* The link matters: this is the one panel that tells a customer with no
                  shop that they hold something, and it used to name every route out of
                  the page except the one that spends it. */}
              <Link href="/studio" style={{ color: "var(--accent-text)" }}>
                Start a room →
              </Link>
            </>
          ) : (
            <>
              {describe && "You pay per room rather than by the month. "}
              Buy one and it stays open for {validityPhrase(options?.validDays)} once you
              begin it.
            </>
          )}
        </p>
        {showBuy && <BuyProjects options={options} onBought={setOptions} />}
        {/* The two routes that cost nothing, on one line. Both belong on the panel that
            tells a customer with no shop what they hold: one of them is how a shop's
            customer gets here at all, and the other is the answer for somebody who wants
            to try the studio before paying for a room of their own. */}
        <p style={{ marginTop: 14, font: "400 13.5px/1.5 var(--sans)", color: "var(--fg-mute)" }}>
          Got a shop code?{" "}
          <Link href="/unlock" style={{ color: "var(--accent-text)" }}>
            Unlock with it →
          </Link>{" "}
          ·{" "}
          <Link href="/library" style={{ color: "var(--accent-text)" }}>
            Ready-made rooms
          </Link>{" "}
          are free.
        </p>
      </div>
    );
  }

  // ── A shop onboarded this account.
  // Whether the shop's window is still open, asked of the date as well as the flag —
  // the flag is only as fresh as the last backend sweep, and a stale one spends an
  // allowance the backend will refuse. See hasPassed.
  const accessOver = ent.expired || hasPassed(ent.accessExpiresAt, now);
  const daysLeft = ent.accessExpiresAt
    ? Math.ceil((new Date(ent.accessExpiresAt).getTime() - now) / 86_400_000)
    : null;
  const codeLeft = Math.max(0, ent.projectsRemaining);
  /**
   * Projects this account BOUGHT, on top of whatever its shop assigned.
   *
   * The product describes these two as alternatives — a shop's customer, or a customer
   * who signed up alone — and this panel used to branch as though that were enforced.
   * It is not. The cart on this very page sells projects to anyone, and the customer
   * most likely to buy one is precisely the one whose shop allowance has run out: the
   * "buy" button is the one in front of them. So an account could pay, land back here,
   * and be told "you've used every project on your code" with no mention of the project
   * it had just bought — while the studio, which asks the backend rather than this
   * panel, would have let them start a room with it all along.
   */
  const bought = Math.max(0, options?.availableCredits ?? 0);
  // What is spendable RIGHT NOW. An expired window takes the shop's allowance with it;
  // bought projects have their own validity and outlive it, which is the whole reason
  // they cannot simply be added to the figure above.
  const usable = (accessOver ? 0 : codeLeft) + bought;
  const noneLeft = usable <= 0;
  const shopName = "your paint shop";

  return (
    <div className="hv-cpp">
      <PanelStyles />
      <Mono style={{ display: "block", marginBottom: 12 }}>Your projects</Mono>
      <p className="hv-cpp-figure">
        <CountUp className="hv-cpp-figure-n" value={usable} />
        <span className="hv-cpp-figure-w">ready to use</span>
      </p>
      {/* The pip row that used to sit here — one dash per project, plus a wider
          "and more" dash — read as a progress bar that had stalled, in the accent,
          directly under the figure it was restating. The number is the number. */}
      {/* The deduction, not just the remainder: "1 of 3 used" says the shop assigned
          three and one is gone, which a bare "2 left" doesn't. Bought projects are named
          separately rather than folded in — they came from a different place, they
          outlive the shop's window, and a customer who paid for one should be able to
          see it sitting there. */}
      <p style={{ font: "400 14px/1.5 var(--sans)", color: "var(--fg-mute)", margin: "0 0 16px" }}>
        {ent.projectsCreated} of {ent.projectAllowance} used on your code
        {bought > 0 ? ` · ${bought} you bought` : ""}
        {accessOver
          ? " · your access window has closed"
          : daysLeft !== null
            ? ` · ${daysLeft} day${daysLeft === 1 ? "" : "s"} of access left`
            : ""}
      </p>

      {accessOver && bought === 0 ? (
        <p style={{ font: "400 15px/1.6 var(--sans)", color: "var(--fg-soft)", maxWidth: "56ch" }}>
          Ask {shopName} for a fresh code and your saved work comes right back —{" "}
          <Link href="/unlock" style={{ color: "var(--accent-text)" }}>
            unlock with it here
          </Link>
          .
        </p>
      ) : noneLeft ? (
        <>
          <p style={{ font: "400 15px/1.6 var(--sans)", color: "var(--fg-soft)", maxWidth: "56ch", margin: "0 0 14px" }}>
            You&rsquo;ve used every project on your code. Your shop assigned these out of
            their own monthly allowance and can add another from their counter in one
            click — so asking them is the quickest way, and it costs you nothing.
          </p>
          <AskShopButton state={asked} setState={setAsked} />
        </>
      ) : (
        <p style={{ font: "400 15px/1.6 var(--sans)", color: "var(--fg-soft)", maxWidth: "56ch" }}>
          {/* Said whenever anything is spendable, including the case this panel used to
              get wrong: the code is finished but a bought project is sitting there. */}
          {describe && "Each one opens a room you can photograph, repaint and save. "}
          {/* The line above has already said the window closed; this only has to say
              what survives it, or it says the same thing twice in one card. */}
          {accessOver && (
            <>
              The {bought === 1 ? "project" : "projects"} you bought{" "}
              {bought === 1 ? "is" : "are"} yours to keep either way.{" "}
            </>
          )}
          <Link href="/studio" style={{ color: "var(--accent-text)" }}>
            Start one →
          </Link>
        </p>
      )}
      <p style={{ marginTop: 14, font: "400 13.5px/1.5 var(--sans)", color: "var(--fg-mute)" }}>
        <Link href="/library" style={{ color: "var(--accent-text)" }}>
          Ready-made rooms
        </Link>{" "}
        are free and use none of your projects.
      </p>
    </div>
  );
}

/**
 * "Ask my shop for another project" — the thing a shop-onboarded customer gets
 * instead of a buy button. Sends one email to the shop owner, who grants the project
 * from their portal.
 */
function AskShopButton({
  state,
  setState,
}: {
  state: "idle" | "sending" | "sent" | "failed";
  setState: (s: "idle" | "sending" | "sent" | "failed") => void;
}) {
  if (state === "sent") {
    return (
      <p role="status" style={{ font: "500 14.5px/1.5 var(--sans)", color: "var(--accent-text)" }}>
        Asked — your shop has been emailed. They can add a project from their counter.
      </p>
    );
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <button
        type="button"
        disabled={state === "sending"}
        onClick={async () => {
          setState("sending");
          try {
            await api.requestMoreProjects();
            setState("sent");
          } catch {
            setState("failed");
          }
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 16px",
          border: "1px solid var(--accent)",
          background: "transparent",
          color: "var(--accent-text)",
          font: "400 12px/1 var(--mono)",
          letterSpacing: ".18em",
          textTransform: "uppercase",
          cursor: state === "sending" ? "progress" : "pointer",
        }}
      >
        {state === "sending" ? (
          <><Spinner size={12} color="currentColor" /> Asking…</>
        ) : (
          <>Ask my shop for another <span className="arr">→</span></>
        )}
      </button>
      {state === "failed" && (
        <span role="alert" style={{ font: "400 13.5px/1.4 var(--sans)", color: "var(--danger, #c0392b)" }}>
          Couldn&rsquo;t send that just now. Please try again.
        </span>
      )}
    </span>
  );
}

/**
 * Buy projects with a card. Only ever rendered for an account with no shop behind it —
 * see the note on {@link CustomerProjectsPanel}.
 *
 * The browser never names a price: the label reads the server's own quote, and the
 * order is priced server-side again when it is created.
 */
function BuyProjects({
  options,
  onBought,
}: {
  options: ProjectPurchaseOptions | null;
  onBought: (fresh: ProjectPurchaseOptions) => void;
}) {
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const buy = async (credits: number) => {
    setBusy(credits);
    setError(null);
    try {
      const fresh = await buyOneProject(undefined, credits);
      // null = Checkout was closed without paying. Not an error, and saying nothing
      // is the right response to someone who chose not to buy.
      if (fresh) onBought(fresh);
    } catch (e) {
      setError(e instanceof HttpError ? e.message : "Could not start the payment. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  // The bundle sits BESIDE the single price, never instead of it: "3 for ₹398" says
  // nothing on its own, and someone who wants one room should not have to work out
  // that they are being upsold.
  const bundle =
    options?.bundleCredits && options.bundlePricePaise
      ? { credits: options.bundleCredits, paise: options.bundlePricePaise }
      : null;

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={() => void buy(1)}
        disabled={busy !== null}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 16px",
          border: "1px solid var(--accent)",
          background: "transparent",
          color: "var(--accent-text)",
          font: "400 12px/1 var(--mono)",
          letterSpacing: ".18em",
          textTransform: "uppercase",
          cursor: busy !== null ? "progress" : "pointer",
        }}
      >
        {busy === 1 ? (
          <><Spinner size={12} color="currentColor" /> Opening…</>
        ) : (
          <>Buy a project{options ? ` · ${rupees(options.projectPricePaise)}` : ""} →</>
        )}
      </button>
      {bundle && (
        <button
          type="button"
          onClick={() => void buy(bundle.credits)}
          disabled={busy !== null}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 16px",
            border: "1px solid var(--rule)",
            background: "transparent",
            color: "var(--fg-soft)",
            font: "400 12px/1 var(--mono)",
            letterSpacing: ".18em",
            textTransform: "uppercase",
            cursor: busy !== null ? "progress" : "pointer",
          }}
        >
          {busy === bundle.credits ? (
            <><Spinner size={12} color="currentColor" /> Opening…</>
          ) : (
            <>or {bundle.credits} for {rupees(bundle.paise)} →</>
          )}
        </button>
      )}
      {error && (
        <span role="alert" style={{ font: "400 13px/1.4 var(--sans)", color: "var(--danger, #c0392b)" }}>
          {error}
        </span>
      )}
    </span>
  );
}
