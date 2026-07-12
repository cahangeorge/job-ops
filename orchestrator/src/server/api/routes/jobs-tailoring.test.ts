import type { Server } from "node:http";
import { buildDefaultReactiveResumeDocument } from "@server/services/rxresume/document";
import { parseV5ResumeData } from "@server/services/rxresume/schema/v5";
import type { DesignResumeJson } from "@shared/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer, stopServer } from "./test-utils";

describe.sequential("Jobs tailoring PATCH route", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;

  const tailoredCvPreviewRequest = {
    storyIds: [],
    template: {
      id: "design-resume-v5",
      version: "5",
      variables: [
        "basics.headline",
        "summary.content",
        "sections.skills.items",
        "sections.projects.items",
      ],
    },
  };

  beforeEach(async () => {
    ({ server, baseUrl, closeDb, tempDir } = await startServer());
  });

  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
  });

  async function createManualJobId(): Promise<string> {
    const response = await fetch(`${baseUrl}/api/manual-jobs/import`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Connection: "close",
      },
      body: JSON.stringify({
        job: {
          title: "Backend Engineer",
          employer: "Acme",
          jobUrl: "https://example.com/jobs/backend-engineer",
          jobDescription: "Build backend systems",
        },
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      data?: { id: string };
    };
    expect(body.ok).toBe(true);
    expect(body.data?.id).toBeTruthy();
    const jobId = body.data?.id;
    if (!jobId) {
      throw new Error("Expected manual job import to return job id");
    }
    return jobId;
  }

  async function seedDesignResume(): Promise<void> {
    const { replaceCurrentDesignResumeDocument } = await import(
      "@server/services/design-resume"
    );
    const resumeJson = parseV5ResumeData(
      buildDefaultReactiveResumeDocument(),
    ) as DesignResumeJson;
    resumeJson.sections.projects.items = [
      {
        id: "project-1",
        hidden: false,
        name: "Candidate project",
        period: "2025",
        website: { label: "", url: "" },
        description: "Built a reliable service.",
      },
    ];

    await replaceCurrentDesignResumeDocument({
      resumeJson,
      sourceResumeId: null,
      sourceMode: "v5",
    });
  }

  it("accepts tailoredHeadline and tailoredSkills when JSON shape is valid", async () => {
    const jobId = await createManualJobId();
    const skills = JSON.stringify([
      { name: "Backend", keywords: ["TypeScript", "Node.js"] },
    ]);

    const response = await fetch(`${baseUrl}/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Connection: "close",
      },
      body: JSON.stringify({
        tailoredHeadline: "Senior Backend Engineer",
        tailoredSkills: skills,
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      data?: { tailoredHeadline: string; tailoredSkills: string };
    };
    expect(body.ok).toBe(true);
    expect(body.data?.tailoredHeadline).toBe("Senior Backend Engineer");
    expect(body.data?.tailoredSkills).toBe(skills);
  });

  it("rejects malformed tailoredSkills payload with 400", async () => {
    const jobId = await createManualJobId();

    const response = await fetch(`${baseUrl}/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Connection: "close",
      },
      body: JSON.stringify({
        tailoredHeadline: "Senior Backend Engineer",
        tailoredSkills: '{"name":"Backend","keywords":["TypeScript"]}',
      }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      ok?: boolean;
      error?: { message?: string } | string;
    };
    if (typeof body.error === "string") {
      expect(body.error).toContain("JSON array");
      return;
    }

    expect(body.ok).toBe(false);
    expect(body.error?.message || "").toContain("JSON array");
  });

  it("rejects missing or unknown Story Bank proof points and template contracts", async () => {
    const jobId = await createManualJobId();
    await seedDesignResume();

    const missingTemplate = await fetch(
      `${baseUrl}/api/jobs/${jobId}/tailored-cv-candidate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Connection: "close" },
        body: JSON.stringify({ storyIds: [] }),
      },
    );
    expect(missingTemplate.status).toBe(400);

    const unknownStory = await fetch(
      `${baseUrl}/api/jobs/${jobId}/tailored-cv-candidate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Connection: "close" },
        body: JSON.stringify({
          ...tailoredCvPreviewRequest,
          storyIds: ["7d7b1744-4e0f-4174-9d30-31d85d66f5b9"],
        }),
      },
    );
    expect(unknownStory.status).toBe(400);
    await expect(unknownStory.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST" },
    });
  });

  it("returns a tenant-scoped tailored CV preview without regenerating a PDF", async () => {
    const jobId = await createManualJobId();
    await seedDesignResume();

    const saved = await fetch(`${baseUrl}/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Connection: "close" },
      body: JSON.stringify({
        tailoredSummary: "Tailored for the backend role.",
        tailoredHeadline: "Platform Engineer",
        tailoredSkills: JSON.stringify([
          { name: "Backend", keywords: ["TypeScript", "Node.js"] },
        ]),
        selectedProjectIds: "project-1",
      }),
    });
    expect(saved.status).toBe(200);

    const response = await fetch(
      `${baseUrl}/api/jobs/${jobId}/tailored-cv-candidate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Connection: "close" },
        body: JSON.stringify(tailoredCvPreviewRequest),
      },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      data?: {
        selectedProjectIds: string[];
        provenance: {
          jobUpdatedAt: string;
          designResumeDocumentId: string;
          designResumeRevision: number;
          inputHash: string;
        };
        resumeJson: {
          basics: { headline: string };
          summary: { content: string };
          sections: { projects: { items: Array<{ hidden: boolean }> } };
        };
      };
    };

    expect(body.ok).toBe(true);
    expect(body.data).toMatchObject({
      selectedProjectIds: ["project-1"],
      provenance: {
        jobUpdatedAt: expect.any(String),
        designResumeDocumentId: expect.stringContaining("primary"),
        designResumeRevision: 1,
        inputHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
      resumeJson: {
        basics: { headline: "Platform Engineer" },
        summary: { content: "Tailored for the backend role." },
      },
    });
    expect(body.data?.resumeJson.sections.projects.items[0]?.hidden).toBe(
      false,
    );
  });

  it("returns 409 when applying a candidate based on a stale Resume Studio revision", async () => {
    const jobId = await createManualJobId();
    await seedDesignResume();

    const previewResponse = await fetch(
      `${baseUrl}/api/jobs/${jobId}/tailored-cv-candidate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Connection: "close" },
        body: JSON.stringify(tailoredCvPreviewRequest),
      },
    );
    const preview = (await previewResponse.json()) as {
      data: Record<string, unknown>;
    };

    const resumeResponse = await fetch(`${baseUrl}/api/design-resume`, {
      headers: { Connection: "close" },
    });
    const resume = (await resumeResponse.json()) as {
      data: { revision: number; resumeJson: Record<string, unknown> };
    };
    const updatedResume = await fetch(`${baseUrl}/api/design-resume`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Connection: "close" },
      body: JSON.stringify({
        baseRevision: resume.data.revision,
        document: resume.data.resumeJson,
      }),
    });
    expect(updatedResume.status).toBe(200);

    const applyResponse = await fetch(
      `${baseUrl}/api/jobs/${jobId}/tailored-cv-candidate/apply`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Connection: "close" },
        body: JSON.stringify(preview.data),
      },
    );

    expect(applyResponse.status).toBe(409);
    await expect(applyResponse.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
  });

  it("returns 409 without writing the resume when the job changes after preview", async () => {
    const jobId = await createManualJobId();
    await seedDesignResume();

    const previewResponse = await fetch(
      `${baseUrl}/api/jobs/${jobId}/tailored-cv-candidate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Connection: "close" },
        body: JSON.stringify(tailoredCvPreviewRequest),
      },
    );
    expect(previewResponse.status).toBe(200);
    const preview = (await previewResponse.json()) as {
      data: Record<string, unknown>;
    };

    const jobUpdate = await fetch(`${baseUrl}/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Connection: "close" },
      body: JSON.stringify({ tailoredHeadline: "Changed after preview" }),
    });
    expect(jobUpdate.status).toBe(200);

    const applyResponse = await fetch(
      `${baseUrl}/api/jobs/${jobId}/tailored-cv-candidate/apply`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Connection: "close" },
        body: JSON.stringify(preview.data),
      },
    );
    expect(applyResponse.status).toBe(409);

    const resumeResponse = await fetch(`${baseUrl}/api/design-resume`, {
      headers: { Connection: "close" },
    });
    const resume = (await resumeResponse.json()) as {
      data: { revision: number };
    };
    expect(resume.data.revision).toBe(1);
  });

  it("allows only one concurrent candidate apply for the same Resume Studio revision", async () => {
    const jobId = await createManualJobId();
    await seedDesignResume();

    const saved = await fetch(`${baseUrl}/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Connection: "close" },
      body: JSON.stringify({
        tailoredHeadline: "Platform Engineer",
        tailoredSummary: "Tailored for concurrent update protection.",
      }),
    });
    expect(saved.status).toBe(200);

    const previewResponse = await fetch(
      `${baseUrl}/api/jobs/${jobId}/tailored-cv-candidate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Connection: "close" },
        body: JSON.stringify(tailoredCvPreviewRequest),
      },
    );
    expect(previewResponse.status).toBe(200);
    const preview = (await previewResponse.json()) as {
      data: Record<string, unknown>;
    };

    const apply = () =>
      fetch(`${baseUrl}/api/jobs/${jobId}/tailored-cv-candidate/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Connection: "close" },
        body: JSON.stringify(preview.data),
      });
    const applyResponses = await Promise.all([apply(), apply()]);

    expect(applyResponses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);

    const resumeResponse = await fetch(`${baseUrl}/api/design-resume`, {
      headers: { Connection: "close" },
    });
    const resume = (await resumeResponse.json()) as {
      data: {
        revision: number;
        resumeJson: {
          basics: { headline: string };
          summary: { content: string };
        };
      };
    };
    expect(resume.data).toMatchObject({
      revision: 2,
      resumeJson: {
        basics: { headline: "Platform Engineer" },
        summary: { content: "Tailored for concurrent update protection." },
      },
    });
  });
});
