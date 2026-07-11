import { existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("camoufox-js", () => ({
  launchOptions: vi.fn(async () => ({
    executablePath: join(tmpdir(), "fake-camoufox", "camoufox-bin"),
    args: ["--from-camoufox"],
  })),
}));

import { createLaunchOptions } from "../src/launch.js";

describe("createLaunchOptions", () => {
  const originalHome = process.env.HOME;

  afterEach(() => {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
  });

  it("launches Camoufox with an owned HOME instead of inheriting /root", async () => {
    process.env.HOME = "/root";

    const { launchOptions } = await createLaunchOptions({ headless: false });
    const home = launchOptions.env?.HOME;

    expect(home).toBe(
      join(tmpdir(), `jobops-camoufox-home-${process.getuid?.() ?? 0}`),
    );
    expect(home).not.toBe("/root");
    expect(existsSync(home ?? "")).toBe(true);
    expect(statSync(home ?? "").uid).toBe(process.getuid?.() ?? 0);
  });
});
