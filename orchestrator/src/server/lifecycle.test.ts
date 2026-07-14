import { describe, expect, it, vi } from "vitest";
import { createServerLifecycle } from "./lifecycle";

describe("server lifecycle", () => {
  it("registers shutdown once and quiesces before closing without exiting", async () => {
    const stopWorker = vi.fn().mockResolvedValue(undefined);
    const closeServer = vi.fn().mockResolvedValue(undefined);
    const on = vi.fn();
    const lifecycle = createServerLifecycle({
      stopWorker,
      closeServer,
      on,
      reportError: vi.fn(),
    });

    lifecycle.register();
    lifecycle.register();
    expect(on).toHaveBeenCalledTimes(2);

    await lifecycle.shutdown("SIGTERM");
    expect(stopWorker).toHaveBeenCalledWith({ timeoutMs: 10_000 });
    expect(closeServer).toHaveBeenCalledAfter(stopWorker);
  });

  it("shares an in-progress shutdown across duplicate signals", async () => {
    let release!: () => void;
    const stopWorker = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const closeServer = vi.fn().mockResolvedValue(undefined);
    const lifecycle = createServerLifecycle({
      stopWorker,
      closeServer,
      on: vi.fn(),
      reportError: vi.fn(),
    });

    const first = lifecycle.shutdown("SIGINT");
    const second = lifecycle.shutdown("SIGTERM");
    release();
    await Promise.all([first, second]);
    expect(stopWorker).toHaveBeenCalledTimes(1);
    expect(closeServer).toHaveBeenCalledTimes(1);
  });

  it("closes the server when stopping the worker rejects", async () => {
    const stopError = new Error("worker stop failed");
    const closeServer = vi.fn().mockResolvedValue(undefined);
    const lifecycle = createServerLifecycle({
      stopWorker: vi.fn().mockRejectedValue(stopError),
      closeServer,
      on: vi.fn(),
      reportError: vi.fn(),
    });

    await expect(lifecycle.shutdown("SIGTERM")).rejects.toThrow(stopError);
    expect(closeServer).toHaveBeenCalledTimes(1);
  });

  it("reports a rejected close from a signal callback without an unhandled rejection", async () => {
    const listeners = new Map<string, () => void>();
    const closeError = new Error("close failed");
    const reportError = vi.fn();
    const lifecycle = createServerLifecycle({
      stopWorker: vi.fn().mockResolvedValue(undefined),
      closeServer: vi.fn().mockRejectedValue(closeError),
      on: (signal, listener) => listeners.set(signal, listener),
      reportError,
    });

    lifecycle.register();
    listeners.get("SIGTERM")?.();

    await vi.waitFor(() => {
      expect(reportError).toHaveBeenCalledWith({
        signal: "SIGTERM",
        error: expect.objectContaining({ message: "close failed" }),
      });
    });
  });

  it("handles duplicate signal callbacks with one shutdown", async () => {
    const listeners = new Map<string, () => void>();
    const stopWorker = vi.fn().mockResolvedValue(undefined);
    const closeServer = vi.fn().mockResolvedValue(undefined);
    const lifecycle = createServerLifecycle({
      stopWorker,
      closeServer,
      on: (signal, listener) => listeners.set(signal, listener),
      reportError: vi.fn(),
    });

    lifecycle.register();
    listeners.get("SIGINT")?.();
    listeners.get("SIGTERM")?.();

    await vi.waitFor(() => {
      expect(closeServer).toHaveBeenCalledTimes(1);
    });
    expect(stopWorker).toHaveBeenCalledTimes(1);
  });
});
