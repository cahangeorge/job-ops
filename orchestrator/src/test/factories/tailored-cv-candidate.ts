import { buildDefaultReactiveResumeDocument } from "@server/services/rxresume/document";
import { parseV5ResumeData } from "@server/services/rxresume/schema/v5";
import type { DesignResumeJson, TailoredCvCandidate } from "@shared/types";

function makeResumeJson(): DesignResumeJson {
  return parseV5ResumeData(
    buildDefaultReactiveResumeDocument(),
  ) as DesignResumeJson;
}

export function makeTailoredCvCandidate(
  overrides: Partial<TailoredCvCandidate> = {},
): TailoredCvCandidate {
  return {
    resumeJson: makeResumeJson(),
    selectedProjectIds: [],
    provenance: {
      version: "v1",
      jobId: "job-1",
      jobUpdatedAt: "2026-07-11T10:00:00.000Z",
      jobDescriptionHash: "a".repeat(64),
      designResumeDocumentId: "resume-1",
      designResumeRevision: 3,
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
      selectedStoryIds: [],
      selectedStoryProofPoints: [],
      inputHash: "b".repeat(64),
    },
    ...overrides,
  };
}
