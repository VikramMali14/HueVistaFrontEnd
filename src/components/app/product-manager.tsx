"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Mono } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ALL, FilterBar, facetOptionsFrom, matchesQuery } from "@/components/ui/filter-bar";
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
/** Standard bucket sizes a shop prices against. The "Per" field picks one of these. */
const DEFAULT_PRICE_UNIT = "20 L";
const PRICE_UNITS: string[] = [DEFAULT_PRICE_UNIT, "10 L", "4 L", "1 L"];
/** Brightness runs on a 1–10 scale. */
const BRIGHTNESS_MAX = 10;
const tierBrightness = (t: QualityTier) => (t === "LUXURY" ? 10 : t === "PREMIUM" ? 8 : 4);
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
    priceUnit: DEFAULT_PRICE_UNIT,
    // Left empty, not pre-filled with the price unit: seeding both to "20 L" put two
    // fields side by side saying the same thing, so neither read as meaning anything.
    packSize: "",
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

/** Pre-fill a draft from an already-saved product so the user can edit it. */
function draftFromProduct(p: ShopProduct): Draft {
  const tier = p.qualityTier ?? "PREMIUM";
  return {
    price: p.price != null ? String(p.price) : "",
    priceUnit: p.priceUnit ?? DEFAULT_PRICE_UNIT,
    packSize: p.packSize ?? "",
    coverage: p.coverage ?? "",
    finish: p.finish ?? "",
    qualityTier: tier,
    brightness: p.brightness ?? tierBrightness(tier),
    // Only a STORED brightness counts as set. Editing a product that never had one
    // must not quietly commit the slider's starting position — that is how an
    // untouched field becomes a published spec. A stored value stays put, so
    // changing the tier can't stomp it.
    brightnessTouched: p.brightness != null,
    imageUrl: p.imageUrl ?? "",
    previewUrl: "",
    uploading: false,
    features: p.features ?? "",
    description: p.description ?? "",
    saving: false,
  };
}

/** Highest price we'll accept, so a stray keypress can't list a ₹10-crore bucket. */
const MAX_PRICE = 1_000_000;

/**
 * Why a product cannot be saved yet, or null when it can.
 *
 * A listing IS its price — a card reading "— /20 L" tells a customer nothing, and
 * the field was previously a bare `type=number` that took an empty value, a
 * negative one and a fraction of a paisa alike.
 */
function priceProblem(price: string): string | null {
  const raw = price.trim();
  if (!raw) return "Enter a price — a product without one shows customers a blank card.";
  const n = Number(raw);
  if (!Number.isFinite(n)) return "That price isn't a number.";
  if (n < 0) return "A price can't be negative.";
  if (n === 0) return "Enter a price above zero.";
  if (n > MAX_PRICE) return `That price looks wrong — the most we'll list is ₹${MAX_PRICE.toLocaleString("en-IN")}.`;
  if (Math.round(n * 100) !== n * 100) return "Round the price to the nearest paisa.";
  return null;
}

/** The body shared by create and update. Assumes {@link priceProblem} already passed. */
function draftToBody(lineId: number, d: Draft) {
  return {
    lineId,
    price: Number(d.price.trim()),
    priceUnit: d.priceUnit || undefined,
    packSize: d.packSize || undefined,
    coverage: d.coverage || undefined,
    finish: d.finish || undefined,
    qualityTier: d.qualityTier,
    // Only sent once someone has actually set it. Seeding it from the line's tier
    // and sending it anyway meant a product saved without a single field filled in
    // came back showing "Brightness 4/10" — a specific-looking number the shop
    // never chose, on a card its customers read.
    brightness: d.brightnessTouched ? d.brightness : undefined,
    imageUrl: d.imageUrl || undefined,
    features: d.features || undefined,
    description: d.description || undefined,
  };
}

export function ProductManager() {
  const [org, setOrg] = useState<OrgResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters over the shop's saved listings (distinct from the brand/line pickers
  // above, which drive creating a new product).
  const [listQuery, setListQuery] = useState("");
  const [listCompany, setListCompany] = useState(ALL);
  const [listCategory, setListCategory] = useState(ALL);
  const [listTier, setListTier] = useState(ALL);

  const [brands, setBrands] = useState<PaintBrand[]>([]);
  const [brandId, setBrandId] = useState<number | null>(null);
  const [newBrand, setNewBrand] = useState("");
  const [category, setCategory] = useState<ProductCategory | null>(null);
  const [lines, setLines] = useState<PaintLine[]>([]);
  const [newLine, setNewLine] = useState("");
  const [linesLoading, setLinesLoading] = useState(false);

  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [products, setProducts] = useState<ShopProduct[]>([]);
  // Products currently being edited, keyed by product id (a line can have several).
  const [editing, setEditing] = useState<Record<string, Draft>>({});
  const draftsRef = useRef<Record<number, Draft>>({});
  draftsRef.current = drafts;
  const editingRef = useRef<Record<string, Draft>>({});
  editingRef.current = editing;

  // Release any blob preview URLs when the component unmounts.
  useEffect(() => () => {
    Object.values(draftsRef.current).forEach(revokeDraft);
    Object.values(editingRef.current).forEach(revokeDraft);
  }, []);

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
    const bad = priceProblem(d.price);
    if (bad) { setError(bad); return; }
    // Same line can be listed more than once, but not at the same "Per" size —
    // that would be an exact duplicate. Nudge the shopkeeper to change the size.
    const per = (d.priceUnit ?? "").trim().toLowerCase();
    const dup = products.find((p) => p.lineId === line.id && (p.priceUnit ?? "").trim().toLowerCase() === per);
    if (dup) {
      setError(`${line.name} at ${d.priceUnit || "this size"} is already listed — change the "Per" size to add another.`);
      return;
    }
    patch(line.id, { saving: true });
    try {
      const created = await api.createShopProduct(org.id, draftToBody(line.id, d));
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
  }, [org, drafts, products, patch]);

  // --- Edit an already-saved product ---
  const startEdit = useCallback((p: ShopProduct) => {
    setEditing((prev) => (prev[p.id] ? prev : { ...prev, [p.id]: draftFromProduct(p) }));
  }, []);

  const cancelEdit = useCallback((id: string) => {
    setEditing((prev) => { const n = { ...prev }; revokeDraft(n[id]); delete n[id]; return n; });
  }, []);

  const patchEdit = useCallback((id: string, p: Partial<Draft>) => {
    setEditing((prev) => ({ ...prev, [id]: { ...prev[id]!, ...p } }));
  }, []);

  const uploadEditImage = useCallback(async (id: string, file: File) => {
    const preview = URL.createObjectURL(file);
    setEditing((prev) => {
      revokeDraft(prev[id]);
      return { ...prev, [id]: { ...prev[id]!, uploading: true, previewUrl: preview } };
    });
    try {
      const up = await api.uploadImage(file);
      patchEdit(id, { imageUrl: up.imageUrl, uploading: false });
    } catch (e) {
      patchEdit(id, { uploading: false });
      setError(e instanceof Error ? e.message : "Image upload failed.");
    }
  }, [patchEdit]);

  const saveEdit = useCallback(async (p: ShopProduct) => {
    if (!org) return;
    const d = editing[p.id];
    if (!d) return;
    const bad = priceProblem(d.price);
    if (bad) { setError(bad); return; }
    patchEdit(p.id, { saving: true });
    try {
      const updated = await api.updateShopProduct(org.id, p.id, draftToBody(p.lineId, d));
      setProducts((prev) => prev.map((x) => (x.id === p.id ? updated : x)));
      setEditing((prev) => { revokeDraft(prev[p.id]); const n = { ...prev }; delete n[p.id]; return n; });
    } catch (e) {
      patchEdit(p.id, { saving: false });
      setError(e instanceof Error ? e.message : "Could not update the product.");
    }
  }, [org, editing, patchEdit]);

  const removeProduct = useCallback(async (id: string) => {
    if (!org) return;
    try {
      await api.deleteShopProduct(org.id, id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
      cancelEdit(id); // drop any open editor for it
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove the product.");
    }
  }, [org, cancelEdit]);

  const checkedLines = useMemo(() => lines.filter((l) => drafts[l.id]), [lines, drafts]);
  const editingList = useMemo(() => products.filter((p) => editing[p.id]), [products, editing]);

  const listCompanyOptions = useMemo(() => facetOptionsFrom(products, (p) => p.brandName), [products]);

  const visibleProducts = useMemo(
    () =>
      products.filter((p) => {
        if (listCompany !== ALL && p.brandName !== listCompany) return false;
        if (listCategory !== ALL && p.category !== listCategory) return false;
        if (listTier !== ALL && p.qualityTier !== listTier) return false;
        return matchesQuery(listQuery, p.brandName, p.lineName, p.finish, p.packSize);
      }),
    [products, listQuery, listCompany, listCategory, listTier],
  );

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
        {/* "1 ·" on its own asks somebody to start a sequence without saying how
            long it is — steps 2 and 3 only appear as each one is answered, so on
            arrival the page shows a step 1 of an unknown number. Three is not a
            lot; saying so is the difference between a form and a commitment. */}
        <Mono brass>1 of 3 · Company</Mono>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
          <select
            value={brandId ?? ""}
            onChange={(e) => setBrandId(e.target.value ? Number(e.target.value) : null)}
            aria-label="Brand"
            className="hv-select"
            style={{ padding: "10px 12px", border: "1px solid var(--rule-strong)", background: "var(--surface)", color: "var(--fg)", font: "300 16px/1 var(--serif)", minWidth: 200 }}
          >
            <option value="">Select a company…</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <span style={{ color: "var(--fg-mute)" }}>or</span>
          <input value={newBrand} onChange={(e) => setNewBrand(e.target.value)} placeholder="add a company" aria-label="New brand"
            onKeyDown={(e) => { if (e.key === "Enter" && newBrand.trim()) void addBrand(); }}
            style={{ padding: "10px 12px", border: "1px solid var(--rule-strong)", background: "var(--surface)", color: "var(--fg)", font: "400 15px/1 var(--sans)" }} />
          {/* `title` on the disabled button says why it is disabled. Pressing a greyed
              Add with an empty box did nothing and explained nothing, which reads as a
              broken button rather than a missing input. */}
          <Button size="sm" variant="ghost" onClick={() => void addBrand()} disabled={!newBrand.trim()}
            title={newBrand.trim() ? "Add this company" : "Type a company name first"}>Add</Button>
        </div>
      </section>

      {/* STEP 2 — CATEGORY */}
      {brandId != null && (
        <section style={{ border: "1px solid var(--rule)", borderRadius: "var(--radius)", padding: 20, marginBottom: 20 }}>
          <Mono brass>2 of 3 · Surface</Mono>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            {(["INTERIOR", "EXTERIOR"] as ProductCategory[]).map((c) => (
              <button key={c} type="button" onClick={() => setCategory(c)} aria-pressed={category === c}
                style={{ padding: "8px 18px", cursor: "pointer", background: category === c ? "var(--accent)" : "transparent", color: category === c ? "var(--bg)" : "var(--fg-soft)", border: "1px solid " + (category === c ? "var(--accent)" : "var(--rule-strong)"), font: "400 12px/1 var(--mono)", letterSpacing: ".2em", textTransform: "uppercase" }}>
                {c === "INTERIOR" ? "Interior" : "Exterior"}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* STEP 3 — LINES */}
      {brandId != null && category && (
        <section style={{ border: "1px solid var(--rule)", borderRadius: "var(--radius)", padding: 20, marginBottom: 20 }}>
          <Mono brass>3 of 3 · Product lines</Mono>
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
              onKeyDown={(e) => { if (e.key === "Enter" && newLine.trim()) void addLine(); }}
              style={{ padding: "9px 12px", border: "1px solid var(--rule-strong)", background: "var(--surface)", color: "var(--fg)", font: "400 15px/1 var(--sans)" }} />
            <Button size="sm" variant="ghost" onClick={() => void addLine()} disabled={!newLine.trim()}
              title={newLine.trim() ? "Add this line" : "Type a line name first"}>Add line</Button>
          </div>
        </section>
      )}

      {/* STEP 4 — DRAFT CARDS for checked lines */}
      {checkedLines.map((line) => {
        const d = drafts[line.id]!;
        return (
          <section key={line.id} style={{ border: "1px solid var(--accent)", borderRadius: "var(--radius)", padding: 20, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
              <h3 style={{ font: "600 22px/1 var(--serif)", margin: 0 }}>{line.name}</h3>
              <Mono>{org.name}</Mono>
            </div>
            <ProductForm
              draft={d}
              imageAlt={`${line.name} product photo`}
              patch={(p) => patch(line.id, p)}
              onPickImage={(f) => void uploadImage(line.id, f)}
              actions={
                <>
                  <Button size="sm" variant="ghost" onClick={() => toggleLine(line)}>Cancel</Button>
                  <Button size="sm" onClick={() => void saveDraft(line)} disabled={d.saving || d.uploading}>
                    {d.saving ? "Saving…" : "Save product"}
                  </Button>
                </>
              }
            />
          </section>
        );
      })}

      {/* SAVED PRODUCTS */}
      <section style={{ marginTop: 32 }}>
        {/* Not "Your products": the page above it is already titled "Your paint
            products", and two headings 340px apart differing by one word leave a
            reader working out which list is which. This section is the shelf —
            the lines the shop actually stocks — which is what the intro calls it. */}
        <h2 className="display" style={{ fontSize: 40, marginBottom: 16 }}>What you stock</h2>

        {/* Open editors (full width, one per product being edited) */}
        {editingList.map((p) => {
          const d = editing[p.id]!;
          return (
            <section key={p.id} style={{ border: "1px solid var(--accent)", borderRadius: "var(--radius)", padding: 20, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
                <h3 style={{ font: "600 22px/1 var(--serif)", margin: 0 }}>Editing · {p.lineName ?? "product"}</h3>
                <Mono>{p.brandName ?? org.name}</Mono>
              </div>
              <ProductForm
                draft={d}
                imageAlt={`${p.lineName ?? "product"} photo`}
                patch={(x) => patchEdit(p.id, x)}
                onPickImage={(f) => void uploadEditImage(p.id, f)}
                actions={
                  <>
                    <Button size="sm" variant="ghost" onClick={() => cancelEdit(p.id)}>Cancel</Button>
                    <Button size="sm" onClick={() => void saveEdit(p)} disabled={d.saving || d.uploading}>
                      {d.saving ? "Saving…" : "Update product"}
                    </Button>
                  </>
                }
              />
            </section>
          );
        })}

        {products.length === 0 ? (
          <p style={{ font: "400 16px/1.5 var(--sans)", color: "var(--fg-mute)" }}>No products yet. Build one above.</p>
        ) : (
          <>
            <FilterBar
              query={listQuery}
              onQueryChange={setListQuery}
              searchPlaceholder="Search company, line or finish"
              facets={[
                {
                  id: "company",
                  label: "Company",
                  value: listCompany,
                  onChange: setListCompany,
                  allLabel: "All companies",
                  options: listCompanyOptions,
                },
                {
                  id: "category",
                  label: "Use",
                  value: listCategory,
                  onChange: setListCategory,
                  allLabel: "Interior + exterior",
                  options: [
                    { value: "INTERIOR", label: "Interior" },
                    { value: "EXTERIOR", label: "Exterior" },
                  ],
                },
                {
                  id: "tier",
                  label: "Quality",
                  value: listTier,
                  onChange: setListTier,
                  allLabel: "All tiers",
                  options: TIERS.map((t) => ({ value: t, label: tierLabel(t) })),
                },
              ]}
              shown={visibleProducts.length}
              total={products.length}
              noun="product"
            />
            {visibleProducts.length === 0 ? (
              <p style={{ font: "400 16px/1.5 var(--sans)", color: "var(--fg-mute)" }}>
                No product matches these filters.
              </p>
            ) : (
              <div className="r-cols-md-1" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
                {visibleProducts.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    editing={!!editing[p.id]}
                    onEdit={() => startEdit(p)}
                    onDelete={() => void removeProduct(p.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

/**
 * A labelled control. The label WRAPS its input, which is what associates the two —
 * but a wrapped input still has no `id` for anything outside to point at and no
 * `name` for a password manager or autofill to recognise, so callers pass those in
 * on the control itself. `hint` carries the one-line distinction between fields
 * that would otherwise read as duplicates of each other.
 */
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", marginBottom: 4, font: "400 12px/1 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase", color: "var(--fg-mute)" }}>{label}</span>
      {children}
      {hint && (
        <span style={{ display: "block", marginTop: 4, font: "400 12px/1.4 var(--sans)", color: "var(--fg-mute)" }}>{hint}</span>
      )}
    </label>
  );
}

/**
 * The shared image + fields editor, used both to add a new product and to edit
 * a saved one. `actions` renders the buttons (Cancel / Save or Update).
 */
function ProductForm({
  draft,
  imageAlt,
  patch,
  onPickImage,
  actions,
}: {
  draft: Draft;
  imageAlt: string;
  patch: (p: Partial<Draft>) => void;
  onPickImage: (f: File) => void;
  actions: React.ReactNode;
}) {
  const uid = useId();
  const img = draft.previewUrl || resolveMediaUrl(draft.imageUrl) || "";
  // Keep an unusual saved "Per" value selectable rather than silently dropping it.
  const perOptions = PRICE_UNITS.includes(draft.priceUnit) || !draft.priceUnit
    ? PRICE_UNITS
    : [draft.priceUnit, ...PRICE_UNITS];
  // Flag a price that is present but wrong as it is typed. An EMPTY price is not
  // shouted about here — the field starts empty on every new product, and the
  // save button says so when it matters.
  const priceHint = draft.price.trim() ? priceProblem(draft.price) : null;
  return (
    <div className="r-cols-md-1" style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 18, alignItems: "start" }}>
      {/* image */}
      <div>
        <label style={{ display: "block", width: "100%", aspectRatio: "1/1", border: "1px dashed var(--rule-strong)", cursor: "pointer", position: "relative", overflow: "hidden", background: "var(--surface)" }}>
          <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickImage(f); e.target.value = ""; }} />
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt={imageAlt} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 10, font: "400 14px/1.4 var(--sans)", color: "var(--fg-mute)" }}>
              {draft.uploading ? "Uploading…" : "Tap to add bucket photo"}
            </span>
          )}
        </label>
      </div>
      {/* fields */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
        <Field label="Price (₹)">
          <input
            id={`${uid}-price`}
            name="price"
            type="number"
            min={0}
            max={MAX_PRICE}
            step="0.01"
            inputMode="decimal"
            required
            value={draft.price}
            onChange={(e) => patch({ price: e.target.value })}
            aria-invalid={priceHint ? "true" : undefined}
            aria-describedby={priceHint ? `${uid}-price-err` : undefined}
            style={{ ...inp, borderColor: priceHint ? "var(--terracotta)" : "var(--rule-strong)" }}
          />
          {priceHint && (
            <span id={`${uid}-price-err`} className="field-error" style={{ display: "block", marginTop: 4 }}>{priceHint}</span>
          )}
        </Field>
        <Field label="Price is for" hint="The bucket size this price buys.">
          <select id={`${uid}-per`} name="priceUnit" className="hv-select" value={draft.priceUnit} onChange={(e) => patch({ priceUnit: e.target.value })} style={inp}>
            {perOptions.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </Field>
        <Field label="Pack size" hint="Only if the tin is labelled differently — e.g. 18 L sold as a 20 L pack.">
          <input id={`${uid}-pack`} name="packSize" value={draft.packSize} onChange={(e) => patch({ packSize: e.target.value })} placeholder={draft.priceUnit || "20 L"} style={inp} />
        </Field>
        <Field label="Finish"><input id={`${uid}-finish`} name="finish" value={draft.finish} onChange={(e) => patch({ finish: e.target.value })} placeholder="e.g. Matt, Sheen" style={inp} /></Field>
        <Field label="Coverage"><input id={`${uid}-coverage`} name="coverage" value={draft.coverage} onChange={(e) => patch({ coverage: e.target.value })} placeholder="e.g. 120–140 sq ft/L" style={inp} /></Field>
        <Field label="Quality">
          <select id={`${uid}-tier`} name="qualityTier" className="hv-select" value={draft.qualityTier} onChange={(e) => { const t = e.target.value as QualityTier; patch(draft.brightnessTouched ? { qualityTier: t } : { qualityTier: t, brightness: tierBrightness(t) }); }} style={inp}>
            {TIERS.map((t) => <option key={t} value={t}>{tierLabel(t)}</option>)}
          </select>
        </Field>
        <Field
          label={`Brightness (${draft.brightnessTouched ? `${draft.brightness}/${BRIGHTNESS_MAX}` : "not set"})`}
          hint={draft.brightnessTouched ? undefined : "Move the slider to publish a brightness — left alone, the card shows none."}
        >
          <input id={`${uid}-brightness`} name="brightness" type="range" min={1} max={BRIGHTNESS_MAX} step={1} value={draft.brightness} onChange={(e) => patch({ brightness: Number(e.target.value), brightnessTouched: true })} style={{ width: "100%", accentColor: "var(--accent)", opacity: draft.brightnessTouched ? 1 : 0.55 }} />
        </Field>
        <div style={{ gridColumn: "1 / -1" }}>
          <Field label="Features"><textarea id={`${uid}-features`} name="features" value={draft.features} onChange={(e) => patch({ features: e.target.value })} rows={2} placeholder="washable, anti-fungal, 7-yr warranty…" style={{ ...inp, resize: "vertical" }} /></Field>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <Field label="Description"><textarea id={`${uid}-description`} name="description" value={draft.description} onChange={(e) => patch({ description: e.target.value })} rows={2} placeholder="A short description of the product…" style={{ ...inp, resize: "vertical" }} /></Field>
        </div>
        <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10, justifyContent: "flex-end" }}>{actions}</div>
      </div>
    </div>
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

function ProductCard({ product, editing, onEdit, onDelete }: { product: ShopProduct; editing: boolean; onEdit: () => void; onDelete: () => void }) {
  const img = resolveMediaUrl(product.imageUrl) || "";
  const bright = product.brightness != null
    ? Math.max(0, Math.min(BRIGHTNESS_MAX, product.brightness))
    : null;
  return (
    <div style={{ border: "1px solid " + (editing ? "var(--accent)" : "var(--rule)"), borderRadius: "var(--radius)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      {/* A 4:3 block in a three-up grid made one product fill a quarter of the
          screen, and an empty one was 320px of the words "no image". Capped, and
          the placeholder shrinks further than a real photo needs to.
          Smaller again, and it now names the next action rather than the gap: a
          shelf of four cards each carrying a grey band reading "NO IMAGE" is a
          page announcing four times over what it has not got, on the one screen
          whose whole job is filling those in. */}
      {img ? (
        <div style={{ aspectRatio: "4/3", maxHeight: 190, background: "var(--surface)", overflow: "hidden" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img} alt={product.lineName ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      ) : (
        <div
          style={{
            height: 52, display: "flex", alignItems: "center", gap: 8,
            padding: "0 14px", background: "var(--surface)",
            borderBottom: "1px dashed var(--rule-strong)",
            font: "400 13px/1 var(--sans)", color: "var(--fg-mute)",
          }}
        >
          <span aria-hidden style={{ font: "400 15px/1 var(--sans)", color: "var(--accent-text)" }}>+</span>
          Add a photo with Edit
        </div>
      )}
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
        <Mono>{product.brandName} · {product.category === "INTERIOR" ? "Interior" : "Exterior"}</Mono>
        <div style={{ font: "400 20px/1.1 var(--sans)", color: "var(--fg)" }}>{product.lineName}</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {product.finish && <Mono>{product.finish}</Mono>}
          {product.coverage && <Mono>{product.coverage}</Mono>}
        </div>
        {/* Quality + brightness. Both are drawn only when the product actually
            carries them — a blank brightness used to render as a filled bar
            reading "0/10", which is a claim about the paint, not an absence. */}
        {/* The tier, as a chip. It used to be five stars derived from the tier
            standing next to the tier's own name — the same fact twice, once as a
            picture and once as a word. Worse, stars are how a rating is drawn, and
            this is not a rating: nobody scored the paint, the shop filed it under a
            band its maker sells it in. Two of them (LUXURY, PREMIUM, and the rest at
            two stars) also sat above a ten-block brightness meter, so one card
            carried two different scales in two different metaphors. The band has a
            name; the name is the honest form of it. */}
        {product.qualityTier && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
            <Mono
              style={{
                border: "1px solid var(--rule-brass)", borderRadius: "var(--radius-pill)",
                padding: "3px 9px", color: "var(--accent-text)",
              }}
            >
              {tierLabel(product.qualityTier)}
            </Mono>
          </div>
        )}
        {bright != null && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Mono>Brightness</Mono>
            <span aria-hidden style={{ display: "inline-flex", gap: 2 }}>
              {Array.from({ length: BRIGHTNESS_MAX }, (_, i) => i + 1).map((n) => (
                <span key={n} style={{ width: 8, height: 8, background: n <= bright ? "var(--accent)" : "var(--rule-strong)" }} />
              ))}
            </span>
            <Mono>{bright}/{BRIGHTNESS_MAX}</Mono>
          </div>
        )}
        {product.features && (
          <p style={{ font: "300 13px/1.4 var(--serif)", color: "var(--fg-soft)", margin: "4px 0 0" }}>{product.features}</p>
        )}
        {product.description && (
          <p style={{ font: "400 13px/1.45 var(--sans)", color: "var(--fg-mute)", margin: "2px 0 0" }}>{product.description}</p>
        )}
        {/* The unit belongs to the price, so it must not be what breaks: at card
            width "₹6,200 /20 L" and "EDIT REMOVE" together overflow, and the
            wrap fell inside the price, orphaning "/20 L" on a line of its own
            under every card on the shelf. The price stays whole; the actions
            take the second line when there isn't room for both. */}
        <div style={{ marginTop: "auto", paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "6px 8px", flexWrap: "wrap" }}>
          <span style={{ font: "600 22px/1 var(--serif)", color: "var(--fg)", whiteSpace: "nowrap" }}>
            {product.price != null ? `₹${product.price.toLocaleString("en-IN")}` : "—"}{product.priceUnit ? <span style={{ fontSize: 13, color: "var(--fg-mute)" }}> /{product.priceUnit}</span> : null}
          </span>
          <div style={{ display: "flex", gap: 14, alignItems: "baseline" }}>
            <button type="button" onClick={onEdit} disabled={editing} style={{ background: "transparent", border: "none", cursor: editing ? "default" : "pointer", color: editing ? "var(--accent-text)" : "var(--fg-soft)", font: "400 12px/1 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase" }}>{editing ? "Editing…" : "Edit"}</button>
            <button type="button" onClick={onDelete} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--fg-mute)", font: "400 12px/1 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase" }}>Remove</button>
          </div>
        </div>
      </div>
    </div>
  );
}
