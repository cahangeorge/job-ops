import { POST_APPLICATION_PROVIDER_CAPABILITY_CONNECTION_MODES } from "@shared/types";
import { postApplicationProviderCapabilitiesSchema } from "@shared/types/post-application-capabilities";
import { describe, expect, it } from "vitest";
import {
  duplicateGmailExternalEvents,
  expectedNormalizedGmailEvent,
} from "./fixtures/duplicate-gmail-events.fixture";
import { gmailProvider } from "./gmail";
import { imapProvider } from "./imap";
import { normalizeProviderExternalEvents } from "./normalization";

describe("post-application provider capabilities", () => {
  it("runtime-validates the safe capability union", () => {
    expect(POST_APPLICATION_PROVIDER_CAPABILITY_CONNECTION_MODES).toEqual([
      "oauth2",
      "imap",
    ]);
    expect(
      postApplicationProviderCapabilitiesSchema.safeParse(
        gmailProvider.capabilities,
      ).success,
    ).toBe(true);
    expect(
      postApplicationProviderCapabilitiesSchema.safeParse(
        imapProvider.capabilities,
      ).success,
    ).toBe(true);
    expect(
      postApplicationProviderCapabilitiesSchema.safeParse({
        ...gmailProvider.capabilities,
        connectionMode: "api_key",
      }).success,
    ).toBe(false);
  });

  it("declares Gmail and IMAP capabilities without credentials", () => {
    expect(gmailProvider.capabilities).toMatchObject({
      provider: "gmail",
      connectionMode: "oauth2",
      sync: { supported: true },
      cursor: { supported: false, storage: "none" },
      checkpoint: { supported: false, storage: "none" },
      pagination: { supported: false },
      actions: { connect: true, status: true, sync: true, disconnect: true },
    });
    expect(imapProvider.capabilities).toMatchObject({
      provider: "imap",
      connectionMode: "imap",
      sync: { supported: false },
      actions: { connect: false, status: true, sync: false, disconnect: false },
    });
    expect(
      JSON.stringify([gmailProvider.capabilities, imapProvider.capabilities]),
    ).not.toMatch(/token|authorization|password|secret/i);
  });
});

describe("provider external event normalization", () => {
  it("collapses duplicate fixture input to one canonical event with no persisted cursor", () => {
    expect(
      normalizeProviderExternalEvents({
        provider: "gmail",
        accountKey: "primary",
        events: duplicateGmailExternalEvents,
      }),
    ).toEqual({
      cursor: { supported: false, checkpoint: null, next: null },
      events: [expectedNormalizedGmailEvent],
    });
  });
});
