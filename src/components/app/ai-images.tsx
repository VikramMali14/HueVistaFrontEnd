"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button, LinkButton } from "@/components/ui/button";
import { CountUp } from "@/components/ui/count-up";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { FilterBar, matchesQuery } from "@/components/ui/filter-bar";
import { Spinner } from "@/components/ui/spinner";
import { useCopied } from "@/hooks/use-copied";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/dates";
import { downloadBlob } from "@/lib/download-blob";
import { downloadRemoteImage } from "@/lib/download-image";
import { resolveMediaUrl } from "@/lib/media";
import { buildAiImagePdf, imageUrlToJpegDataUrl } from "@/lib/pdf-export";
import { printableShades } from "@/lib/printable-shades";
import { describeRender, FURNISHING_LABELS } from "@/lib/render-labels";
import { codesAreUniversal, type ShadeCodeScheme } from "@/lib/shade-codes";
import type { MyRender } from "@/lib/types";

/**
 * Every AI image this account has made, on one shelf.
 *
 * <p><b>Why this page exists.</b> An image was only ever reachable from the render page of
 * the project that made it — `/render?project=<id>` — so finding one a week later meant
 * remembering which room it was on and navigating back into that room. For the picture
 * the customer paid ₹99 for, that is the wrong amount of effort: in practice the image
 * lived in whatever their browser called their downloads folder, and the copy on our side
 * was unreachable. This is keyed by the ACCOUNT instead, so "where is my AI image?" has an
 * answer that does not begin with a question.
 *
 * <p><b>Why the PDF is here and not only on the board.</b> The colour board already ends
 * with the AI image, which is right at a counter when somebody wants one document for the
 * whole job. It is the wrong shape afterwards: sending a painter five pages of options
 * that were already chosen between, to show them one picture, is noise. But handing over
 * the bare JPEG loses the thing that makes the picture actionable — the shade table.
 * Nobody can buy paint from a photograph of a room. So one image gets one sheet, with its
 * colours and their codes on it, built by the same generator as the board so the two look
 * like one product.
 *
 * <p><b>Selection is local, deliberately.</b> Everything the detail pane shows arrives in
 * the list response — the room's name, the combination, the shades — so choosing a
 * picture is a state change and not a fetch. The one thing that is fetched lazily is the
 * JPEG re-encode for the PDF, and only when the button is pressed.
 *
 * <p><b>What this screen learned from watching it used.</b> Four things were wrong, and
 * all four were about the customer rather than the data:
 *
 * <ul>
 *   <li>On a phone the shelf was a two-column grid ABOVE the picture, so tapping a
 *       thumbnail changed something the reader could not see. It is a filmstrip now —
 *       one row, scrolled sideways, with the picture directly under it — and the chosen
 *       card is scrolled back into the strip when the choice comes from anywhere else.</li>
 *   <li>"Download the image" did not download. It was an anchor with a `download`
 *       attribute on a cross-origin URL, which browsers ignore, so it navigated to a bare
 *       JPEG. See {@link downloadRemoteImage}.</li>
 *   <li>A presigned URL lasts an hour. A tab left open past that showed empty frames with
 *       no explanation and no way back short of a reload nobody knew to do; a failed
 *       image now says so and offers the refresh.</li>
 *   <li>The shade codes — the reason the picture is worth anything at a paint counter —
 *       could only be copied by retyping them off the screen.</li>
 * </ul>
 */
export function AiImages() {
  const [renders, setRenders] = useState<MyRender[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The id currently being turned into a PDF — so one spinner cannot claim two cards. */
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  /** The id currently being saved, same reason. */
  const [saveBusy, setSaveBusy] = useState<string | null>(null);
  /**
   * The shop's customer-facing code pattern. Null means "not loaded, or this account has
   * no shop behind it", and null is read strictly: the manufacturer's codes stay hidden.
   * Same rule the studio and the render page follow — see printableShades.
   */
  const [codeScheme, setCodeScheme] = useState<ShadeCodeScheme | null>(null);
  const [query, setQuery] = useState("");
  /**
   * Bumped to re-run the load. A presigned URL expires within the hour, so the fix for
   * a picture that has stopped arriving is a fresh list rather than a page reload — and
   * saying so is the difference between a blank frame and an explained one.
   */
  const [reloads, setReloads] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  /** Images whose URL the browser refused. Cleared by a refresh, which re-signs them. */
  const [brokenIds, setBrokenIds] = useState<ReadonlySet<string>>(() => new Set());
  const { copied, copy } = useCopied(1600);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [list, scheme] = await Promise.all([
          api.listMyRenders(),
          // Failing is ordinary — a customer account has no shop of its own — and null
          // is the cautious answer anyway, so this must not fail the page.
          api.getMyShadeCodeScheme().catch(() => null),
        ]);
        if (cancelled) return;
        setRenders(list);
        setCodeScheme(scheme);
        // Freshly signed URLs, so anything that had expired is worth trying again.
        setBrokenIds(new Set());
        setSelectedId((current) =>
          current && list.some((r) => r.id === current) ? current : (list[0]?.id ?? null),
        );
      } catch (e) {
        if (!cancelled) {
          setRenders((existing) => existing ?? []);
          setError(e instanceof Error ? e.message : "Could not load your images.");
        }
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloads]);

  const refresh = useCallback(() => {
    setError(null);
    setRefreshing(true);
    setReloads((n) => n + 1);
  }, []);

  /**
   * The shelf after the search box.
   *
   * Matched against everything a person might remember about a picture — the room, how
   * it was rendered, and the colours in it — because "the green one" and "the bedroom"
   * are both things somebody types, and only one of them is the project's name.
   */
  const visible = useMemo(() => {
    if (!renders) return [];
    if (!query.trim()) return renders;
    return renders.filter((r) =>
      matchesQuery(
        query,
        r.projectName,
        r.roomType,
        r.comboTitle,
        describeRender(r),
        r.note,
        ...r.shades.flatMap((s) => [s.regionLabel, s.shadeName, s.shadeCode, s.hvCode]),
      ),
    );
  }, [renders, query]);

  // A search that hides the open picture would otherwise leave the detail pane showing
  // something the shelf above it no longer lists.
  useEffect(() => {
    if (visible.length === 0) return;
    setSelectedId((current) =>
      current && visible.some((r) => r.id === current) ? current : visible[0]!.id,
    );
  }, [visible]);

  const selected = useMemo(
    () => renders?.find((r) => r.id === selectedId) ?? null,
    [renders, selectedId],
  );

  const markBroken = useCallback((id: string) => {
    setBrokenIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  /**
   * Save the picture itself.
   *
   * The plain JPEG is what most people came for — it goes into a WhatsApp message to a
   * painter or a spouse — so it is the primary action, and it is the one that has to be
   * dependable. See {@link downloadRemoteImage} for why an anchor was not.
   */
  const downloadImage = useCallback(
    async (render: MyRender) => {
      if (saveBusy) return;
      const url = resolveMediaUrl(render.imageUrl) ?? "";
      if (!url) {
        setError("That image has no link on record. Refresh the page and try again.");
        return;
      }
      setSaveBusy(render.id);
      setError(null);
      try {
        const saved = await downloadRemoteImage(
          url,
          `huevista-ai-image-${slug(render.projectName)}-${stamp(render)}`,
        );
        if (!saved) {
          // Opening it is what the old button did by accident. As a LAST resort it is
          // still a picture on screen that the browser's own save can reach, which
          // beats a button that appears to do nothing.
          window.open(url, "_blank", "noopener,noreferrer");
          setError(
            "Could not save the file directly, so it opened in a new tab — press and "
            + "hold, or right-click, to save it from there. If it did not open, your "
            + "link may have expired: refresh and try again.",
          );
        }
      } finally {
        setSaveBusy(null);
      }
    },
    [saveBusy],
  );

  /**
   * One image, one A4 sheet: the picture, the shades it was made in, and the footer
   * saying where those codes can be read.
   *
   * The JPEG is re-encoded through a canvas rather than embedded as downloaded, because
   * the stored render may be a PNG and the PDF's image path is DCTDecode — the same
   * conversion the board already does. It resolves to "" on every failure there is
   * (a 404, a blocked fetch, a canvas tainted because the host served no CORS header)
   * rather than throwing, so the failure that reaches the customer here is a sentence
   * and not a dead button.
   */
  const downloadPdf = useCallback(
    async (render: MyRender) => {
      if (pdfBusy) return;
      setPdfBusy(render.id);
      setError(null);
      try {
        const jpeg = await imageUrlToJpegDataUrl(resolveMediaUrl(render.imageUrl) ?? "");
        if (!jpeg) {
          setError(
            "Could not read that image, so the PDF would have been empty. Its link may "
            + "have expired — refresh and try again. The picture itself still saves on "
            + "its own.",
          );
          return;
        }
        const blob = buildAiImagePdf(
          {
            jpegDataUrl: jpeg,
            shades: printableShades(codeScheme, render.shades),
            caption: describeRender(render),
          },
          render.projectName || "HueVista AI image",
          codesAreUniversal(codeScheme),
        );
        downloadBlob(blob, `huevista-ai-image-${slug(render.projectName)}-${stamp(render)}.pdf`);
      } catch {
        setError("Could not build the PDF on this device. The image itself still saves.");
      } finally {
        setPdfBusy(null);
      }
    },
    [codeScheme, pdfBusy],
  );

  if (renders === null) {
    return (
      <div className="hv-imgs-loading">
        <Spinner /> <span>Finding your images…</span>
      </div>
    );
  }

  if (renders.length === 0) {
    return (
      <div className="hv-imgs">
        <Header count={0} />
        <div className="hv-imgs-empty">
          <p className="hv-imgs-empty-title">No AI images yet.</p>
          <Lead style={{ maxWidth: "52ch" }}>
            An AI image is made from a combination on one of your colour boards — so pick
            your colours in the studio, download the board, and the image is the step after
            it. Every one you make will be here.
          </Lead>
          <div className="hv-imgs-actions">
            <LinkButton href="/render" variant="brass">
              Choose a finished room <span className="arr">→</span>
            </LinkButton>
            <LinkButton href="/dashboard" variant="ghost">
              Go to my rooms
            </LinkButton>
          </div>
        </div>
        {error && <ErrorNote message={error} onDismiss={() => setError(null)} onRefresh={refresh} />}
        <Styles />
      </div>
    );
  }

  const shades = selected ? printableShades(codeScheme, selected.shades) : [];

  return (
    <div className="hv-imgs">
      <Header count={renders.length} />

      {/* Only once the shelf is long enough to be worth searching. Below that the
          filmstrip IS the index, and a search box over four pictures is furniture. */}
      {renders.length > 5 && (
        <FilterBar
          query={query}
          onQueryChange={setQuery}
          searchPlaceholder="Search by room, colour or shade code"
          searchLabel="Search your AI images"
          shown={visible.length}
          total={renders.length}
          noun="image"
        />
      )}

      <section className="hv-imgs-body">
        {/* The shelf. One button per picture, because choosing one is the whole
            interaction and a grid of links would take the reader off the page.

            Toggle buttons in a group, NOT role="radiogroup"/role="radio". That pattern
            is a promise of arrow-key navigation over a single tab stop, and none was
            implemented here: a screen-reader user was told "radio button, 3 of 9",
            pressed the arrow keys the announcement invites, and nothing moved. Pressed
            buttons make the same state audible while describing what the keyboard
            actually does — Tab between them, Space or Enter to choose. */}
        {visible.length === 0 ? (
          <p className="hv-imgs-none">
            Nothing matches “{query.trim()}”.{" "}
            <button type="button" className="hv-imgs-link" onClick={() => setQuery("")}>
              Show all {renders.length} images
            </button>
          </p>
        ) : (
          <div className="hv-imgs-grid" role="group" aria-label="Your AI images">
            {visible.map((r, i) => (
              <ShelfCard
                key={r.id}
                render={r}
                index={i}
                selected={r.id === selectedId}
                broken={brokenIds.has(r.id)}
                onSelect={() => setSelectedId(r.id)}
                onBroken={() => markBroken(r.id)}
              />
            ))}
          </div>
        )}

        {selected && (
          <div className="hv-imgs-detail">
            <Stage
              render={selected}
              broken={brokenIds.has(selected.id)}
              onBroken={() => markBroken(selected.id)}
              onRefresh={refresh}
              refreshing={refreshing}
            />

            <h2 className="hv-imgs-detail-name">{selected.projectName}</h2>
            {/* What the picture was made with, as facts rather than as a sentence.
                Six settings joined by middots is a line nobody reads to the end of —
                it looks like one long grey caption, and the two people who care which
                lighting was used have to parse the whole thing to find it. The same
                words as chips are scanned instead of read, and the difference costs no
                new label: they are still whatever describeRender says, split on the
                separator it already joins them with. */}
            <p className="hv-imgs-detail-meta">
              {[
                ...describeRender(selected).split(" · "),
                FURNISHING_LABELS[selected.furnishing] ?? selected.furnishing,
                ...(selected.createdAt ? [formatDate(selected.createdAt)] : []),
              ].map((part, i) => (
                <span key={i} className="hv-imgs-fact">
                  {part}
                </span>
              ))}
            </p>
            {selected.note && <p className="hv-imgs-detail-note">“{selected.note}”</p>}

            {/* The two things people actually came for, first and unmistakable: the
                picture as a file, and the sheet a painter can read. Everything else is
                a way back into the product and can wait its turn below. */}
            <div className="hv-imgs-actions">
              <Button
                variant="brass"
                disabled={saveBusy === selected.id}
                onClick={() => void downloadImage(selected)}
              >
                {saveBusy === selected.id ? "Saving…" : "Download the image"}
              </Button>
              <Button
                variant="ghost"
                disabled={pdfBusy === selected.id}
                onClick={() => void downloadPdf(selected)}
              >
                {pdfBusy === selected.id ? "Building your PDF…" : "Download as PDF"}
              </Button>
            </div>
            <p className="hv-imgs-pdf-note">
              The PDF is one page: this image with its shades and their codes, so whoever
              is doing the painting can read them.
            </p>

            {/* The colours, so the picture can be acted on without opening the PDF —
                and copyable, because the next place these numbers go is a message to a
                painter or a shop's counter, and reading them off a screen to retype
                them is where a 7112 becomes a 7121. */}
            {shades.length > 0 ? (
              <div className="hv-imgs-shades-block">
                <div className="hv-imgs-shades-head">
                  <h3 className="hv-imgs-shades-title">The colours in this picture</h3>
                  <button
                    type="button"
                    className="hv-imgs-copy hv-imgs-copy-all"
                    onClick={() => copy("all", shadeList(shades, selected.projectName))}
                  >
                    {copied === "all" ? "Copied ✓" : "Copy all"}
                  </button>
                </div>
                <ul className="hv-imgs-shades">
                  {shades.map((s, i) => {
                    const line = shadeLine(s);
                    return (
                      <li key={i}>
                        <span className="hv-imgs-chip" style={{ background: s.hex }} aria-hidden />
                        <span className="hv-imgs-shade-label">{s.label}</span>
                        <span className="hv-imgs-shade-name">{s.name}</span>
                        <span className="hv-imgs-shade-right">
                          {s.code && <span className="hv-imgs-shade-code">Shade No. {s.code}</span>}
                          <button
                            type="button"
                            className="hv-imgs-copy"
                            onClick={() => copy(`shade-${i}`, line)}
                            aria-label={`Copy ${line}`}
                          >
                            {copied === `shade-${i}` ? "Copied ✓" : "Copy"}
                          </button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <p className="hv-imgs-detail-note">
                The colour board this was made from has since been removed, so its shades
                aren&apos;t on record any more. The image is still yours to download.
              </p>
            )}

            <div className="hv-imgs-actions hv-imgs-actions-quiet">
              <Link
                className="btn btn-ghost btn-sm"
                href={`/render?project=${encodeURIComponent(selected.projectId)}`}
              >
                Another of this room
              </Link>
              <Link
                className="btn btn-ghost btn-sm"
                href={`/studio?project=${encodeURIComponent(selected.projectId)}`}
              >
                Open the room
              </Link>
            </div>
          </div>
        )}
      </section>

      {error && <ErrorNote message={error} onDismiss={() => setError(null)} onRefresh={refresh} />}
      <Styles />
    </div>
  );
}

/**
 * One picture in the filmstrip.
 *
 * Scrolls itself back into view when it becomes the chosen one, because on a phone the
 * strip is wider than the screen and the selection can be moved by something other than
 * a tap — the search box narrowing the shelf, or the first load choosing the newest.
 * Nothing is scrolled when the card is already visible.
 */
function ShelfCard({
  render,
  index,
  selected,
  broken,
  onSelect,
  onBroken,
}: {
  render: MyRender;
  /** Position in the shelf, purely so the cards deal in rather than appearing at once.
   *  Capped where it is used: past a dozen a stagger stops reading as a deal and starts
   *  reading as a page that is slow to load. */
  index: number;
  selected: boolean;
  broken: boolean;
  onSelect: () => void;
  onBroken: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!selected) return;
    ref.current?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [selected]);

  const src = resolveMediaUrl(render.imageUrl) ?? "";

  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={selected}
      className={`hv-imgs-card${selected ? " is-on" : ""}`}
      style={{ animationDelay: `${Math.min(index, 11) * 40}ms` }}
      onClick={onSelect}
    >
      {/* The picture inside its own frame rather than as a bare child, so it can be
          scaled on hover with the frame clipping it. A thumbnail that grows past its
          own edges shoves the card next to it, which on a strip of nine is a whole
          row moving because a pointer crossed one of them. */}
      <span className="hv-imgs-card-frame">
        {broken || !src ? (
          <span className="hv-imgs-card-gone" aria-hidden>
            <BrokenIcon />
          </span>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={src} alt="" loading="lazy" onError={onBroken} />
        )}
      </span>
      <span className="hv-imgs-card-name">{render.projectName}</span>
      <span className="hv-imgs-card-meta">{describeRender(render)}</span>
    </button>
  );
}

/**
 * The big picture, or an explanation of why there isn't one.
 *
 * A presigned URL lives about an hour. Past that the browser gets a 403 and an `<img>`
 * shows nothing at all — no icon, no message, just a frame the size of the picture that
 * was there when the tab was opened. The state is recoverable and always by the same
 * move, so it says which move.
 */
function Stage({
  render,
  broken,
  onBroken,
  onRefresh,
  refreshing,
}: {
  render: MyRender;
  broken: boolean;
  onBroken: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const src = resolveMediaUrl(render.imageUrl) ?? "";
  const [loaded, setLoaded] = useState(false);

  // A different picture is a different load; without this the spinner would be skipped
  // for every image after the first.
  useEffect(() => setLoaded(false), [src]);

  if (broken || !src) {
    return (
      <div className="hv-imgs-stage is-gone">
        <BrokenIcon />
        <p className="hv-imgs-stage-msg">
          This picture didn&apos;t load. Links to your images are re-issued every hour, so
          one left open on screen goes stale — refreshing fetches a new one.
        </p>
        <Button variant="ghost" size="sm" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? "Refreshing…" : "Refresh my images"}
        </Button>
      </div>
    );
  }

  return (
    <div className="hv-imgs-stage">
      {!loaded && (
        <div className="hv-imgs-stage-wait">
          <Spinner /> <span>Loading the picture…</span>
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={`${render.projectName}, rendered`}
        onLoad={() => setLoaded(true)}
        onError={onBroken}
        style={loaded ? undefined : { visibility: "hidden", position: "absolute" }}
      />
    </div>
  );
}

/**
 * The one place a failure is reported.
 *
 * Dismissable and offering the refresh, because almost everything that goes wrong on
 * this page is an expired link, and a message that only states the problem leaves the
 * reader holding it.
 */
function ErrorNote({
  message,
  onDismiss,
  onRefresh,
}: {
  message: string;
  onDismiss: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="hv-imgs-error" role="alert">
      <p>{message}</p>
      <span className="hv-imgs-error-acts">
        <button type="button" className="hv-imgs-link" onClick={onRefresh}>
          Refresh my images
        </button>
        <button type="button" className="hv-imgs-link" onClick={onDismiss}>
          Dismiss
        </button>
      </span>
    </div>
  );
}

function BrokenIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="m3 15 4.5-4.5 3.5 3.5M21 13l-3-3-2.5 2.5" strokeLinecap="round" />
      <circle cx="15.5" cy="8.5" r="1.2" />
    </svg>
  );
}

/** "Walls — Ivory Mist · Shade No. 7112" — one shade as a line somebody can paste. */
function shadeLine(s: { label: string; name: string; code?: string }): string {
  return [s.label, s.name, s.code ? `Shade No. ${s.code}` : ""]
    .filter(Boolean)
    .join(" — ")
    .replace(" — Shade No.", " · Shade No.");
}

/** Every shade under a heading, for the message that goes to the painter. */
function shadeList(
  shades: Array<{ label: string; name: string; code?: string }>,
  projectName: string,
): string {
  return [`${projectName || "HueVista"} — colours`, ...shades.map((s) => `• ${shadeLine(s)}`)]
    .join("\n");
}

function Header({ count }: { count: number }) {
  return (
    <header className="hv-imgs-head">
      {/* See .hv-aura in globals.css. It matters more here than anywhere: this page is
          a wall of photographs, and the wash stays strictly behind the words so it never
          sits under a picture of a painted wall and changes what that colour looks
          like. */}
      <div className="hv-aura" aria-hidden />
      <Eyebrow className="hv-rise">My AI images</Eyebrow>
      <h1 className="display hv-rise hv-rise-1">
        Every room you have <i>seen for real.</i>
      </h1>
      <Lead className="hv-rise hv-rise-2" style={{ maxWidth: "58ch" }}>
        {count === 0 ? (
          "The photorealistic images you make from your colour boards collect here."
        ) : (
          <>
            {/* The tally counts itself up. It is the one number on the page and the
                first thing somebody checks against what they remember buying, so it
                is worth a beat of attention — CountUp prints the final value outright
                on the server and under reduced motion, so nobody waits to read it. */}
            <CountUp value={count} /> image{count === 1 ? "" : "s"}, newest first.
            Download any of them on their own, or as a one-page PDF with the shades
            printed underneath.
          </>
        )}
      </Lead>
      {/* The way to make ANOTHER one, on the page where somebody looking at the last one
          thinks of it. Every image is bought with an AI credit and no room includes one,
          so this is a purchase and not a leftover allowance — which is exactly why it
          belongs beside the pictures rather than buried in a room. */}
      {count > 0 && (
        <div className="hv-imgs-head-go hv-rise hv-rise-3">
          <LinkButton href="/render" variant="brass">
            Make a new image <span className="arr">→</span>
          </LinkButton>
        </div>
      )}
    </header>
  );
}

/** "sunlit-living-room" — a filename fragment, not a URL slug; bounded so a long room
 *  name cannot push the download past what a filesystem will take. */
function slug(name: string): string {
  const out = (name || "room")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return (out || "room").slice(0, 40);
}

/** The date the image was made, so two downloads of the same room do not collide in a
 *  downloads folder — and so the file says which one it is a month later. */
function stamp(render: MyRender): string {
  const iso = render.completedAt ?? render.createdAt;
  const d = iso ? new Date(iso) : new Date();
  return Number.isNaN(d.getTime())
    ? String(Date.now())
    : d.toISOString().slice(0, 10).replace(/-/g, "");
}

function Styles() {
  return (
    <style>{`
      .hv-imgs { max-width: 1180px; position: relative; }

      /* ── The header ────────────────────────────────────────────────────────
         One drifting wash behind the words and nothing anywhere else: the rest of
         this page is photographs, and a tinted ground under a photograph changes
         what the photograph looks like — which on a page whose whole job is showing
         somebody the colour they chose is a thing that must not happen. */
      .hv-imgs-head { position: relative; margin-bottom: 28px; }
      .hv-imgs-head > *:not(.hv-aura) { position: relative; z-index: 1; }
      .hv-imgs-head-go { margin-top: 18px; }
      .hv-imgs-head .display { font-size: clamp(30px, 4.4vw, 52px); margin: 12px 0 14px; }
      .hv-imgs-loading {
        display: flex; align-items: center; gap: 10px;
        padding: 80px 0; color: var(--fg-soft); font: 400 15px/1.4 var(--sans);
      }
      .hv-imgs-body {
        display: grid; grid-template-columns: minmax(0, 320px) minmax(0, 1fr); gap: 28px;
        align-items: start;
      }
      @media (max-width: 900px) { .hv-imgs-body { grid-template-columns: 1fr; } }

      /* ── The shelf ─────────────────────────────────────────────────────────
         The cards were 4px-cornered rectangles with a hairline that changed on hover
         and an inset ring when chosen: correct, and indistinguishable from a file
         list. They carry the same card language as the rest of the customer's
         screens now — the generous radius, one wash of accent from a corner — and
         the chosen one is stated by a lit rail down its edge rather than by a border
         colour that has to be compared against its neighbours to be seen. */
      .hv-imgs-grid { display: grid; gap: 10px; align-content: start; }
      .hv-imgs-card {
        position: relative; display: grid; gap: 6px; padding: 8px; text-align: left;
        cursor: pointer; overflow: hidden;
        background: var(--surface); border: 1px solid var(--rule);
        border-radius: calc(var(--radius) * 1.2);
        transition: border-color .25s var(--ease), transform .25s var(--ease),
                    background .25s var(--ease);
        animation: hv-imgs-deal .5s var(--ease) both;
      }
      @keyframes hv-imgs-deal {
        from { opacity: 0; transform: translateY(12px); }
        to   { opacity: 1; transform: none; }
      }
      .hv-imgs-card:hover { border-color: var(--rule-strong); transform: translateY(-2px); }
      .hv-imgs-card.is-on {
        border-color: var(--rule-brass);
        background:
          radial-gradient(120% 90% at 0% 0%, rgba(124,92,255,.10), transparent 62%),
          var(--surface);
      }
      /* The rail. Grows from the top down when the card is chosen, so which one is open
         is answered by the one thing on the shelf that is moving. */
      .hv-imgs-card::after {
        content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 2px;
        background: var(--accent); transform: scaleY(0); transform-origin: top;
        transition: transform .3s var(--ease);
      }
      .hv-imgs-card.is-on::after { transform: scaleY(1); }
      .hv-imgs-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
      .hv-imgs-card-frame {
        display: block; overflow: hidden; border-radius: var(--radius);
        background: var(--surface-soft);
      }
      .hv-imgs-card img {
        display: block; width: 100%; height: 128px; object-fit: cover;
        transition: transform .45s var(--ease);
      }
      .hv-imgs-card:hover img { transform: scale(1.05); }
      .hv-imgs-card-gone {
        display: grid; place-items: center; width: 100%; height: 128px;
        color: var(--fg-mute);
      }
      .hv-imgs-card-name {
        font: 500 14px/1.25 var(--sans); color: var(--fg);
        transition: color .25s var(--ease);
      }
      .hv-imgs-card.is-on .hv-imgs-card-name { color: var(--accent-text); }
      .hv-imgs-card-meta { font: 400 12px/1.25 var(--sans); color: var(--fg-soft); }

      /* On a phone the shelf becomes a filmstrip: one row, scrolled sideways, with the
         picture directly beneath it. As a two-column grid it pushed the picture off the
         bottom of the screen, so a tap changed something the reader could not see. */
      @media (max-width: 900px) {
        .hv-imgs-grid {
          grid-auto-flow: column; grid-auto-columns: 148px; overflow-x: auto;
          scroll-snap-type: x proximity; padding-bottom: 6px;
          /* Bleed to the screen edges so the last card is visibly cut off — the one
             reliable hint that a horizontal scroller scrolls. */
          margin-inline: calc(var(--gutter) * -1); padding-inline: var(--gutter);
          scrollbar-width: thin;
        }
        .hv-imgs-card { scroll-snap-align: start; }
        .hv-imgs-card img, .hv-imgs-card-gone { height: 92px; }
        .hv-imgs-card-meta { display: none; }
      }

      .hv-imgs-detail {
        display: grid; gap: 12px; justify-items: start;
        animation: hv-rise .5s var(--ease) both;
      }

      /* ── The stage ─────────────────────────────────────────────────────────
         The picture is what the customer paid for, so it is hung rather than
         placed: a card in the same language as everything else, a lit hairline
         along the top edge, and the image inset far enough from the frame to read
         as mounted. The wash sits BEHIND the picture and never over it — a tint
         across a photograph of a painted wall would be lying about the colour. */
      .hv-imgs-stage {
        position: relative; width: 100%; display: grid; place-items: center;
        min-height: 200px; padding: 14px; overflow: hidden;
        border: 1px solid var(--rule);
        border-radius: calc(var(--radius) * 1.6);
        background:
          radial-gradient(120% 90% at 100% 0%, rgba(124,92,255,.09), transparent 62%),
          var(--surface-soft);
      }
      .hv-imgs-stage::before {
        content: ""; position: absolute; inset: 0 0 auto; height: 1px;
        background: linear-gradient(90deg, transparent, var(--rule-brass), transparent);
      }
      .hv-imgs-stage img {
        max-width: 100%; height: auto; display: block;
        border-radius: var(--radius);
        /* Fades up as it decodes rather than snapping in at full size, which on a
           large JPEG over a slow line is the difference between a picture arriving
           and a page jolting. */
        animation: hv-imgs-develop .5s var(--ease) both;
      }
      @keyframes hv-imgs-develop {
        from { opacity: 0; transform: scale(.985); }
        to   { opacity: 1; transform: none; }
      }
      .hv-imgs-stage.is-gone {
        gap: 12px; padding: 40px 20px; text-align: center; color: var(--fg-mute);
      }
      .hv-imgs-stage-msg {
        margin: 0; max-width: 46ch; color: var(--fg-soft); font: 400 13px/1.5 var(--sans);
      }
      .hv-imgs-stage-wait {
        display: flex; align-items: center; gap: 10px; padding: 60px 0;
        color: var(--fg-soft); font: 400 14px/1.4 var(--sans);
      }
      .hv-imgs-detail-name {
        font: 600 26px/1.2 var(--serif); color: var(--fg); margin: 6px 0 0;
        letter-spacing: -.015em;
      }
      .hv-imgs-detail-meta {
        display: flex; flex-wrap: wrap; gap: 6px; margin: 2px 0 0;
      }
      .hv-imgs-fact {
        padding: 4px 10px; border-radius: var(--radius-pill);
        border: 1px solid var(--rule); background: var(--surface);
        font: 400 12.5px/1.4 var(--sans); color: var(--fg-soft);
      }
      .hv-imgs-detail-note {
        font: 400 13px/1.5 var(--sans); color: var(--fg-soft); margin: 0; max-width: 56ch;
      }

      .hv-imgs-shades-block {
        width: 100%; margin-top: 8px; padding-top: 14px; border-top: 1px solid var(--rule);
      }
      .hv-imgs-shades-head {
        display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
        margin-bottom: 8px;
      }
      .hv-imgs-shades-title {
        margin: 0; font: 400 12px/1 var(--mono); letter-spacing: .2em;
        text-transform: uppercase; color: var(--fg-mute);
      }
      .hv-imgs-shades { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; width: 100%; }
      /* Rows rather than ruled lines. The colours are the actionable half of this page —
         they are what gets read out at a paint counter — and a row that lights under the
         pointer says "this one" while the Copy button beside it is being aimed at. The
         padding is what makes that highlight a band rather than a smear. */
      .hv-imgs-shades li {
        display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
        padding: 8px 10px; margin: 0 -10px; border-radius: var(--radius);
        border-bottom: 1px solid var(--rule);
        transition: background .2s var(--ease);
      }
      .hv-imgs-shades li:last-child { border-bottom: 0; }
      .hv-imgs-shades li:hover { background: var(--surface); }
      /* The swatch is the one place on the page a colour is shown at full strength, so
         it gets a ring rather than a border — a hairline of the page showing between the
         colour and its outline, which stops a dark shade from bleeding into a dark rule
         and reading as a smaller swatch than it is. */
      .hv-imgs-chip {
        width: 36px; height: 22px; border-radius: 5px; flex: none;
        box-shadow: 0 0 0 1px var(--bg), 0 0 0 2px var(--rule-strong);
      }
      .hv-imgs-shade-label { font: 500 13px/1.2 var(--sans); color: var(--fg); min-width: 96px; }
      .hv-imgs-shade-name { font: 400 13px/1.2 var(--sans); color: var(--fg); }
      .hv-imgs-shade-code { font: 400 12px/1.2 var(--mono); color: var(--fg-soft); }
      .hv-imgs-shade-right {
        display: flex; align-items: center; gap: 10px; margin-left: auto; flex-wrap: wrap;
      }
      .hv-imgs-copy {
        flex: none; border: 1px solid var(--rule-strong); border-radius: 4px;
        background: transparent; color: var(--fg-soft); cursor: pointer;
        font: 400 11px/1 var(--mono); letter-spacing: .12em; text-transform: uppercase;
        /* 28px tall reads as a small control but is still a comfortable tap target
           beside a 34px swatch. */
        padding: 8px 10px; min-height: 28px;
      }
      .hv-imgs-copy:hover { border-color: var(--accent); color: var(--accent); }
      .hv-imgs-copy:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

      .hv-imgs-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 6px; }
      .hv-imgs-actions-quiet { margin-top: 4px; }
      .hv-imgs-pdf-note { font: 400 12px/1.5 var(--sans); color: var(--fg-soft); margin: 0; max-width: 56ch; }

      .hv-imgs-none { font: 400 14px/1.5 var(--sans); color: var(--fg-soft); margin: 0; }
      .hv-imgs-link {
        border: none; background: none; padding: 0; cursor: pointer; color: var(--accent);
        font: inherit; text-decoration: underline; text-underline-offset: 2px;
      }

      /* An account with no pictures gets the only screen here with nothing to look at,
         so the empty state is given the card treatment the pictures would have had —
         otherwise the page a new customer sees first is the flattest one we have. */
      .hv-imgs-empty {
        position: relative; overflow: hidden;
        display: grid; gap: 14px; justify-items: start;
        margin-bottom: 40px; padding: 32px;
        border: 1px solid var(--rule); border-radius: calc(var(--radius) * 1.8);
        background:
          radial-gradient(110% 80% at 0% 0%, rgba(124,92,255,.07), transparent 60%),
          var(--surface);
        animation: hv-rise .6s var(--ease) .18s both;
      }
      .hv-imgs-empty::before {
        content: ""; position: absolute; inset: 0 0 auto; height: 1px;
        background: linear-gradient(90deg, transparent, var(--rule-brass), transparent);
      }
      .hv-imgs-empty-title { font: 600 19px/1.3 var(--serif); color: var(--fg); margin: 0; }
      .hv-imgs-error {
        margin-top: 20px; padding: 12px 14px; border-radius: var(--radius);
        border: 1px solid var(--danger, #b3261e); background: var(--surface);
        display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
        gap: 8px 16px;
      }
      .hv-imgs-error p {
        margin: 0; max-width: 68ch;
        font: 400 14px/1.5 var(--sans); color: var(--danger, #b3261e);
      }
      .hv-imgs-error-acts { display: flex; gap: 14px; font: 400 13px/1.4 var(--sans); }

      /* Everything above is entrance or response. Both go, and every element sits where
         it was going to end up — nothing here is load-bearing, which is the test a page
         of animation has to pass before it earns any of it. */
      @media (prefers-reduced-motion: reduce) {
        .hv-imgs-card,
        .hv-imgs-detail,
        .hv-imgs-empty,
        .hv-imgs-stage img { animation: none; }
        .hv-imgs-card, .hv-imgs-card img, .hv-imgs-card::after,
        .hv-imgs-card-name, .hv-imgs-shades li { transition: none; }
        .hv-imgs-card:hover { transform: none; }
        .hv-imgs-card:hover img { transform: none; }
      }
      /* A hover lift on a touch screen sticks after the tap: the card stays raised until
         something else is touched, which reads as a rendering fault rather than a state. */
      @media (hover: none) {
        .hv-imgs-card:hover { transform: none; }
        .hv-imgs-card:hover img { transform: none; }
      }
    `}</style>
  );
}
