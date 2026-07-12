/**
 * Settings repository - key/value storage for runtime configuration.
 */

import type { settingsRegistry } from "@shared/settings-registry";
import type Database from "better-sqlite3";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db/index";
import { getActiveTenantId } from "../tenancy/context";

const { settings } = schema;

export type SettingKey = Exclude<
  {
    [K in keyof typeof settingsRegistry]: (typeof settingsRegistry)[K]["kind"] extends "virtual"
      ? never
      : K;
  }[keyof typeof settingsRegistry],
  undefined
>;

export type SettingsWrite = { key: SettingKey; value: string | null };

/** Applies all changes through the caller's SQLite transaction and tenant scope. */
export function applySettingsWritesInTransaction(
  transaction: Database.Database,
  tenantId: string,
  writes: ReadonlyArray<SettingsWrite>,
): void {
  const now = new Date().toISOString();
  const remove = transaction.prepare(
    "DELETE FROM settings WHERE tenant_id = ? AND key = ?",
  );
  const upsert = transaction.prepare(
    "INSERT INTO settings(tenant_id, key, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(tenant_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
  );

  for (const write of writes) {
    if (write.value === null) {
      remove.run(tenantId, write.key);
    } else {
      upsert.run(tenantId, write.key, write.value, now, now);
    }
  }
}

export async function getSetting(key: SettingKey): Promise<string | null> {
  const tenantId = getActiveTenantId();
  const [row] = await db
    .select()
    .from(settings)
    .where(and(eq(settings.tenantId, tenantId), eq(settings.key, key)));
  return row?.value ?? null;
}

export async function getAllSettings(): Promise<
  Partial<Record<SettingKey, string>>
> {
  const tenantId = getActiveTenantId();
  const rows = await db
    .select()
    .from(settings)
    .where(eq(settings.tenantId, tenantId));
  return rows.reduce(
    (acc, row) => {
      acc[row.key as SettingKey] = row.value;
      return acc;
    },
    {} as Partial<Record<SettingKey, string>>,
  );
}

export async function setSetting(
  key: SettingKey,
  value: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  const tenantId = getActiveTenantId();

  if (value === null) {
    await db
      .delete(settings)
      .where(and(eq(settings.tenantId, tenantId), eq(settings.key, key)));
    return;
  }

  const [existing] = await db
    .select({ key: settings.key })
    .from(settings)
    .where(and(eq(settings.tenantId, tenantId), eq(settings.key, key)));

  if (existing) {
    await db
      .update(settings)
      .set({ value, updatedAt: now })
      .where(and(eq(settings.tenantId, tenantId), eq(settings.key, key)));
    return;
  }

  await db.insert(settings).values({
    tenantId,
    key,
    value,
    createdAt: now,
    updatedAt: now,
  });
}
