import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { runVersionedMigrations } from "./versionedMigrations";

describe("versioned SQLite migrations", () => {
  const databases: Database.Database[] = [];

  afterEach(() => {
    for (const database of databases.splice(0)) database.close();
  });

  function databaseWithJobs(): Database.Database {
    const database = new Database(":memory:");
    databases.push(database);
    database.exec(
      "CREATE TABLE jobs (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL)",
    );
    return database;
  }

  function assertCompositeForeignKey(database: Database.Database): void {
    database.pragma("foreign_keys = ON");
    database.exec(`
      CREATE TABLE new_job_child (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        job_id TEXT NOT NULL,
        FOREIGN KEY (tenant_id, job_id) REFERENCES jobs(tenant_id, id)
      )
    `);
    database
      .prepare("INSERT INTO jobs(id, tenant_id) VALUES (?, ?)")
      .run("job-a", "tenant-a");
    database
      .prepare("INSERT INTO jobs(id, tenant_id) VALUES (?, ?)")
      .run("job-b", "tenant-b");
    expect(() =>
      database
        .prepare(
          "INSERT INTO new_job_child(id, tenant_id, job_id) VALUES (?, ?, ?)",
        )
        .run("child-a", "tenant-a", "job-a"),
    ).not.toThrow();
    expect(() =>
      database
        .prepare(
          "INSERT INTO new_job_child(id, tenant_id, job_id) VALUES (?, ?, ?)",
        )
        .run("child-cross", "tenant-a", "job-b"),
    ).toThrow(/FOREIGN KEY constraint failed/);
    expect(() =>
      database
        .prepare(
          "INSERT INTO new_job_child(id, tenant_id, job_id) VALUES (?, ?, ?)",
        )
        .run("child-missing", "tenant-a", "missing"),
    ).toThrow(/FOREIGN KEY constraint failed/);
  }

  it("adds the composite jobs key for a fresh database", () => {
    const database = databaseWithJobs();

    runVersionedMigrations(database);

    assertCompositeForeignKey(database);
  });

  it("applies once and supports an existing database", () => {
    const database = databaseWithJobs();
    database
      .prepare("INSERT INTO jobs(id, tenant_id) VALUES (?, ?)")
      .run("existing-job", "tenant-existing");

    runVersionedMigrations(database);
    runVersionedMigrations(database);

    expect(
      database.prepare("SELECT count(*) AS count FROM schema_migrations").get(),
    ).toEqual({ count: 1 });
    assertCompositeForeignKey(database);
  });

  it("rejects duplicate versions and checksum drift", () => {
    const database = databaseWithJobs();
    const migration = {
      version: 2,
      sql: "CREATE TABLE migration_probe (id TEXT)",
    };

    runVersionedMigrations(database, [migration]);

    expect(() =>
      runVersionedMigrations(database, [
        { ...migration, sql: "CREATE TABLE changed_probe (id TEXT)" },
      ]),
    ).toThrow(/Checksum drift/);
    expect(() =>
      runVersionedMigrations(database, [migration, migration]),
    ).toThrow(/Duplicate migration version/);
  });

  it("rolls back a failed migration without recording it", () => {
    const database = databaseWithJobs();

    expect(() =>
      runVersionedMigrations(database, [
        {
          version: 3,
          sql: "CREATE TABLE rolled_back_probe (id TEXT); INVALID SQL",
        },
      ]),
    ).toThrow();
    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
        )
        .get("rolled_back_probe"),
    ).toBeUndefined();
    expect(
      database.prepare("SELECT count(*) AS count FROM schema_migrations").get(),
    ).toEqual({ count: 0 });
  });
});
