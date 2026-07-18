"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Mono } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api, HttpError } from "@/lib/api";
import { resolveMediaUrl } from "@/lib/media";
import type {
  OrgResponse,
  PaintBrand,
  PaintLine,
  ProductCategory,
  QualityTier,
  ShopProduct,
} from "@/lib/types";

const TIERS: QualityTier[] = ["ECONOMY", "PREMIUM", "LUXURY"];
const tierStars = (t?: QualityTier | null) => (t === "LUXURY" ? 5 : t === "PREMIUM" ? 4 : 2);
const tierBrightness = (t: QualityTier) => (t === "LUXURY" ? 5 : t === "PREMIUM" ? 4 : 2);
const tierLabel = (t?: QualityTier | null) =>
  t ? t.charAt(0) + t.slice(1).toLowerCase() : "—";

interface Draft {
  price: string;
  priceUnit: string;
  packSize: string;
  coverage: string;
  finish: string;
  qualityTier: QualityTier;
  brightness: number;
  /** True once the user moves the slider — stops the Quality tier from silently overriding it. */
  brightnessTouched: boolean;
  imageUrl: string;
  previewUrl: string;
  uploading: boolean;
  features: string;
  description: string;
  saving: boolean;
}

function revokeDraft(d?: Draft) {
  if (d?.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(d.previewUrl);
}

function initDraft(line: PaintLine): Draft {
  return {
    price: "",
    priceUnit: "20 L",
    packSize: "20 L",
    coverage: "",
    finish: line.defaultFinish ?? "",
    qualityTier: line.qualityTier,
    brightness: tierBrightness(line.qualityTier),
    brightnessTouched: false,
    imageUrl: "",
    previewUrl: "",
    uploading: false,
    features: "",
    description: "",
    saving: false,
  };
}

export function ProductManager() {
  const [org, setOrg] = useState<OrgResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [brands, setBrands] = useState<PaintBrand[]>([]);
  const [brandId, setBrandId] = useState<number | null>(null);
  const [newBrand, setNewBrand] = useState("");
  const [category, setCategory] = useState<ProductCategory | null>(null);
  const [lines, setLines] = useState<PaintLine[]>([]);
  const [newLine, setNewLine] = useState("");
  const [linesLoading, setLinesLoading] = useState(false);

  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const draftsRef = useRef<Record<number, Draft>>({});
  draftsRef.current = drafts;

  // Release any blob preview URLs when the component unmounts.
  useEffect(() => () => { Object.values(draftsRef.current).forEach(revokeDraft); }, []);

  // Load org + brands + existing products.
  useEffect(() => {
    (async () => {
      try {
        const orgs = await api.listMyOrgs();
        const retailer = orgs.find((o) => o.type === "RETAILER") ?? null;
        setOrg(retailer);
        setBrands(await api.listPaintBrands());
        if (retailer) setProducts(await api.listShopProducts(retailer.id));
      } catch (e) {
        if (e instanceof HttpError && e.status === 401) { window.location.href = "/sign-in?next=/products"; return; }
        setError(e instanceof Error ? e.message : "Could not load the catalogue.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loadLines = useCallback(async (bId: number, cat: ProductCategory) => {
    setLinesLoading(true);
    try {
      setLines(await api.listPaintLines(bId, cat));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load lines.");
    } finally {
      setLinesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (brandId != null && category) void loadLines(brandId, category);
    else setLines([]);
    setDrafts((prev) => { Object.values(prev).forEach(revokeDraft); return {}; });
  }, [brandId, category, loadLines]);

  const addBrand = useCallback(async () => {
    if (!newBrand.trim()) return;
    // Catch the obvious duplicate before a round-trip; the backend still owns
    // the authoritative uniqueness check.
    const existing = brands.find((b) => b.name.trim().toLowerCase() === newBrand.trim().toLowerCase());
    if (existing) {
      setBrandId(existing.id);
      setNewBrand("");
      setError(`"${existing.name}" is already listed — selected it for you.`);
      return;
    }
    try {
      const b = await api.addPaintBrand({ name: newBrand.trim() });
      setBrands((prev) => (prev.some((x) => x.id === b.id) ? prev : [...prev, b].sort((a, c) => a.name.localeCompare(c.name))));
      setBrandId(b.id);
      setNewBrand("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the brand.");
    }
  }, [newBrand, brands]);

  const addLine = useCallback(async () => {
    if (!newLine.trim() || brandId == null || !category) return;
    const duplicate = lines.find((l) => l.name.trim().toLowerCase() === newLine.trim().toLowerCase());
    if (duplicate) {
      setNewLine("");
      setError(`"${duplicate.name}" already exists in this list — tick it below instead.`);
      return;
    }
    try {
      const l = await api.addPaintLine(brandId, { name: newLine.trim(), category });
      setLines((prev) => (prev.some((x) => x.id === l.id) ? prev : [...prev, l]));
      setNewLine("");
      setDrafts((prev) => ({ ...prev, [l.id]: initDraft(l) })); // auto-select the new line
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the line.");
    }
  }, [newLine, brandId, category, lines]);

  const toggleLine = useCallback((line: PaintLine) => {
    setDrafts((prev) => {
      const next = { ...prev };
      if (next[line.id]) { revokeDraft(next[line.id]); delete next[line.id]; }
      else next[line.id] = initDraft(line);
      return next;
    });
  }, []);

  const patch = useCallback((lineId: number, p: Partial<Draft>) => {
    setDrafts((prev) => ({ ...prev, [lineId]: { ...prev[lineId]!, ...p } }));
  }, []);

  const uploadImage = useCallback(async (lineId: number, file: File) => {
    const preview = URL.createObjectURL(file);
    setDrafts((prev) => {
      revokeDraft(prev[lineId]); // release a previously-selected preview, if any
      return { ...prev, [lineId]: { ...prev[lineId]!, uploading: true, previewUrl: preview } };
    });
    try {
      const up = await api.uploadImage(file);
      patch(lineId, { imageUrl: up.imageUrl, uploading: false });
    } catch (e) {
      patch(lineId, { uploading: false });
      setError(e instanceof Error ? e.message : "Image upload failed.");
    }
  }, [patch]);

  const saveDraft = useCallback(async (line: PaintLine) => {
    if (!org) return;
    const d = drafts[line.id];
    if (!d) return;
    patch(line.id, { saving: true });
    const priceNum = d.price.trim() ? Number(d.price) : undefined;
    try {
      const created = await api.createShopProduct(org.id, {
        lineId: line.id,
        price: priceNum != null && !Number.isNaN(priceNum) ? priceNum : undefined,
        priceUnit: d.priceUnit || undefined,
        packSize: d.packSize || undefined,
        coverage: d.coverage || undefined,
        finish: d.finish || undefined,
        qualityTier: d.qualityTier,
        brightness: d.brightness,
        imageUrl: d.imageUrl || undefined,
        features: d.features || undefined,
        description: d.description || undefined,
      });
      setProducts((prev) => [created, ...prev]);
      setDrafts((prev) => {
        revokeDraft(prev[line.id]);
        const next = { ...prev };
        delete next[line.id];
        return next;
      });
    } catch (e) {
      patch(line.id, { saving: false });
      setError(e instanceof Error ? e.message : "Could not save the product.");
    }
  }, [org, drafts, patch]);

  const removeProduct = useCallback(async (id: string) => {
    if (!org) return;
    try {
      await api.deleteShopProduct(org.id, id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove the product.");
    }
  }, [org]);

  const checkedLines = useMemo(() => lines.filter((l) => drafts[l.id]), [lines, drafts]);

  if (loading) {
    return <div style={{ display: "inline-flex", gap: 10, alignItems: "center", color: "var(--fg-mute)" }}><Spinner size={14} color="var(--accent)" /> <Mono>Loading…</Mono></div>;
  }
  if (!org) {
    return (
      <div style={{ border: "1px solid var(--rule)", borderRadius: "var(--radius)", padding: 24 }}>
        <Mono brass>No shop yet</Mono>
        <p style={{ font: "400 17px/1.5 var(--sans)", color: "var(--fg-soft)", margin: "10px 0 16px" }}>
          Listing products needs a shop. Create yours in the customer portal — the &ldquo;Active
          codes&rdquo; section sets it up in one step — then come back here.
        </p>
        <Link className="btn" href="/portal">Go to the customer portal <span className="arr">→</span></Link>
      </div>
    );
  }

  return (
    <div>
      {error && <div className="field-error" role="alert" style={{ marginBottom: 16 }}>{error}</div>}

      {/* STEP 1 — BRAND */}
      <section style={{ border: "1px solid var(--rule)", borderRadius: "var(--radius)", padding: 20, marginBottom: 20 }}>
        <Mono brass>1 · Company</Mono>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
          <select
            value={brandId ?? ""}
            onChange={(e) => setBrandId(e.target.value ? Number(e.target.value) : null)}
            aria-label="Brand"
            style={{ padding: "10px 12px", border: "1px solid var(--rule-strong)", background: "var(--surface)", color: "var(--fg)", font: "300 16px/1 var(--serif)", minWidth: 200 }}
          >
            <option value="">Select a company…</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <span style={{ color: "var(--fg-mute)" }}>or</span>
          <input value={newBrand} onChange={(e) => setNewBrand(e.target.value)} placeholder="add a company" aria-label="New brand"
            style={{ padding: "10px 12px", border: "1px solid var(--rule-strong)", background: "var(--surface)", color: "var(--fg)", font: "400 15px/1 var(--sans)" }} />
          <Button size="sm" variant="ghost" onClick={() => void addBrand()} disabled={!newBrand.trim()}>Add</Button>
        </div>
      </section>

      {/* STEP 2 — CATEGORY */}
      {brandId != null && (
        <section style={{ border: "1px solid var(--rule)", borderRadius: "var(--radius)", padding: 20, marginBottom: 20 }}>
          <Mono brass>2 · Surface</Mono>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            {(["INTERIOR", "EXTERIOR"] as ProductCategory[]).map((c) => (
              <button key={c} type="button" onClick={() => setCategory(c)} aria-pressed={category === c}
                style={{ padding: "8px 18px", cursor: "pointer", background: category === c ? "var(--accent)" : "transparent", color: category === c ? "var(--bg)" : "var(--fg-soft)", border: "1px solid " + (category === c ? "var(--accent)" : "var(--rule-strong)"), font: "400 11px/1 var(--mono)", letterSpacing: ".2em", textTransform: "uppercase" }}>
                {c === "INTERIOR" ? "Interior" : "Exterior"}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* STEP 3 — LINES */}
      {brandId != null && category && (
        <section style={{ border: "1px solid var(--rule)", borderRadius: "var(--radius)", padding: 20, marginBottom: 20 }}>
          <Mono brass>3 · Product lines</Mono>
          {linesLoading ? (
            <div style={{ marginTop: 12 }}><Mono>Loading lines…</Mono></div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
              {lines.length === 0 && <Mono>No lines yet — add one below.</Mono>}
              {lines.map((l) => (
                <label key={l.id} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 12px", border: "1px solid " + (drafts[l.id] ? "var(--accent)" : "var(--rule-strong)"), cursor: "pointer" }}>
                  <input type="checkbox" checked={!!drafts[l.id]} onChange={() => toggleLine(l)} />
                  <span style={{ font: "300 15px/1 var(--serif)", color: "var(--fg)" }}>{l.name}</span>
                  <Mono>{tierLabel(l.qualityTier)}</Mono>
                </label>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center" }}>
            <input value={newLine} onChange={(e) => setNewLine(e.target.value)} placeholder="add a line not listed" aria-label="New line"
              style={{ padding: "9px 12px", border: "1px solid var(--rule-strong)", background: "var(--surface)", color: "var(--fg)", font: "400 15px/1 var(--sans)" }} />
            <Button size="sm" variant="ghost" onClick={() => void addLine()} disabled={!newLine.trim()}>Add line</Button>
          </div>
        </section>
      )}

      {/* STEP 4 — DRAFT CARDS for checked lines */}
      {checkedLines.map((line) => {
        const d = drafts[line.id]!;
        const img = d.previewUrl || resolveMediaUrl(d.imageUrl) || "";
        return (
          <section key={line.id} style={{ border: "1px solid var(--accent)", borderRadius: "var(--radius)", padding: 20, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
              <h3 style={{ font: "600 22px/1 var(--serif)", margin: 0 }}>{line.name}</h3>
              <Mono>{org.name}</Mono>
            </div>
            <div className="r-cols-md-1" style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 18, alignItems: "start" }}>
              {/* image */}
              <div>
                <label style={{ display: "block", width: "100%", aspectRatio: "1/1", border: "1px dashed var(--rule-strong)", cursor: "pointer", position: "relative", overflow: "hidden", background: "var(--surface)" }}>
                  <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadImage(line.id, f); e.target.value = ""; }} />
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img} alt={`${line.name} product photo`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 10, font: "400 14px/1.4 var(--sans)", color: "var(--fg-mute)" }}>
                      {d.uploading ? "Uploading…" : "Tap to add bucket photo"}
                    </span>
                  )}
                </label>
              </div>
              {/* fields */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                <Field label="Price (₹)"><input type="number" value={d.price} onChange={(e) => patch(line.id, { price: e.target.value })} style={inp} /></Field>
                <Field label="Per"><input value={d.priceUnit} onChange={(e) => patch(line.id, { priceUnit: e.target.value })} style={inp} /></Field>
                <Field label="Pack size"><input value={d.packSize} onChange={(e) => patch(line.id, { packSize: e.target.value })} style={inp} /></Field>
                <Field label="Finish"><input value={d.finish} onChange={(e) => patch(line.id, { finish: e.target.value })} style={inp} /></Field>
                <Field label="Coverage"><input value={d.coverage} onChange={(e) => patch(line.id, { coverage: e.target.value })} placeholder="e.g. 120–140 sq ft/L" style={inp} /></Field>
                <Field label="Quality">
                  <select value={d.qualityTier} onChange={(e) => { const t = e.target.value as QualityTier; patch(line.id, d.brightnessTouched ? { qualityTier: t } : { qualityTier: t, brightness: tierBrightness(t) }); }} style={inp}>
                    {TIERS.map((t) => <option key={t} value={t}>{tierLabel(t)}</option>)}
                  </select>
                </Field>
                <Field label={`Brightness (${d.brightness}/5)`}>
                  <input type="range" min={1} max={5} step={1} value={d.brightness} onChange={(e) => patch(line.id, { brightness: Number(e.target.value), brightnessTouched: true })} style={{ width: "100%", accentColor: "var(--accent)" }} />
                </Field>
                <div style={{ gridColumn: "1 / -1" }}>
                  <Field label="Features"><textarea value={d.features} onChange={(e) => patch(line.id, { features: e.target.value })} rows={2} placeholder="washable, anti-fungal, 7-yr warranty…" style={{ ...inp, resize: "vertical" }} /></Field>
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <Field label="Description"><textarea value={d.description} onChange={(e) => patch(line.id, { description: e.target.value })} rows={2} placeholder="A short description of the product…" style={{ ...inp, resize: "vertical" }} /></Field>
                </div>
                <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <Button size="sm" variant="ghost" onClick={() => toggleLine(line)}>Cancel</Button>
                  <Button size="sm" onClick={() => void saveDraft(line)} disabled={d.saving || d.uploading}>
                    {d.saving ? "Saving…" : "Save product"}
                  </Button>
                </div>
              </div>
            </div>
          </section>
        );
      })}

      {/* SAVED PRODUCTS */}
      <section style={{ marginTop: 32 }}>
        <h2 className="display" style={{ fontSize: 40, marginBottom: 16 }}>Your products</h2>
        {products.length === 0 ? (
          <p style={{ font: "400 16px/1.5 var(--sans)", color: "var(--fg-mute)" }}>No products yet. Build one above.</p>
        ) : (
          <div className="r-cols-md-1" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            {products.map((p) => <ProductCard key={p.id} product={p} onDelete={() => void removeProduct(p.id)} />)}
          </div>
        )}
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", marginBottom: 4, font: "400 10px/1 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase", color: "var(--fg-mute)" }}>{label}</span>
      {children}
    </label>
  );
}

const inp: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid var(--rule-strong)",
  borderRadius: "var(--radius)",
  background: "var(--surface)",
  color: "var(--fg)",
  font: "300 14px/1.3 var(--serif)",
};

function ProductCard({ product, onDelete }: { product: ShopProduct; onDelete: () => void }) {
  const img = resolveMediaUrl(product.imageUrl) || "";
  return (
    <div style={{ border: "1px solid var(--rule)", borderRadius: "var(--radius)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ aspectRatio: "4/3", background: "var(--surface)", overflow: "hidden" }}>
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={product.lineName ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><Mono>no image</Mono></div>
        )}
      </div>
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
        <Mono>{product.brandName} · {product.category === "INTERIOR" ? "Interior" : "Exterior"}</Mono>
        <div style={{ font: "400 20px/1.1 var(--sans)", color: "var(--fg)" }}>{product.lineName}</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {product.finish && <Mono>{product.finish}</Mono>}
          {product.coverage && <Mono>{product.coverage}</Mono>}
        </div>
        {/* quality + brightness indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
          <span aria-hidden style={{ color: "var(--accent)", letterSpacing: 2 }}>
            {"★".repeat(tierStars(product.qualityTier))}{"☆".repeat(5 - tierStars(product.qualityTier))}
          </span>
          <Mono>{tierLabel(product.qualityTier)}</Mono>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Mono>Brightness</Mono>
          <span aria-hidden style={{ display: "inline-flex", gap: 2 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <span key={n} style={{ width: 14, height: 8, background: n <= (product.brightness ?? 0) ? "var(--accent)" : "var(--rule-strong)" }} />
            ))}
          </span>
        </div>
        {product.features && (
          <p style={{ font: "300 13px/1.4 var(--serif)", color: "var(--fg-soft)", margin: "4px 0 0" }}>{product.features}</p>
        )}
        {product.description && (
          <p style={{ font: "400 13px/1.45 var(--sans)", color: "var(--fg-mute)", margin: "2px 0 0" }}>{product.description}</p>
        )}
        <div style={{ marginTop: "auto", paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ font: "600 22px/1 var(--serif)", color: "var(--fg)" }}>
            {product.price != null ? `₹${product.price.toLocaleString("en-IN")}` : "—"}{product.priceUnit ? <span style={{ fontSize: 13, color: "var(--fg-mute)" }}> /{product.priceUnit}</span> : null}
          </span>
          <button type="button" onClick={onDelete} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--fg-mute)", font: "400 10px/1 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase" }}>Remove</button>
        </div>
      </div>
    </div>
  );
}
