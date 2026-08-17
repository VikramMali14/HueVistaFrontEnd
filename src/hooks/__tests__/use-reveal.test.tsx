// @vitest-environment jsdom
import { render, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReveal } from "../use-reveal";

/**
 * Records what it was asked to watch, and lets a test say "this one is on screen
 * now". The global stub in vitest.setup.ts is deliberately inert, so this replaces
 * it for the duration of the file.
 */
class FakeIO {
  static instances: FakeIO[] = [];
  readonly observed = new Set<Element>();
  private readonly cb: IntersectionObserverCallback;

  constructor(cb: IntersectionObserverCallback) {
    this.cb = cb;
    FakeIO.instances.push(this);
  }
  observe(el: Element) {
    this.observed.add(el);
  }
  unobserve(el: Element) {
    this.observed.delete(el);
  }
  disconnect() {
    this.observed.clear();
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  /** Fire an intersection for one element, as a real observer would on scroll. */
  scrollIntoView(el: Element) {
    this.cb(
      [{ target: el, isIntersecting: true } as unknown as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

/** The mood-gallery shape: a `.reveal` that only appears once a client-side check passes. */
function Page({ showLate }: { showLate: boolean }) {
  useReveal();
  return (
    <div>
      <div data-testid="early" className="reveal" />
      {showLate && <div data-testid="late" className="reveal" />}
    </div>
  );
}

/** Let the MutationObserver deliver, and run the frame its callback schedules. */
async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("useReveal", () => {
  beforeEach(() => {
    FakeIO.instances = [];
    vi.stubGlobal("IntersectionObserver", FakeIO);
    // Run the coalescing frame synchronously so the test does not wait on a timer.
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("watches elements that are already in the DOM at mount", async () => {
    const { getByTestId } = render(<Page showLate={false} />);
    await settle();

    const io = FakeIO.instances[0]!;
    expect(io.observed.has(getByTestId("early"))).toBe(true);
  });

  it("adds .in once a watched element scrolls into view", async () => {
    const { getByTestId } = render(<Page showLate={false} />);
    await settle();

    const early = getByTestId("early");
    act(() => FakeIO.instances[0]!.scrollIntoView(early));
    expect(early.classList.contains("in")).toBe(true);
  });

  it("watches a .reveal that mounts after the effect ran", async () => {
    // The home page's mood gallery renders only once `mounted && !reduceMotion &&
    // webglOk`, which is always after this effect's first pass. A one-shot
    // querySelectorAll missed it, so it never gained `.in` and sat at opacity 0
    // over a live WebGL canvas — a ~540px hole in the page.
    const { getByTestId, rerender } = render(<Page showLate={false} />);
    await settle();

    rerender(<Page showLate />);
    await settle();

    const io = FakeIO.instances[0]!;
    const late = getByTestId("late");
    expect(io.observed.has(late)).toBe(true);

    act(() => io.scrollIntoView(late));
    expect(late.classList.contains("in")).toBe(true);
  });

  it("stops watching the DOM after unmount", async () => {
    const { unmount } = render(<Page showLate={false} />);
    await settle();
    const io = FakeIO.instances[0]!;

    unmount();

    // A mutation arriving after teardown must not revive a disconnected observer.
    const stray = document.createElement("div");
    stray.className = "reveal";
    document.body.appendChild(stray);
    await settle();

    expect(io.observed.size).toBe(0);
    stray.remove();
  });
});
