// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useShadeMatch, type MatchBrand } from "@/hooks/use-shade-match";
import type { PaintShade } from "@/lib/types";

const shade = (over: Partial<PaintShade> & Pick<PaintShade, "code" | "hex" | "brand">): PaintShade => ({
  name: over.code,
  family: "Neutrals",
  lrv: 50,
  finishes: [],
  ...over,
});

// Two companies, deliberately arranged so the overall nearest shade to #ff0000
// belongs to Berger — filtering to Asian Paints must NOT return it.
const CATALOGUE: PaintShade[] = [
  shade({ code: "AP-1", hex: "#ff2200", brand: "Asian Paints" }),
  shade({ code: "AP-2", hex: "#0000ff", brand: "Asian Paints" }),
  shade({ code: "BG-1", hex: "#ff0000", brand: "Berger" }),
];

const ASIAN: MatchBrand = { name: "Asian Paints", slug: "asian-paints" };

const backendShade = (code: string, hex: string, brandName: string) => ({
  shadeCode: code,
  name: code,
  hexCode: hex,
  brandName,
});

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useShadeMatch — company filter", () => {
  it("passes the company slug to the backend matcher", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [backendShade("AP-1", "#ff2200", "Asian Paints")],
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useShadeMatch("#ff0000", CATALOGUE, 6, ASIAN));

    await waitFor(() => expect(result.current.source).toBe("backend"));
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain("brand=asian-paints");
    expect(result.current.matches.map((m) => m.shade.code)).toEqual(["AP-1"]);
  });

  it("omits the brand param when no company is selected", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [backendShade("BG-1", "#ff0000", "Berger")],
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useShadeMatch("#ff0000", CATALOGUE, 6));

    await waitFor(() => expect(result.current.source).toBe("backend"));
    expect(String(fetchMock.mock.calls[0]![0])).not.toContain("brand=");
  });

  it("keeps the filter when the backend is unreachable and the offline matcher answers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const { result } = renderHook(() => useShadeMatch("#ff0000", CATALOGUE, 6, ASIAN));

    await waitFor(() => expect(result.current.source).toBe("offline"));
    // Berger's exact match is nearer, but the customer asked for Asian Paints.
    expect(result.current.matches.map((m) => m.shade.code)).toEqual(["AP-1", "AP-2"]);
  });

  it("reports an empty result for a company with no shades instead of widening the search", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));

    const { result } = renderHook(() =>
      useShadeMatch("#ff0000", CATALOGUE, 6, { name: "Dulux", slug: "dulux" }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.matches).toEqual([]);
    expect(result.current.source).toBe("backend");
  });

  it("still falls back offline when the whole catalogue comes back empty", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));

    const { result } = renderHook(() => useShadeMatch("#ff0000", CATALOGUE, 1));

    await waitFor(() => expect(result.current.source).toBe("offline"));
    expect(result.current.matches.map((m) => m.shade.code)).toEqual(["BG-1"]);
  });
});
