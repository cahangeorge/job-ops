import { createHash } from "node:crypto";
import type {
  DesignResumeDocument,
  DesignResumeJson,
  Job,
} from "@shared/types";
import { describe, expect, it } from "vitest";
import { buildDefaultReactiveResumeDocument } from "./rxresume/document";
import { parseV5ResumeData } from "./rxresume/schema/v5";
import { createTailoredCvCandidate } from "./tailored-cv-candidate";

const template = {
  id: "design-resume-v5",
  version: "5",
  variables: [
    "basics.headline",
    "summary.content",
    "sections.skills.items",
    "sections.projects.items",
  ],
} as const;

type CandidateJob = Pick<
  Job,
  | "id"
  | "updatedAt"
  | "jobDescription"
  | "tailoredSummary"
  | "tailoredHeadline"
  | "tailoredSkills"
  | "selectedProjectIds"
>;

type CandidateDesignResume = Pick<
  DesignResumeDocument,
  "id" | "revision" | "resumeJson" | "sourceMode"
>;

function makeCandidateJob(overrides: Partial<CandidateJob> = {}): CandidateJob {
  return {
    id: "job-1",
    updatedAt: "2026-07-11T10:00:00.000Z",
    jobDescription: "Build reliable TypeScript systems.",
    tailoredSummary: "Tailored summary",
    tailoredHeadline: "Platform Engineer",
    tailoredSkills: JSON.stringify([
      { name: "Backend", keywords: ["TypeScript", "Node.js"] },
    ]),
    selectedProjectIds: "project-b,project-a",
    ...overrides,
  };
}

function makeDesignResume(): CandidateDesignResume {
  const resumeJson = parseV5ResumeData(
    buildDefaultReactiveResumeDocument(),
  ) as DesignResumeJson;
  resumeJson.basics.headline = "Base headline";
  resumeJson.summary.content = "Base summary";
  resumeJson.sections.projects.items = [
    {
      id: "project-a",
      hidden: false,
      name: "Alpha",
      period: "",
      website: { label: "", url: "" },
      description: "",
    },
    {
      id: "project-b",
      hidden: false,
      name: "Beta",
      period: "",
      website: { label: "", url: "" },
      description: "",
    },
  ];
  resumeJson.sections.skills.items = [
    {
      id: "skill-base",
      hidden: false,
      icon: "",
      name: "Base",
      proficiency: "",
      level: 0,
      keywords: ["Base"],
    },
  ];

  return { id: "resume-primary", revision: 7, resumeJson, sourceMode: "v5" };
}

describe("createTailoredCvCandidate", () => {
  it("creates an ephemeral preview from a job and Design Resume revision", () => {
    const designResume = makeDesignResume();
    const candidate = createTailoredCvCandidate({
      job: makeCandidateJob(),
      designResume,
      template,
      selectedStoryProofPoints: [
        {
          id: "story-1",
          excerpt: "Scaled the platform and cut latency.",
          hash: "c".repeat(64),
        },
      ],
    });

    expect(candidate.provenance).toEqual({
      version: "v1",
      jobId: "job-1",
      jobUpdatedAt: "2026-07-11T10:00:00.000Z",
      jobDescriptionHash: createHash("sha256")
        .update("Build reliable TypeScript systems.")
        .digest("hex"),
      designResumeDocumentId: "resume-primary",
      designResumeRevision: 7,
      template,
      selectedStoryIds: ["story-1"],
      selectedStoryProofPoints: [
        {
          id: "story-1",
          excerpt: "Scaled the platform and cut latency.",
          hash: "c".repeat(64),
        },
      ],
      inputHash: expect.any(String),
    });
    expect(candidate.selectedProjectIds).toEqual(["project-a", "project-b"]);
    expect(candidate.resumeJson.basics.headline).toBe("Platform Engineer");
    expect(candidate.resumeJson.summary.content).toBe(
      "Tailored summary<p><strong>Selected proof points</strong></p><ul><li>Scaled the platform and cut latency.</li></ul>",
    );
    expect(candidate.resumeJson.sections.projects.items).toEqual([
      expect.objectContaining({ id: "project-a", hidden: false }),
      expect.objectContaining({ id: "project-b", hidden: false }),
    ]);
    expect(candidate.resumeJson.sections.skills.items).toEqual([
      expect.objectContaining({
        name: "Backend",
        keywords: ["TypeScript", "Node.js"],
      }),
    ]);
    expect(designResume.resumeJson.basics.headline).toBe("Base headline");
  });

  it("adds selected Story Bank proof points to the rendered v5 summary", () => {
    const withoutProofPoints = createTailoredCvCandidate({
      job: makeCandidateJob(),
      designResume: makeDesignResume(),
      template,
      selectedStoryProofPoints: [],
    });
    const withProofPoints = createTailoredCvCandidate({
      job: makeCandidateJob(),
      designResume: makeDesignResume(),
      template,
      selectedStoryProofPoints: [
        {
          id: "story-1",
          excerpt: "Scaled the platform and cut latency.",
          hash: "c".repeat(64),
        },
      ],
    });

    expect(withoutProofPoints.resumeJson.summary.content).toBe(
      "Tailored summary",
    );
    expect(withProofPoints.resumeJson.summary.content).toBe(
      "Tailored summary<p><strong>Selected proof points</strong></p><ul><li>Scaled the platform and cut latency.</li></ul>",
    );
  });

  it("rejects project selections that are absent from the snapped Design Resume", () => {
    expect(() =>
      createTailoredCvCandidate({
        job: makeCandidateJob({
          selectedProjectIds: "missing-project",
          tailoredHeadline: null,
          tailoredSkills: null,
          tailoredSummary: null,
        }),
        designResume: makeDesignResume(),
        template,
        selectedStoryProofPoints: [],
      }),
    ).toThrow("Unknown selected project IDs: missing-project");
  });

  it("rejects malformed tailored skill groups", () => {
    expect(() =>
      createTailoredCvCandidate({
        job: makeCandidateJob({
          tailoredSkills: JSON.stringify([{ name: "Backend", keywords: [] }]),
        }),
        designResume: makeDesignResume(),
        template,
        selectedStoryProofPoints: [],
      }),
    ).toThrow("Tailored skill groups require a name and at least one keyword");
  });

  it("rejects an unsupported template contract", () => {
    expect(() =>
      createTailoredCvCandidate({
        job: makeCandidateJob(),
        designResume: makeDesignResume(),
        template: { ...template, version: "4" } as never,
        selectedStoryProofPoints: [],
      }),
    ).toThrow("Unsupported Tailored CV template contract");
  });
});
