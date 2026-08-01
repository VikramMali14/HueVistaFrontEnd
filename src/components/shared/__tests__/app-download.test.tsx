// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

// The component reads the pathname to stay off the signed-in app and the phone
// hand-off page; each test sets this before mounting.
let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36";
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

function setAgent(ua: string, maxTouchPoints = 1) {
  Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true });
  Object.defineProperty(window.navigator, "maxTouchPoints", { value: maxTouchPoints, configurable: true });
}

/**
 * APK_URL is inlined from the environment when the module first loads, so each
 * case resets the module registry and re-imports with the env it wants.
 */
async function mount(opts: { url?: string; version?: string; path?: string } = {}) {
  vi.stubEnv("NEXT_PUBLIC_APK_URL", opts.url ?? "");
  vi.stubEnv("NEXT_PUBLIC_APK_VERSION", opts.version ?? "");
  pathname = opts.path ?? "/";
  vi.resetModules();
  const { AppDownloadBanner } = await import("../app-download");
  return render(<AppDownloadBanner />);
}

beforeEach(() => {
  setAgent(ANDROID_UA);
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("AppDownloadBanner", () => {
  it("offers the APK when one is published", async () => {
    await mount({ url: "https://cdn.example.com/huevista.apk", version: "0.1.0" });

    const link = screen.getByRole("link", { name: "Download" });
    expect(link).toHaveAttribute("href", "https://cdn.example.com/huevista.apk");
    expect(screen.getByText("APK · v0.1.0")).toBeInTheDocument();
  });

  it("falls back to a generic label when no version is configured", async () => {
    await mount({ url: "https://cdn.example.com/huevista.apk" });
    expect(screen.getByText("Direct APK download")).toBeInTheDocument();
  });

  // The whole point of the blank default: a link to nothing is worse than no link.
  it("renders nothing until an APK URL is configured", async () => {
    const { container } = await mount({ url: "" });
    expect(container).toBeEmptyDOMElement();
  });

  it("stays off iOS, which cannot install an APK", async () => {
    setAgent(IPHONE_UA);
    const { container } = await mount({ url: "https://cdn.example.com/huevista.apk" });
    expect(container).toBeEmptyDOMElement();
  });

  it("stays off iPadOS, which reports itself as a Mac", async () => {
    setAgent(IPAD_UA, 5);
    const { container } = await mount({ url: "https://cdn.example.com/huevista.apk" });
    expect(container).toBeEmptyDOMElement();
  });

  it("still shows on a desktop Mac, which is a real mobile-view case", async () => {
    setAgent(IPAD_UA, 0); // same UA string, no touch — an actual Mac
    await mount({ url: "https://cdn.example.com/huevista.apk" });
    expect(screen.getByRole("link", { name: "Download" })).toBeInTheDocument();
  });

  it.each(["/dashboard", "/atelier", "/m/abc123", "/account"])(
    "keeps out of the way on %s",
    async (path) => {
      const { container } = await mount({ url: "https://cdn.example.com/huevista.apk", path });
      expect(container).toBeEmptyDOMElement();
    },
  );

  it("shows on public pages", async () => {
    await mount({ url: "https://cdn.example.com/huevista.apk", path: "/pricing" });
    expect(screen.getByRole("link", { name: "Download" })).toBeInTheDocument();
  });

  it("stays dismissed on the next page view", async () => {
    window.localStorage.setItem("hv-apk-dismissed", "1");
    const { container } = await mount({ url: "https://cdn.example.com/huevista.apk" });
    expect(container).toBeEmptyDOMElement();
  });
});
