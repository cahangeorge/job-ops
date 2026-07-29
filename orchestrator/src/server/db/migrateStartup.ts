import { mkdirSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { getDataDir } from "../config/dataDir";

const dataDir = getDataDir();
mkdirSync(dataDir, { recursive: true });

const databasePath = join(dataDir, "jobs.db");
const database = new Database(databasePath);
const tableNames = new Set(
  (
    database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>
  ).map(({ name }) => name),
);
database.close();

if (tableNames.has("jobs_new") && !tableNames.has("jobs")) {
  throw new Error(
    "Database has an interrupted jobs table rebuild; restore or repair it before startup",
  );
}

const requiredBaseTables = ["jobs", "tenants", "settings", "pipeline_runs"];
const hasBaseSchema = requiredBaseTables.every((tableName) =>
  tableNames.has(tableName),
);

if (hasBaseSchema) {
  await import("./migrateVersioned");
} else {
  await import("./migrate");
}
