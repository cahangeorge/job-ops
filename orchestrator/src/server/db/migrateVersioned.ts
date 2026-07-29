import { mkdirSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { getDataDir } from "../config/dataDir";
import { runVersionedMigrations } from "./versionedMigrations";

const dataDir = getDataDir();
mkdirSync(dataDir, { recursive: true });

const database = new Database(join(dataDir, "jobs.db"));

try {
  const hasBaseSchema = Boolean(
    database
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'jobs'",
      )
      .get(),
  );
  if (!hasBaseSchema) {
    throw new Error(
      "Base database schema is missing; run the startup migrator first",
    );
  }

  database.pragma("foreign_keys = ON");
  runVersionedMigrations(database);
} finally {
  database.close();
}
