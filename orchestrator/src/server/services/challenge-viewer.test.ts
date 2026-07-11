import { describe, expect, it } from "vitest";
import {
  getXDisplaySocketPath,
  waitForXDisplaySocket,
} from "./challenge-viewer";

describe("challenge-viewer X display readiness", () => {
  it("maps local X display names to their unix socket path", () => {
    expect(getXDisplaySocketPath(":99")).toBe("/tmp/.X11-unix/X99");
    expect(getXDisplaySocketPath(":0.0")).toBe("/tmp/.X11-unix/X0");
    expect(getXDisplaySocketPath("localhost:10.0")).toBeNull();
  });

  it("waits until the X display socket exists before continuing", async () => {
    const checks: string[] = [];
    const existsResults = [false, false, true];

    await expect(
      waitForXDisplaySocket(":99", {
        timeoutMs: 1_000,
        intervalMs: 1,
        exists: (path) => {
          checks.push(path);
          return existsResults.shift() ?? true;
        },
      }),
    ).resolves.toBe(true);

    expect(checks).toEqual([
      "/tmp/.X11-unix/X99",
      "/tmp/.X11-unix/X99",
      "/tmp/.X11-unix/X99",
    ]);
  });
});
