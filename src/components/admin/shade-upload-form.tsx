"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { uploadShadesAction } from "@/lib/auth";
import type { ShadeUploadResult, UploadBrand } from "@/lib/api";

/** Loosely-typed shade row, straight from the uploaded JSON. */
type RawShade = Record<string, unknown>;

const ADD_NEW = "__new__";
const HEX_RE = /^#?[0-9a-fA-F]{6}$/;

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function previewHex(v: unknown): string {
  const h = str(v).trim();
  if (!HEX_RE.test(h)) return "#d9d4cc";
  return h.startsWith("#") ? h : `#${h}`;
}

export function ShadeUploadForm({ initialBrands }: { initialBrands: UploadBrand[] }) {
  const [brands, setBrands] = useState<UploadBrand[]>(initialBrands);

  const [company, setCompany] = useState(""); // "" | slug | ADD_NEW
  const [newName, setNewName] = useState("");

  const [shades, setShades] = useState<RawShade[] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ShadeUploadResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  function ingestFile(file: File) {
    setParseError(null);
    setResult(null);
    setSubmitError(null);
    setFileName(file.name);
    file
      .text()
      .then((text) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          setShades(null);
          setParseError("That file isn't valid JSON. Open it and check for a stray comma or quote.");
          return;
        }
        if (!Array.isArray(parsed)) {
          setShades(null);
          setParseError("The JSON must be an array — the top level should start with [ and end with ].");
          return;
        }
        if (parsed.length === 0) {
          setShades(null);
          setParseError("The array is empty — add at least one shade.");
          return;
        }
        if (!parsed.every((x) => x && typeof x === "object" && !Array.isArray(x))) {
          setShades(null);
          setParseError("Every item in the array must be a shade object with code, name and hex.");
          return;
        }
        setShades(parsed as RawShade[]);
      })
      .catch(() => {
        setShades(null);
        setParseError("Could not read that file. Try again.");
      });
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) ingestFile(file);
  }

  const companyChosen = company === ADD_NEW ? newName.trim().length > 0 : company.length > 0;
  const canSubmit = companyChosen && !!shades && shades.length > 0 && !pending;

  function submit() {
    if (!shades) return;
    const payload =
      company === ADD_NEW ? { brandName: newName.trim(), shades } : { brandSlug: company, shades };
    startTransition(async () => {
      setSubmitError(null);
      setResult(null);
      const res = await uploadShadesAction(payload);
      if (res.error || !res.result) {
        setSubmitError(res.error ?? "Upload failed. Please try again.");
        return;
      }
      const r = res.result;
      setResult(r);
      // Surface a newly-created company in the dropdown and select it.
      if (company === ADD_NEW) {
        setBrands((prev) =>
          prev.some((b) => b.slug === r.slug)
            ? prev
            : [...prev, { id: -1, name: r.brand, slug: r.slug }].sort((a, b) => a.name.localeCompare(b.name)),
        );
        setCompany(r.slug);
        setNewName("");
      }
    });
  }

  return (
    <div style={{ marginTop: 40 }}>
      {/* Step 1 — company */}
      <section style={{ marginBottom: 32 }}>
        <label htmlFor="company" style={labelStyle}>
          1 · Company
        </label>
        <select
          id="company"
          value={company}
          onChange={(e) => {
            setCompany(e.target.value);
            setResult(null);
          }}
          style={inputStyle}
        >
          <option value="">Select a company…</option>
          {brands.map((b) => (
            <option key={b.slug} value={b.slug}>
              {b.name}
            </option>
          ))}
          <option value={ADD_NEW}>➕ Add a new company…</option>
        </select>

        {company === ADD_NEW && (
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New company name, e.g. Berger"
            aria-label="New company name"
            style={{ ...inputStyle, marginTop: 10 }}
          />
        )}
      </section>

      {/* Step 2 — file */}
      <section style={{ marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <label style={labelStyle}>2 · Shades file (JSON array)</label>
          <a
            href="/samples/shade-upload-sample.json"
            download
            style={{ font: "500 13px/1 var(--mono)", color: "var(--accent-soft)", textDecoration: "underline" }}
          >
            ↓ Download sample file
          </a>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) ingestFile(file);
          }}
          style={{ display: "none" }}
        />

        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          style={{
            marginTop: 10,
            padding: "32px 20px",
            border: `1.5px dashed ${dragging ? "var(--accent)" : "var(--rule-strong)"}`,
            background: dragging ? "color-mix(in srgb, var(--accent) 6%, var(--surface))" : "var(--surface)",
            textAlign: "center",
            cursor: "pointer",
            transition: "border-color .15s, background .15s",
          }}
        >
          <p style={{ font: "500 15px/1.4 var(--serif)", color: "var(--fg)" }}>
            {fileName ? fileName : "Drop your .json file here, or click to choose"}
          </p>
          <p style={{ ...hintStyle, marginTop: 6 }}>A JSON array — each item needs at least code, name and hex.</p>
        </div>

        {parseError && (
          <p className="field-error" role="alert" style={{ marginTop: 12 }}>
            {parseError}
          </p>
        )}
      </section>

      {/* Preview */}
      {shades && shades.length > 0 && (
        <section style={{ marginTop: 20 }}>
          <p style={{ font: "500 14px/1.4 var(--mono)", color: "var(--fg)", marginBottom: 12 }}>
            {shades.length} shade{shades.length === 1 ? "" : "s"} detected
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {shades.slice(0, 24).map((s, i) => (
              <div key={i} title={`${str(s.name)} · ${str(s.code)}`} style={{ width: 64 }}>
                <div
                  style={{
                    height: 44,
                    borderRadius: 4,
                    background: previewHex(s.hex),
                    border: "1px solid var(--rule)",
                  }}
                />
                <p style={{ font: "400 10px/1.3 var(--mono)", color: "var(--fg-mute)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {str(s.name) || str(s.code) || "—"}
                </p>
              </div>
            ))}
            {shades.length > 24 && (
              <div style={{ alignSelf: "center", font: "400 12px/1 var(--mono)", color: "var(--fg-mute)" }}>
                +{shades.length - 24} more
              </div>
            )}
          </div>
        </section>
      )}

      {/* Submit */}
      <div style={{ marginTop: 32, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <Button onClick={() => submit()} disabled={!canSubmit} variant="brass">
          {pending ? (
            <>
              <Spinner size={14} color="currentColor" decorative /> Uploading…
            </>
          ) : (
            <>
              Upload shades <span className="arr">→</span>
            </>
          )}
        </Button>
        {!companyChosen && <span style={hintStyle}>Choose a company first.</span>}
        {companyChosen && (!shades || shades.length === 0) && <span style={hintStyle}>Add a JSON file to upload.</span>}
      </div>

      {submitError && (
        <p className="field-error" role="alert" style={{ marginTop: 16 }}>
          {submitError}
        </p>
      )}

      {result && (
        <div
          role="status"
          style={{
            marginTop: 24,
            padding: "18px 20px",
            border: "1px solid var(--rule-strong)",
            background: "var(--surface)",
          }}
        >
          <p style={{ font: "600 16px/1.4 var(--serif)", color: "var(--fg)" }}>
            <span aria-hidden style={{ color: "var(--accent)" }}>✓</span> Uploaded to {result.brand}
          </p>
          <p style={{ ...hintStyle, marginTop: 6 }}>
            {result.inserted} added · {result.skipped} skipped (already present) · {result.total} in file
          </p>
        </div>
      )}

      {/* Format help */}
      <details style={{ marginTop: 40, borderTop: "1px solid var(--rule)", paddingTop: 20 }}>
        <summary style={{ cursor: "pointer", font: "500 14px/1 var(--mono)", color: "var(--fg-mute)" }}>
          Expected JSON format
        </summary>
        <p style={{ ...hintStyle, marginTop: 12 }}>
          A plain array. <strong style={{ color: "var(--fg)" }}>code</strong>,{" "}
          <strong style={{ color: "var(--fg)" }}>name</strong> and{" "}
          <strong style={{ color: "var(--fg)" }}>hex</strong> are required; the rest are optional.
        </p>
        <pre
          style={{
            marginTop: 12,
            padding: 16,
            background: "var(--surface)",
            border: "1px solid var(--rule)",
            overflowX: "auto",
            font: "400 12px/1.55 var(--mono)",
            color: "var(--fg)",
          }}
        >
{`[
  {
    "code": "9436",
    "name": "Air Breeze",
    "hex": "#F3EDE8",
    "family": "Off Whites",
    "colorTemperature": "cool",
    "tonality": "light",
    "featureTag": "Recommended",
    "popularity": 1,
    "suitableRooms": ["living room", "bedroom"],
    "pageUrl": "https://example.com/shades/air-breeze"
  }
]`}
        </pre>
      </details>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  font: "600 13px/1 var(--mono)",
  letterSpacing: ".04em",
  textTransform: "uppercase",
  color: "var(--fg-mute)",
  marginBottom: 10,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  border: "1px solid var(--rule-strong)",
  background: "var(--surface)",
  color: "var(--fg)",
  font: "400 15px/1.3 var(--serif)",
};

const hintStyle: React.CSSProperties = {
  font: "400 13px/1.5 var(--serif)",
  color: "var(--fg-mute)",
};
