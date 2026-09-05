"use client";

import { useEffect, useRef, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { Spinner } from "@/components/ui/spinner";
import { api, HttpError } from "@/lib/api";
import { useShadeCodeScheme } from "@/hooks/use-shade-code-scheme";
import { decodeShadeCodeAnyScheme } from "@/lib/shade-codes";
import type { DecodedShade, ShadeBrandSummary, ShadeDecodeResult } from "@/lib/types";

/** Long enough that a code being typed doesn't fire a request per keystroke. */
const DEBOUNCE_MS = 350;

/**
 * The counter's code converter, at the top of a shop's dashboard.
 *
 * A customer arrives holding a code — off their phone, a forwarded link, or a printed
 * colour board. It says nothing on purpose: no company, no shade name, nothing to work
 * out from staring at it. This is where it becomes a tin of paint.
 *
 * It reads all three kinds a customer can be carrying: a HueVista code, this shop's own
 * pattern (unwrapped client-side before asking the server), and a paint company's own
 * number. The counter should not have to know which one it is holding.
 *
 * Two answers, and the second is the one that makes this worth having on the dashboard
 * rather than buried in the portal. The first is what the code is. The second is what
 * THIS shop can sell: the customer chose their colour against whatever company the room
 * was designed with, and the shop in front of them may not carry it — so they pick a
 * company they stock and get the nearest shade in its range, told plainly whether that
 * is the same colour or merely the closest one.
 *
 * The backend refuses this endpoint to anyone who is not a shop or an admin, which is
 * the other half of the bargain: HV codes are safe to print precisely because reading
 * one requires an account.
 */
export function HvCodeConverter() {
  const [code, setCode] = useState("");
  const [brand, setBrand] = useState("");
  const [brands, setBrands] = useState<ShadeBrandSummary[]>([]);
  // This shop's own numbering, if it runs one. Only used to unwrap a code its
  // customers hold before asking the server what colour is behind it.
  const scheme = useShadeCodeScheme();
  const [result, setResult] = useState<ShadeDecodeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Guards against an older, slower request overwriting a newer answer — the counter
  // types fast and a stale result here is a wrong colour, not just a stale screen.
  const seq = useRef(0);

  useEffect(() => {
    let cancelled = false;
    // The shop's OWN companies, not the whole catalogue: offering to match into a
    // company this shop cannot sell from is a promise it cannot keep at the counter.
    api
      .listMyShadeBrands()
      .then((b) => !cancelled && setBrands(b))
      .catch(() => {
        // A shop with no assignment restriction, or a hiccup — fall back to the full
        // catalogue rather than leaving the picker empty and the feature dead.
        api.listShadeBrands().then((b) => !cancelled && setBrands(b)).catch(() => {});
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const q = code.trim();
    if (!q) {
      setResult(null);
      setError(null);
      setBusy(false);
      return;
    }
    const mine = ++seq.current;
    setBusy(true);
    const t = setTimeout(() => {
      api
        .decodeShadeCode(q, brand || undefined)
        // A shop that runs its own prefix/pair/suffix pattern hands its customers
        // codes in that numbering, not HV codes — so the box the counter types into
        // has to read both, or half this shop's own customers walk up with a code
        // their shop's own tool calls unknown. The pattern is unwrapped here (client
        // side, where it already lives) and the real code behind it is sent back
        // through the same decoder, so the answer and the brand match are identical
        // whichever kind of code came in. Retired patterns are tried too: a colour
        // board from last season is still the shop's own card.
        .then(async (r) => {
          if (r.matchedBy || !scheme) return r;
          const unwrapped = decodeShadeCodeAnyScheme(scheme, q);
          if (!unwrapped) return r;
          const viaPattern = await api.decodeShadeCode(unwrapped.code, brand || undefined);
          // Echo back what the counter actually typed, not the code we unwrapped —
          // the box shows their input and the two disagreeing reads as a bug.
          return viaPattern.matchedBy ? { ...viaPattern, query: r.query } : r;
        })
        .then((r) => {
          if (seq.current !== mine) return;
          setResult(r);
          setError(null);
        })
        .catch((e) => {
          if (seq.current !== mine) return;
          setResult(null);
          setError(
            e instanceof HttpError && e.status === 403
              ? "Only shop accounts can read customer codes."
              : "Could not read that code just now. Please try again.",
          );
        })
        .finally(() => {
          if (seq.current === mine) setBusy(false);
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [code, brand, scheme]);

  const found = result?.shade ?? null;
  const ambiguous = (result?.candidates?.length ?? 0) > 0;
  const nothing = Boolean(result) && !found && !ambiguous && !busy;

  return (
    <section
      style={{
        marginBottom: 32,
        border: "1px solid var(--rule)",
        borderRadius: "var(--radius)",
        padding: "18px 18px 16px",
        background: "var(--surface-soft)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
        <Mono>Code converter</Mono>
        <Mono>Read a customer&rsquo;s code</Mono>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ display: "block", flex: "1 1 220px", minWidth: 200 }}>
          <span style={{ display: "block", font: "400 12px/1 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase", color: "var(--fg-mute)", marginBottom: 7 }}>
            Customer code
          </span>
          <input
            value={code}
            // Codes are printed and read in upper case; echoing back whatever case was
            // typed made a code that resolved fine look like it had been rejected.
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. HV0348"
            aria-label="Customer code to read"
            spellCheck={false}
            autoCapitalize="characters"
            autoComplete="off"
            style={{
              width: "100%",
              padding: "11px 13px",
              border: "1px solid var(--rule-strong)",
              background: "var(--surface)",
              color: "var(--fg)",
              fontFamily: "var(--code)",
              letterSpacing: ".14em",
              fontSize: 15,
            }}
          />
        </label>

        <label style={{ display: "block", flex: "1 1 220px", minWidth: 200 }}>
          <span style={{ display: "block", font: "400 12px/1 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase", color: "var(--fg-mute)", marginBottom: 7 }}>
            Match into a company you stock
          </span>
          <select
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            aria-label="Company to find the nearest shade in"
            style={{
              width: "100%",
              padding: "11px 13px",
              border: "1px solid var(--rule-strong)",
              background: "var(--surface)",
              color: "var(--fg)",
              font: "400 15px/1.2 var(--sans)",
            }}
          >
            <option value="">No match — just read the code</option>
            {brands.map((b) => (
              <option key={b.slug} value={b.slug}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p style={{ font: "400 12.5px/1.5 var(--sans)", color: "var(--fg-mute)", margin: "10px 0 0", maxWidth: "62ch" }}>
        Type a code off a customer&rsquo;s screen, a share link or a printed colour board —
        a HueVista code, your own pattern, or a paint company&rsquo;s own number.
        Pick a company as well and you&rsquo;ll get the nearest shade in its range, with
        whether it&rsquo;s the same colour or the closest one.
      </p>

      {busy && (
        <p style={{ marginTop: 14, display: "inline-flex", alignItems: "center", gap: 8, font: "400 13px/1.4 var(--sans)", color: "var(--fg-mute)" }}>
          <Spinner size={12} color="currentColor" /> Reading…
        </p>
      )}

      {error && (
        <p role="alert" style={{ marginTop: 14, font: "400 14px/1.5 var(--sans)", color: "var(--danger, #c0392b)" }}>
          {error}
        </p>
      )}

      {nothing && (
        <p style={{ marginTop: 14, font: "400 14px/1.5 var(--sans)", color: "var(--fg-mute)", maxWidth: "58ch" }}>
          No shade carries “{result?.query}”. Check the code — HueVista codes look like
          HV0348, your own pattern codes read here too, and so does a paint
          company&rsquo;s own number.
        </p>
      )}

      {found && (
        <div style={{ marginTop: 16, borderTop: "1px solid var(--rule)", paddingTop: 14 }}>
          <Mono style={{ display: "block", marginBottom: 10 }}>The colour</Mono>
          <ShadeRow shade={found} />
        </div>
      )}

      {/* A manufacturer code several companies share. Deliberately a question rather
          than a guess: picking one would name a real shade from the wrong company,
          which reads exactly like a correct answer. */}
      {ambiguous && (
        <div style={{ marginTop: 16, borderTop: "1px solid var(--rule)", paddingTop: 14 }}>
          <p style={{ font: "400 14px/1.5 var(--sans)", color: "var(--fg-soft)", margin: "0 0 10px", maxWidth: "58ch" }}>
            More than one company uses the code “{result?.query}”. Which one is on the
            customer&rsquo;s board?
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {result?.candidates?.map((c) => (
              <ShadeRow key={`${c.brandSlug}-${c.shadeCode}`} shade={c} />
            ))}
          </div>
        </div>
      )}

      {result?.brandMatch && (
        <div style={{ marginTop: 16, borderTop: "1px solid var(--rule)", paddingTop: 14 }}>
          <Mono style={{ display: "block", marginBottom: 10 }}>
            In {result.brandMatch.brandName}
          </Mono>
          <ShadeRow shade={result.brandMatch.shade} />
          {/* The whole point of the second field: the counter must never quote a near
              miss as if it were the colour the customer chose. */}
          <p
            style={{
              marginTop: 10,
              font: "500 13.5px/1.5 var(--sans)",
              color: result.brandMatch.exact ? "var(--accent-text)" : "var(--fg-soft)",
            }}
          >
            {result.brandMatch.exact ? "Exact match — " : "Closest match — "}
            <span style={{ fontWeight: 400 }}>
              {result.brandMatch.closeness}
              {result.brandMatch.exact ? "" : ` (ΔE ${result.brandMatch.deltaE})`}
            </span>
          </p>
        </div>
      )}
    </section>
  );
}

/** One shade, as the counter needs to read it: swatch, company, real code, name. */
function ShadeRow({ shade }: { shade: DecodedShade }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "6px 0" }}>
      <span
        aria-hidden
        style={{
          width: 30,
          height: 30,
          background: shade.hexCode ?? "transparent",
          border: "1px solid var(--rule-strong)",
          borderRadius: 5,
          flexShrink: 0,
        }}
      />
      <span style={{ font: "600 17px/1 var(--code)", color: "var(--fg)" }}>{shade.shadeCode}</span>
      <span style={{ font: "400 15px/1.2 var(--sans)", color: "var(--fg)" }}>{shade.name}</span>
      <Mono>{shade.brandName}</Mono>
      {/* Shown so the counter can read the customer's board back to them and confirm
          they are both looking at the same colour before anything is mixed. */}
      {shade.hvCode && <Mono>· {shade.hvCode}</Mono>}
    </div>
  );
}
