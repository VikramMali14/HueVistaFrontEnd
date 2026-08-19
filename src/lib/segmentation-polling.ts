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
  /** "CLEAN" / "MASK" on a FAILED status — which half of the run gave up. */
  failureStage?: string | null;
  /**
   * What the run is doing right now, in a sentence written for the person waiting —
   * "Still cleaning up your photo — this is taking a moment (2 of 4)".
   *
   * The backend works through a chain of suppliers and hands over whenever one is busy,
   * which used to be invisible from here: one unchanging spinner for anything between
   * forty seconds and eight minutes, so a working run and a dead one looked identical.
   * The sentence names none of them on purpose — it carries only that the run is alive
   * and how far along it is. Render it as given; it is already written for a user.
   * Null on a run that has not said anything yet, and on any finished project.
   */
  aiProgressNote?: string | null;
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
  /**
   * Called with each new `aiProgressNote` the backend reports, so the caller can put
   * the run's own words under its spinner.
   *
   * Only on CHANGE, and never with a blank: a run says the same sentence for as long as
   * one model is thinking, and re-setting identical state on every poll would re-render
   * the studio a few dozen times per run for no visible difference. A cancelled poll
   * stops calling this, like everything else here.
   */
  onProgress?: (note: string) => void;
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
  /**
   * `failureStage` travels with the error rather than being re-fetched: the caller
   * turns this into a "report this" prompt, and which box it ticks for the user
   * depends on which stage failed.
   */
  constructor(
    public readonly failureReason?: string | null,
    public readonly failureStage?: string | null,
  ) {
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
    onProgress,
    sleep = defaultSleep,
    now = Date.now,
  } = options;
  const start = now();
  // Never below the starting interval, even if a caller passes a smaller ceiling.
  const ceiling = Math.max(intervalMs, maxIntervalMs);
  let wait = intervalMs;
  let lastNote: string | null = null;
  for (;;) {
    if (isCancelled()) throw new PollCancelledError();
    if (now() - start > timeoutMs) throw new PollTimeoutError();
    const status = await getStatus();
    // The request may have resolved AFTER cancellation — don't act on it.
    if (isCancelled()) throw new PollCancelledError();
    const note = status.aiProgressNote;
    if (note && note !== lastNote) {
      lastNote = note;
      onProgress?.(note);
    }
    if (status.status === "SEGMENTED") return status;
    if (status.status === "FAILED") {
      throw new PollFailedError(status.failureReason, status.failureStage);
    }
    await sleep(wait);
    wait = Math.min(ceiling, Math.round(wait * backoffFactor));
  }
}
