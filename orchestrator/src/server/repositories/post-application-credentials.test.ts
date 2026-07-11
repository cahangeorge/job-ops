import { describe, expect, it, vi } from "vitest";

import {
  decryptPostApplicationCredentials,
  encryptPostApplicationCredentials,
  POST_APPLICATION_CREDENTIALS_UNAVAILABLE_MESSAGE,
} from "./post-application-credentials";

describe("post-application credential envelope", () => {
  const primaryKey = Buffer.alloc(32, 1).toString("base64");
  const previousKey = Buffer.alloc(32, 2).toString("base64");

  it("encrypts credential values without retaining fixture tokens in the JSON envelope", () => {
    const envelope = encryptPostApplicationCredentials(
      {
        refreshToken: "fixture-refresh-token",
        accessToken: "fixture-access-token",
        email: "candidate@example.com",
      },
      { primaryKey },
    );

    expect(JSON.stringify(envelope)).not.toContain("fixture-refresh-token");
    expect(JSON.stringify(envelope)).not.toContain("fixture-access-token");
    expect(envelope).toMatchObject({
      version: 1,
      keyId: "primary",
    });
    expect(decryptPostApplicationCredentials(envelope, { primaryKey })).toEqual(
      {
        credentials: {
          refreshToken: "fixture-refresh-token",
          accessToken: "fixture-access-token",
          email: "candidate@example.com",
        },
        shouldReencrypt: false,
      },
    );
  });

  it("decrypts with the previous key and marks the value for primary-key re-encryption", () => {
    const envelope = encryptPostApplicationCredentials(
      { refreshToken: "previous-key-token" },
      { primaryKey: previousKey },
    );

    expect(
      decryptPostApplicationCredentials(envelope, {
        primaryKey,
        previousKey,
      }),
    ).toEqual({
      credentials: { refreshToken: "previous-key-token" },
      shouldReencrypt: true,
    });
  });

  it.each([
    [
      "version",
      (envelope: Record<string, unknown>) => ({ ...envelope, version: 2 }),
    ],
    [
      "key ID",
      (envelope: Record<string, unknown>) => ({ ...envelope, keyId: "other" }),
    ],
    [
      "public metadata",
      (envelope: Record<string, unknown>) => ({
        ...envelope,
        metadata: {
          ...(envelope.metadata as Record<string, unknown>),
          email: "attacker@example.com",
        },
      }),
    ],
  ])("rejects an envelope whose %s has been tampered with", (_, tamper) => {
    const envelope = encryptPostApplicationCredentials(
      { refreshToken: "fixture-refresh-token", email: "candidate@example.com" },
      { primaryKey },
    );

    expect(() =>
      decryptPostApplicationCredentials(tamper(envelope) as never, {
        primaryKey,
      }),
    ).toThrow("could not be decrypted");
  });

  it.each([
    undefined,
    "not-base64",
    Buffer.alloc(31, 1).toString("base64"),
  ])("fails closed when the primary key is absent or invalid (%s)", (primaryKey) => {
    expect(() =>
      encryptPostApplicationCredentials(
        { refreshToken: "fixture-refresh-token" },
        { primaryKey },
      ),
    ).toThrow(POST_APPLICATION_CREDENTIALS_UNAVAILABLE_MESSAGE);
  });

  it("does not log credential values when decryption fails", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const envelope = encryptPostApplicationCredentials(
      { refreshToken: "fixture-refresh-token" },
      { primaryKey },
    );

    expect(() =>
      decryptPostApplicationCredentials(envelope, {
        primaryKey: Buffer.alloc(32, 3).toString("base64"),
      }),
    ).toThrow();
    expect(spy).not.toHaveBeenCalled();
  });
});
