import type { PostApplicationProvider } from "@shared/types";

type ProviderExternalEvent = {
  id: string;
  threadId?: string | null;
};

export type NormalizedProviderExternalEvent = {
  externalId: string;
  externalThreadId: string | null;
  normalizedKey: string;
};

export function normalizeProviderExternalEvents(input: {
  provider: PostApplicationProvider;
  accountKey: string;
  events: readonly ProviderExternalEvent[];
}): {
  cursor: { supported: false; checkpoint: null; next: null };
  events: NormalizedProviderExternalEvent[];
} {
  const uniqueEvents = new Map<string, NormalizedProviderExternalEvent>();
  for (const event of input.events) {
    const externalId = event.id.trim();
    if (!externalId) continue;
    const normalizedKey = `${input.provider}:${input.accountKey}:${externalId}`;
    uniqueEvents.set(normalizedKey, {
      externalId,
      externalThreadId: event.threadId?.trim() || null,
      normalizedKey,
    });
  }
  return {
    cursor: { supported: false, checkpoint: null, next: null },
    events: [...uniqueEvents.values()],
  };
}
