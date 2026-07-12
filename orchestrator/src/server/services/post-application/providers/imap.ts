import { providerNotImplemented } from "./errors";
import type {
  PostApplicationProviderActionResult,
  PostApplicationProviderAdapter,
  PostApplicationProviderConnectArgs,
  PostApplicationProviderDisconnectArgs,
  PostApplicationProviderStatusArgs,
  PostApplicationProviderSyncArgs,
} from "./types";

function notImplemented(accountKey: string): never {
  throw providerNotImplemented(
    `IMAP provider is not implemented yet for account '${accountKey}'.`,
  );
}

export const imapProvider: PostApplicationProviderAdapter = {
  key: "imap",
  capabilities: {
    provider: "imap",
    connectionMode: "imap",
    sync: { supported: false },
    cursor: { supported: false, storage: "none" },
    checkpoint: { supported: false, storage: "none" },
    pagination: { supported: false },
    actions: { connect: false, status: true, sync: false, disconnect: false },
  },

  async connect(
    args: PostApplicationProviderConnectArgs,
  ): Promise<PostApplicationProviderActionResult> {
    return notImplemented(args.accountKey);
  },

  async status(
    args: PostApplicationProviderStatusArgs,
  ): Promise<PostApplicationProviderActionResult> {
    return {
      status: {
        provider: "imap",
        accountKey: args.accountKey,
        connected: false,
        integration: null,
        capabilities: imapProvider.capabilities,
        health: {
          check: "local_configuration",
          configured: false,
          connected: false,
          classification: "provider_unavailable",
          reason: "IMAP support is not available.",
        },
      },
      message: "IMAP support is not available.",
    };
  },

  async sync(
    args: PostApplicationProviderSyncArgs,
  ): Promise<PostApplicationProviderActionResult> {
    return notImplemented(args.accountKey);
  },

  async disconnect(
    args: PostApplicationProviderDisconnectArgs,
  ): Promise<PostApplicationProviderActionResult> {
    return notImplemented(args.accountKey);
  },
};
