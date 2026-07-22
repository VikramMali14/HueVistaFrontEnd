import { getAccessToken } from "@/lib/auth";
import { orgApi } from "@/lib/api";
import { getCatalogueOrSample } from "@/lib/catalogue";
import { hasScheme } from "@/lib/shade-codes";
import { Mono } from "@/components/ui/eyebrow";
import { CodeChecker } from "@/components/app/code-checker";

/**
 * Dashboard shortcut to the shade-code debugger — shown ONLY once the shop has
 * created a custom code scheme. It lets a retailer read a customer code (or find
 * one) straight from the dashboard, without opening the portal. Renders nothing
 * when there's no shop, no custom scheme yet, or the lookup fails, so it never
 * shows an empty box. The page already restricts this to retailers/admins.
 */
export async function DashboardCodeChecker() {
  let scheme = null;
  try {
    const token = await getAccessToken();
    if (!token) return null;
    const shop = (await orgApi.mine(token)).find((o) => o.type === "RETAILER");
    if (!shop) return null;
    scheme = await orgApi.shadeCodeScheme(token, shop.id);
  } catch {
    return null;
  }
  if (!hasScheme(scheme)) return null;

  // Only fetched once we know the scheme exists — the checker needs the catalogue
  // to name the decoded shade and to search when finding a code.
  const shades = await getCatalogueOrSample();

  return (
    <section
      style={{
        marginBottom: 32,
        border: "1px solid var(--rule)",
        borderRadius: "var(--radius)",
        padding: "18px 18px 6px",
        background: "var(--surface-soft)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
        <Mono>Your custom code</Mono>
        <Mono>Read or find a customer code</Mono>
      </div>
      <CodeChecker scheme={scheme} shades={shades} />
    </section>
  );
}
