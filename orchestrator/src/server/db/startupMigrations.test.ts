import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

describe("production database startup", () => {
  it("runs the adaptive database migrator before starting the server", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.prestart).toBe("npm run db:migrate:startup");
    expect(packageJson.scripts?.["db:migrate:startup"]).toBe(
      "tsx src/server/db/migrateStartup.ts",
    );
    expect(packageJson.scripts?.["db:migrate:versioned"]).toBe(
      "tsx src/server/db/migrateVersioned.ts",
    );
  });

  it("boots a fresh database and preserves its schema on second startup", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "job-ops-startup-migrate-"));
    const startupScript = resolve(
      process.cwd(),
      "src/server/db/migrateStartup.ts",
    );

    try {
      for (let run = 0; run < 2; run += 1) {
        execFileSync(process.execPath, ["--import", "tsx", startupScript], {
          env: { ...process.env, DATA_DIR: dataDir },
          stdio: "pipe",
        });
      }

      const database = new Database(join(dataDir, "jobs.db"), {
        readonly: true,
      });
      const objectNames = new Set(
        (
          database
            .prepare(
              "SELECT name FROM sqlite_master WHERE type IN ('table', 'trigger')",
            )
            .all() as Array<{ name: string }>
        ).map(({ name }) => name),
      );
      const quickCheck = database.pragma("quick_check", {
        simple: true,
      }) as string;
      database.close();

      expect(quickCheck).toBe("ok");
      expect(objectNames).toContain("jobs");
      expect(objectNames).toContain("workflow_tasks");
      expect(objectNames).toContain(
        "submitted_application_artifacts_no_working_pdf_alias",
      );
      expect(objectNames).not.toContain("jobs_new");
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("does not run the legacy migrator from the Docker entrypoint", () => {
    const entrypoint = readFileSync(
      resolve(process.cwd(), "../docker-entrypoint.sh"),
      "utf8",
    );

    expect(entrypoint).toContain("exec npm run start");
    expect(entrypoint).not.toContain("src/server/db/migrate.ts");
  });
});
