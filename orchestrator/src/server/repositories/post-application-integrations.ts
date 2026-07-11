import { randomUUID } from "node:crypto";
import { serviceUnavailable } from "@infra/errors";
import type {
  PostApplicationIntegration,
  PostApplicationIntegrationStatus,
  PostApplicationProvider,
} from "@shared/types";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { getActiveTenantId } from "../tenancy/context";
import {
  decryptPostApplicationCredentials,
  encryptPostApplicationCredentials,
  isLegacyPostApplicationCredentials,
  isPostApplicationCredentialEnvelope,
  type PostApplicationCredentials,
  summarizePostApplicationCredentials,
} from "./post-application-credentials";

const { postApplicationIntegrations } = schema;

type IntegrationCredentials = PostApplicationCredentials;

export type PostApplicationIntegrationWithCredentials = Omit<
  PostApplicationIntegration,
  "credentials"
> & {
  credentials: IntegrationCredentials | null;
};

type UpsertConnectedIntegrationInput = {
  provider: PostApplicationProvider;
  accountKey: string;
  displayName?: string | null;
  credentials: IntegrationCredentials;
};

type UpdatePostApplicationIntegrationSyncStateInput = {
  provider: PostApplicationProvider;
  accountKey: string;
  lastSyncedAt?: number | null;
  lastError?: string | null;
  credentials?: IntegrationCredentials | null;
  status?: PostApplicationIntegrationStatus;
};

function asCredentials(value: unknown): IntegrationCredentials | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as IntegrationCredentials;
}

function decryptStoredCredentials(storedCredentials: IntegrationCredentials) {
  if (isPostApplicationCredentialEnvelope(storedCredentials)) {
    return decryptPostApplicationCredentials(storedCredentials);
  }
  if (isLegacyPostApplicationCredentials(storedCredentials)) {
    return { credentials: storedCredentials, shouldReencrypt: true };
  }
  throw serviceUnavailable(
    "Post-application credentials could not be decrypted.",
  );
}

function mapRowToIntegration(
  row: typeof postApplicationIntegrations.$inferSelect,
): PostApplicationIntegration {
  const credentials = asCredentials(row.credentials);
  return {
    id: row.id,
    provider: row.provider,
    accountKey: row.accountKey,
    displayName: row.displayName,
    status: row.status as PostApplicationIntegrationStatus,
    credentials: credentials
      ? isPostApplicationCredentialEnvelope(credentials)
        ? credentials.metadata
        : summarizePostApplicationCredentials(credentials)
      : null,
    lastConnectedAt: row.lastConnectedAt,
    lastSyncedAt: row.lastSyncedAt,
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function getIntegrationRow(
  provider: PostApplicationProvider,
  accountKey: string,
) {
  const tenantId = getActiveTenantId();
  const [row] = await db
    .select()
    .from(postApplicationIntegrations)
    .where(
      and(
        eq(postApplicationIntegrations.provider, provider),
        eq(postApplicationIntegrations.accountKey, accountKey),
        eq(postApplicationIntegrations.tenantId, tenantId),
      ),
    );
  return row ?? null;
}

export async function getPostApplicationIntegration(
  provider: PostApplicationProvider,
  accountKey: string,
): Promise<PostApplicationIntegration | null> {
  const row = await getIntegrationRow(provider, accountKey);

  return row ? mapRowToIntegration(row) : null;
}

export async function getPostApplicationIntegrationWithCredentials(
  provider: PostApplicationProvider,
  accountKey: string,
): Promise<PostApplicationIntegrationWithCredentials | null> {
  const row = await getIntegrationRow(provider, accountKey);
  if (!row) return null;

  const storedCredentials = asCredentials(row.credentials);
  if (!storedCredentials) {
    return { ...mapRowToIntegration(row), credentials: null };
  }

  const decrypted = decryptStoredCredentials(storedCredentials);

  if (decrypted.shouldReencrypt) {
    const tenantId = getActiveTenantId();
    const result = await db
      .update(postApplicationIntegrations)
      .set({
        credentials: encryptPostApplicationCredentials(decrypted.credentials),
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(postApplicationIntegrations.id, row.id),
          eq(postApplicationIntegrations.tenantId, tenantId),
          eq(postApplicationIntegrations.credentials, row.credentials),
        ),
      );

    if (result.changes === 0) {
      const current = await getIntegrationRow(provider, accountKey);
      if (!current) return null;
      const currentCredentials = asCredentials(current.credentials);
      if (!currentCredentials) {
        return { ...mapRowToIntegration(current), credentials: null };
      }
      return {
        ...mapRowToIntegration(current),
        credentials: decryptStoredCredentials(currentCredentials).credentials,
      };
    }
  }

  return {
    ...mapRowToIntegration(row),
    credentials: decrypted.credentials,
  };
}

export async function upsertConnectedPostApplicationIntegration(
  input: UpsertConnectedIntegrationInput,
): Promise<PostApplicationIntegration> {
  const nowEpoch = Date.now();
  const nowIso = new Date(nowEpoch).toISOString();
  const tenantId = getActiveTenantId();
  const existing = await getPostApplicationIntegration(
    input.provider,
    input.accountKey,
  );

  if (existing) {
    await db
      .update(postApplicationIntegrations)
      .set({
        displayName: input.displayName ?? existing.displayName,
        status: "connected",
        credentials: encryptPostApplicationCredentials(input.credentials),
        lastConnectedAt: nowEpoch,
        lastError: null,
        updatedAt: nowIso,
      })
      .where(eq(postApplicationIntegrations.id, existing.id));

    const updated = await getPostApplicationIntegration(
      input.provider,
      input.accountKey,
    );
    if (!updated) {
      throw new Error(
        `Failed to load updated integration ${input.provider}/${input.accountKey}.`,
      );
    }
    return updated;
  }

  const id = randomUUID();
  await db.insert(postApplicationIntegrations).values({
    id,
    tenantId,
    provider: input.provider,
    accountKey: input.accountKey,
    displayName: input.displayName ?? null,
    status: "connected",
    credentials: encryptPostApplicationCredentials(input.credentials),
    lastConnectedAt: nowEpoch,
    lastError: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  const created = await getPostApplicationIntegration(
    input.provider,
    input.accountKey,
  );
  if (!created) {
    throw new Error(
      `Failed to load created integration ${input.provider}/${input.accountKey}.`,
    );
  }
  return created;
}

export async function disconnectPostApplicationIntegration(
  provider: PostApplicationProvider,
  accountKey: string,
): Promise<PostApplicationIntegration | null> {
  const existing = await getPostApplicationIntegration(provider, accountKey);
  if (!existing) return null;

  const nowIso = new Date().toISOString();
  await db
    .update(postApplicationIntegrations)
    .set({
      status: "disconnected",
      credentials: null,
      lastError: null,
      updatedAt: nowIso,
    })
    .where(eq(postApplicationIntegrations.id, existing.id));

  return getPostApplicationIntegration(provider, accountKey);
}

export async function updatePostApplicationIntegrationSyncState(
  input: UpdatePostApplicationIntegrationSyncStateInput,
): Promise<PostApplicationIntegration | null> {
  const existing = await getPostApplicationIntegration(
    input.provider,
    input.accountKey,
  );
  if (!existing) return null;

  const nowIso = new Date().toISOString();
  await db
    .update(postApplicationIntegrations)
    .set({
      ...(input.status ? { status: input.status } : {}),
      ...(input.lastSyncedAt !== undefined
        ? { lastSyncedAt: input.lastSyncedAt }
        : {}),
      ...(input.lastError !== undefined ? { lastError: input.lastError } : {}),
      ...(input.credentials !== undefined
        ? {
            credentials: input.credentials
              ? encryptPostApplicationCredentials(input.credentials)
              : null,
          }
        : {}),
      updatedAt: nowIso,
    })
    .where(eq(postApplicationIntegrations.id, existing.id));

  return getPostApplicationIntegration(input.provider, input.accountKey);
}
