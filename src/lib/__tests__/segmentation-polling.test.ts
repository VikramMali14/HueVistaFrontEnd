import { describe, it, expect, vi } from "vitest";
import {
  DEFAULT_INTERVAL_MS,
  PollCancelledError,
  PollFailedError,
  PollTimeoutError,
  pollUntilSegmented,
} from "../segmentation-polling";

/** Build a getStatus mock that walks through the given statuses, then repeats the last. */
function statusSequence(statuses: string[], failureReason?: string | null) {
  let i = 0;
  return vi.fn(async () => {
    const status = statuses[Math.min(i, statuses.length - 1)]!;
    i += 1;
    return { status, failureReason: status === "FAILED" ? failureReason : null };
  });
}

/** Injectable fake clock: `sleep` advances `now` instantly — no real timers. */
function fakeClock() {
  let t = 0;
  return {
    now: () => t,
    sleep: vi.fn(async (ms: number) => {
      t += ms;
    }),
  };
}

describe("pollUntilSegmented", () => {
  it("resolves with the final payload after N in-progress polls", async () => {
    const getStatus = statusSequence(["CREATED", "SEGMENTING", "SEGMENTING", "SEGMENTED"]);
    const { now, sleep } = fakeClock();

    const result = await pollUntilSegmented({ getStatus, now, sleep });

    expect(result.status).toBe("SEGMENTED");
    expect(getStatus).toHaveBeenCalledTimes(4);
    // One sleep between each poll, none after the final one.
    expect(sleep).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledWith(DEFAULT_INTERVAL_MS);
  });

  it("respects a custom poll interval", async () => {
    const getStatus = statusSequence(["SEGMENTING", "SEGMENTED"]);
    const { now, sleep } = fakeClock();

    await pollUntilSegmented({ getStatus, now, sleep, intervalMs: 250 });

    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(250);
  });

  it("throws PollFailedError carrying the backend failureReason on FAILED", async () => {
    const getStatus = statusSequence(["SEGMENTING", "FAILED"], "No walls were found in this photo.");
    const { now, sleep } = fakeClock();

    const err = await pollUntilSegmented({ getStatus, now, sleep }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(PollFailedError);
    const failed = err as PollFailedError;
    expect(failed.kind).toBe("failed");
    expect(failed.failureReason).toBe("No walls were found in this photo.");
    expect(failed.message).toBe("No walls were found in this photo.");
  });

  it("falls back to a friendly message when FAILED has no failureReason", async () => {
    const getStatus = statusSequence(["FAILED"], null);
    const { now, sleep } = fakeClock();

    const err = await pollUntilSegmented({ getStatus, now, sleep }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(PollFailedError);
    expect((err as PollFailedError).message).toBe("Could not detect the walls.");
  });

  it("throws PollTimeoutError once the injected clock passes the deadline, and stops polling", async () => {
    const getStatus = statusSequence(["SEGMENTING"]);
    const { now, sleep } = fakeClock();

    const err = await pollUntilSegmented({
      getStatus,
      now,
      sleep,
      timeoutMs: 5000,
      intervalMs: 1000,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(PollTimeoutError);
    const timeout = err as PollTimeoutError;
    expect(timeout.kind).toBe("timeout");
    expect(timeout.message).toBe("Detecting walls timed out. Please try again.");
    // Polls at t = 0..5000 (the t=5000 check is not yet PAST the deadline),
    // then the t=6000 iteration throws before fetching again.
    expect(getStatus).toHaveBeenCalledTimes(6);
    const callsAtThrow = getStatus.mock.calls.length;
    // The loop has genuinely stopped — nothing fires later.
    await Promise.resolve();
    expect(getStatus).toHaveBeenCalledTimes(callsAtThrow);
  });

  it("throws PollCancelledError before the first request when already cancelled", async () => {
    const getStatus = statusSequence(["SEGMENTED"]);
    const { now, sleep } = fakeClock();

    const err = await pollUntilSegmented({
      getStatus,
      now,
      sleep,
      isCancelled: () => true,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(PollCancelledError);
    expect((err as PollCancelledError).kind).toBe("cancelled");
    expect(getStatus).not.toHaveBeenCalled();
  });

  it("ignores a status that resolves after cancellation (cancel wins over SEGMENTED)", async () => {
    const { now, sleep } = fakeClock();
    let cancelled = false;
    const getStatus = vi.fn(async () => {
      // The component unmounts while the request is in flight…
      cancelled = true;
      // …and the request still resolves successfully afterwards.
      return { status: "SEGMENTED" };
    });

    const err = await pollUntilSegmented({
      getStatus,
      now,
      sleep,
      isCancelled: () => cancelled,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(PollCancelledError);
    expect(getStatus).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
