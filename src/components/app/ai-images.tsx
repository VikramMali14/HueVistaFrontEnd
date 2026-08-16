"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, LinkButton } from "@/components/ui/button";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/dates";
import { downloadBlob } from "@/lib/download-blob";
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
 */
export function AiImages() {
  const [renders, setRenders] = useState<MyRender[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The id currently being turned into a PDF — so one spinner cannot claim two cards. */
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  /**
   * The shop's customer-facing code pattern. Null means "not loaded, or this account has
   * no shop behind it", and null is read strictly: the manufacturer's codes stay hidden.
   * Same rule the studio and the render page follow — see printableShades.
   */
  const [codeScheme, setCodeScheme] = useState<ShadeCodeScheme | null>(null);

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
        setSelectedId(list[0]?.id ?? null);
      } catch (e) {
        if (!cancelled) {
          setRenders([]);
          setError(e instanceof Error ? e.message : "Could not load your images.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(
    () => renders?.find((r) => r.id === selectedId) ?? null,
    [renders, selectedId],
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
            "Could not read that image on this device, so the PDF would have been empty. "
            + "The image itself still downloads.",
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
        setError("Could not build the PDF on this device. The image itself still downloads.");
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
          <LinkButton href="/dashboard" variant="brass">
            Go to my rooms <span className="arr">→</span>
          </LinkButton>
        </div>
        {error && <p className="hv-imgs-error" role="alert">{error}</p>}
        <Styles />
      </div>
    );
  }

  return (
    <div className="hv-imgs">
      <Header count={renders.length} />

      <section className="hv-imgs-body">
        {/* The shelf. One button per picture, because choosing one is the whole
            interaction and a grid of links would take the reader off the page. */}
        <div className="hv-imgs-grid" role="radiogroup" aria-label="Your AI images">
          {renders.map((r) => (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={r.id === selectedId}
              className={`hv-imgs-card${r.id === selectedId ? " is-on" : ""}`}
              onClick={() => setSelectedId(r.id)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={resolveMediaUrl(r.imageUrl) ?? ""} alt="" loading="lazy" />
              <span className="hv-imgs-card-name">{r.projectName}</span>
              <span className="hv-imgs-card-meta">{describeRender(r)}</span>
            </button>
          ))}
        </div>

        {selected && (
          <div className="hv-imgs-detail">
            <div className="hv-imgs-stage">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveMediaUrl(selected.imageUrl) ?? ""}
                alt={`${selected.projectName}, rendered`}
              />
            </div>

            <h2 className="hv-imgs-detail-name">{selected.projectName}</h2>
            <p className="hv-imgs-detail-meta">
              {describeRender(selected)}
              {" · "}
              {FURNISHING_LABELS[selected.furnishing] ?? selected.furnishing}
              {selected.createdAt ? ` · ${formatDate(selected.createdAt)}` : ""}
            </p>
            {selected.note && <p className="hv-imgs-detail-note">“{selected.note}”</p>}

            {/* The colours, so the picture can be acted on without opening the PDF. */}
            {selected.shades.length > 0 ? (
              <ul className="hv-imgs-shades">
                {printableShades(codeScheme, selected.shades).map((s, i) => (
                  <li key={i}>
                    <span className="hv-imgs-chip" style={{ background: s.hex }} aria-hidden />
                    <span className="hv-imgs-shade-label">{s.label}</span>
                    <span className="hv-imgs-shade-name">{s.name}</span>
                    {s.code && <span className="hv-imgs-shade-code">Shade No. {s.code}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hv-imgs-detail-note">
                The colour board this was made from has since been removed, so its shades
                aren&apos;t on record any more. The image is still yours to download.
              </p>
            )}

            <div className="hv-imgs-actions">
              <a
                className="btn btn-brass"
                href={resolveMediaUrl(selected.imageUrl) ?? "#"}
                download
              >
                Download the image
              </a>
              <Button
                variant="ghost"
                disabled={pdfBusy === selected.id}
                onClick={() => void downloadPdf(selected)}
              >
                {pdfBusy === selected.id ? "Building your PDF…" : "Download as PDF"}
              </Button>
              <Link
                className="btn btn-ghost"
                href={`/render?project=${encodeURIComponent(selected.projectId)}`}
              >
                Make another of this room
              </Link>
              <Link
                className="btn btn-ghost"
                href={`/studio?project=${encodeURIComponent(selected.projectId)}`}
              >
                Open the room
              </Link>
            </div>
            <p className="hv-imgs-pdf-note">
              The PDF is one page: this image with its shades and their codes, so whoever
              is doing the painting can read them.
            </p>
          </div>
        )}
      </section>

      {error && <p className="hv-imgs-error" role="alert">{error}</p>}
      <Styles />
    </div>
  );
}

function Header({ count }: { count: number }) {
  return (
    <header className="hv-imgs-head">
      <Eyebrow>My AI images</Eyebrow>
      <h1 className="display">
        Every room you have <i>seen for real.</i>
      </h1>
      <Lead style={{ maxWidth: "58ch" }}>
        {count === 0
          ? "The photorealistic images you make from your colour boards collect here."
          : `${count} image${count === 1 ? "" : "s"}, newest first. Download any of them on `
            + "their own, or as a one-page PDF with the shades printed underneath."}
      </Lead>
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
      .hv-imgs { max-width: 1180px; }
      .hv-imgs-head { margin-bottom: 28px; }
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

      .hv-imgs-grid { display: grid; gap: 10px; align-content: start; }
      @media (max-width: 900px) {
        .hv-imgs-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
      }
      .hv-imgs-card {
        display: grid; gap: 5px; padding: 8px; text-align: left; cursor: pointer;
        background: var(--surface); border: 1px solid var(--rule); border-radius: 4px;
        transition: border-color .2s var(--ease);
      }
      .hv-imgs-card:hover { border-color: var(--rule-strong); }
      .hv-imgs-card.is-on { border-color: var(--brass); box-shadow: inset 0 0 0 1px var(--brass); }
      .hv-imgs-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
      .hv-imgs-card img {
        display: block; width: 100%; height: 128px; object-fit: cover;
        border-radius: 3px; background: var(--surface-soft);
      }
      .hv-imgs-card-name { font: 500 14px/1.25 var(--sans); color: var(--fg); }
      .hv-imgs-card-meta { font: 400 12px/1.25 var(--sans); color: var(--fg-soft); }

      .hv-imgs-detail { display: grid; gap: 12px; justify-items: start; }
      .hv-imgs-stage {
        width: 100%; display: grid; place-items: center; padding: 12px;
        border: 1px solid var(--rule); background: var(--surface-soft); border-radius: 4px;
      }
      .hv-imgs-stage img { max-width: 100%; height: auto; display: block; }
      .hv-imgs-detail-name { font: 400 24px/1.2 var(--serif); color: var(--fg); margin: 4px 0 0; }
      .hv-imgs-detail-meta { font: 400 13px/1.4 var(--sans); color: var(--fg-soft); margin: 0; }
      .hv-imgs-detail-note {
        font: 400 13px/1.5 var(--sans); color: var(--fg-soft); margin: 0; max-width: 56ch;
      }

      .hv-imgs-shades { list-style: none; margin: 4px 0 0; padding: 0; display: grid; gap: 6px; width: 100%; }
      .hv-imgs-shades li {
        display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
        padding-bottom: 6px; border-bottom: 1px solid var(--rule);
      }
      .hv-imgs-chip {
        width: 34px; height: 18px; border: 1px solid var(--rule-strong); border-radius: 2px; flex: none;
      }
      .hv-imgs-shade-label { font: 500 13px/1.2 var(--sans); color: var(--fg); min-width: 96px; }
      .hv-imgs-shade-name { font: 400 13px/1.2 var(--sans); color: var(--fg); }
      .hv-imgs-shade-code { font: 400 12px/1.2 var(--mono); color: var(--fg-soft); margin-left: auto; }

      .hv-imgs-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 6px; }
      .hv-imgs-pdf-note { font: 400 12px/1.5 var(--sans); color: var(--fg-soft); margin: 0; max-width: 56ch; }

      .hv-imgs-empty { display: grid; gap: 14px; justify-items: start; padding: 24px 0 64px; }
      .hv-imgs-empty-title { font: 500 16px/1.3 var(--sans); color: var(--fg); margin: 0; }
      .hv-imgs-error { margin-top: 16px; font: 400 14px/1.4 var(--sans); color: var(--danger, #b3261e); }
    `}</style>
  );
}
