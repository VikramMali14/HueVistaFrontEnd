/**
 * Segmentation status polling, extracted as a pure module so it can be unit
 * tested with fake timers (injectable `sleep`/`now`) and reused outside the
 * visualizer component.
 *
 * `pollUntilSegmented` repeatedly calls `getStatus` until the payload reports
 * status "SEGMENTED", and distinguishes the three non-success outcomes with
 * dedicated error classes (each carries a literal `kind` discriminator):
 *
 *  - PollTimeoutError   — the deadline elapsed before segmentation finished;
 *  - PollFailedError    — the backend reported status "FAILED";
 *  - PollCancelledError — `isCancelled()` flipped true (unmount / superseded).
 */

/** Minimum shape a status payload must have. */
export interface SegmentationStatusLike {
  status: string;
  failureReason?: string | null;
}

export interface PollOptions<T extends SegmentationStatusLike = SegmentationStatusLike & Record<string, unknown>> {
  /** Fetches the current status payload (e.g. `() => api.getProjectStatus(id)`). */
  getStatus: () => Promise<T>;
  /** Give-up deadline in ms. Default 90_000. */
  timeoutMs?: number;
  /** Delay before the FIRST re-check, in ms. Default 1500. Grows from there. */
  intervalMs?: number;
  /** Ceiling the backing-off interval never exceeds, in ms. Default 8000. */
  maxIntervalMs?: number;
  /** How fast the interval grows each round. Default 1.5; 1 keeps a flat cadence. */
  backoffFactor?: number;
  /** Cooperative cancellation — checked before every request and after every sleep. */
  isCancelled?: () => boolean;
  /** Injectable so tests can use fake timers. Default: setTimeout-based sleep. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable clock so tests can use fake timers. Default: Date.now. */
  now?: () => number;
}

export const DEFAULT_TIMEOUT_MS = 90_000;
export const DEFAULT_INTERVAL_MS = 1500;
/**
 * The interval backs off rather than holding a fixed cadence for the whole run.
 *
 * Wall detection is two generative model calls back to back and the deadline that
 * covers their worst case is eight minutes. At a flat 1.5s that was a request every
 * second and a half for as long as it took — over a hundred of them on a slow run,
 * every one of them asking a question whose answer had not changed. The first few
 * checks stay quick, because a fast run should still feel instant; after that the
 * gap grows to eight seconds, which turns a two-and-a-half minute wait from about a
 * hundred requests into roughly twenty-five.
 */
export const DEFAULT_MAX_INTERVAL_MS = 8_000;
export const DEFAULT_BACKOFF_FACTOR = 1.5;

export class PollTimeoutError extends Error {
  readonly kind = "timeout" as const;
  constructor(message = "Detecting walls timed out. Please try again.") {
    super(message);
    this.name = "PollTimeoutError";
  }
}

export class PollFailedError extends Error {
  readonly kind = "failed" as const;
  constructor(public readonly failureReason?: string | null) {
    super(failureReason || "Could not detect the walls.");
    this.name = "PollFailedError";
  }
}

export class PollCancelledError extends Error {
  readonly kind = "cancelled" as const;
  constructor(message = "Cancelled.") {
    super(message);
    this.name = "PollCancelledError";
  }
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Poll until the project is SEGMENTED. Resolves with the final status payload
 * (generic, so callers keep their concrete typing — e.g. `ProjectDetail`).
 *
 * @throws PollTimeoutError when `timeoutMs` elapses first
 * @throws PollFailedError when the backend reports status "FAILED"
 * @throws PollCancelledError when `isCancelled()` returns true
 */
export async function pollUntilSegmented<T extends SegmentationStatusLike>(options: PollOptions<T>): Promise<T> {
  const {
    getStatus,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    intervalMs = DEFAULT_INTERVAL_MS,
    maxIntervalMs = DEFAULT_MAX_INTERVAL_MS,
    backoffFactor = DEFAULT_BACKOFF_FACTOR,
    isCancelled = () => false,
    sleep = defaultSleep,
    now = Date.now,
  } = options;
  const start = now();
  // Never below the starting interval, even if a caller passes a smaller ceiling.
  const ceiling = Math.max(intervalMs, maxIntervalMs);
  let wait = intervalMs;
  for (;;) {
    if (isCancelled()) throw new PollCancelledError();
    if (now() - start > timeoutMs) throw new PollTimeoutError();
    const status = await getStatus();
    // The request may have resolved AFTER cancellation — don't act on it.
    if (isCancelled()) throw new PollCancelledError();
    if (status.status === "SEGMENTED") return status;
    if (status.status === "FAILED") throw new PollFailedError(status.failureReason);
    await sleep(wait);
    wait = Math.min(ceiling, Math.round(wait * backoffFactor));
  }
}
