import { createHash } from "node:crypto";
import type Database from "better-sqlite3";

export type VersionedMigration = {
  version: number;
  sql: string;
};

export const VERSIONED_MIGRATIONS: readonly VersionedMigration[] = [
  {
    version: 1,
    sql: "CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_tenant_id_id_unique ON jobs(tenant_id, id)",
  },
];

function checksum(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

export function runVersionedMigrations(
  database: Database.Database,
  migrations: readonly VersionedMigration[] = VERSIONED_MIGRATIONS,
): void {
  const versions = new Set<number>();
  for (const migration of migrations) {
    if (versions.has(migration.version)) {
      throw new Error(`Duplicate migration version: ${migration.version}`);
    }
    versions.add(migration.version);
  }

  database.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  const appliedMigration = database.prepare(
    "SELECT checksum FROM schema_migrations WHERE version = ?",
  );
  const recordMigration = database.prepare(
    "INSERT INTO schema_migrations(version, checksum) VALUES (?, ?)",
  );

  for (const migration of migrations) {
    const migrationChecksum = checksum(migration.sql);
    const applied = appliedMigration.get(migration.version) as
      | { checksum: string }
      | undefined;
    if (applied) {
      if (applied.checksum !== migrationChecksum) {
        throw new Error(
          `Checksum drift for migration version ${migration.version}`,
        );
      }
      continue;
    }

    database.transaction(() => {
      database.exec(migration.sql);
      recordMigration.run(migration.version, migrationChecksum);
    })();
  }
}
