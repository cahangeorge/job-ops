import { createHash } from "node:crypto";
import { badRequest } from "@infra/errors";
import {
  applyProjectVisibility,
  applyTailoredChunks,
  cloneResumeData,
  extractProjectsFromResume,
} from "@server/services/rxresume/tailoring";
import type {
  DesignResumeDocument,
  DesignResumeJson,
  Job,
  TailoredCvCandidate,
} from "@shared/types";

const TAILORED_CV_CANDIDATE_VERSION = "v1";

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
  "id" | "revision" | "resumeJson"
>;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function parseSelectedProjectIds(value: string | null): string[] {
  return Array.from(
    new Set(
      (value ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ).sort();
}

function parseTailoredSkills(value: string | null): Array<{
  name: string;
  keywords: string[];
}> {
  if (!value?.trim()) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw badRequest(
      "Tailored skills must be a JSON array of { name, keywords } objects.",
    );
  }

  if (!Array.isArray(parsed)) {
    throw badRequest(
      "Tailored skills must be a JSON array of { name, keywords } objects.",
    );
  }

  return parsed.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw badRequest(
        "Tailored skill groups require a name and at least one keyword.",
      );
    }

    const record = entry as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const keywords = Array.isArray(record.keywords)
      ? record.keywords
          .filter((keyword): keyword is string => typeof keyword === "string")
          .map((keyword) => keyword.trim())
          .filter(Boolean)
      : [];

    if (!name || keywords.length === 0) {
      throw badRequest(
        "Tailored skill groups require a name and at least one keyword.",
      );
    }

    return { name, keywords };
  });
}

export function createTailoredCvCandidate(args: {
  job: CandidateJob;
  designResume: CandidateDesignResume;
}): TailoredCvCandidate {
  const resumeJson = cloneResumeData(
    args.designResume.resumeJson,
  ) as DesignResumeJson;
  const tailoredSkills = parseTailoredSkills(args.job.tailoredSkills);
  const { catalog } = extractProjectsFromResume(resumeJson);
  const availableProjectIds = new Set(catalog.map((project) => project.id));
  const explicitlySelectedProjectIds = parseSelectedProjectIds(
    args.job.selectedProjectIds,
  );
  const selectedProjectIds =
    args.job.selectedProjectIds === null
      ? catalog
          .filter((project) => project.isVisibleInBase)
          .map((project) => project.id)
          .sort()
      : explicitlySelectedProjectIds;
  const unknownProjectIds = selectedProjectIds.filter(
    (id) => !availableProjectIds.has(id),
  );

  if (unknownProjectIds.length > 0) {
    throw badRequest(
      `Unknown selected project IDs: ${unknownProjectIds.join(", ")}.`,
    );
  }

  applyTailoredChunks({
    resumeData: resumeJson,
    tailoredContent: {
      summary: args.job.tailoredSummary,
      headline: args.job.tailoredHeadline,
      skills: tailoredSkills,
    },
  });
  applyProjectVisibility({
    resumeData: resumeJson,
    selectedProjectIds: new Set(selectedProjectIds),
  });

  const provenanceInput = {
    version: TAILORED_CV_CANDIDATE_VERSION,
    job: {
      id: args.job.id,
      updatedAt: args.job.updatedAt,
      jobDescription: args.job.jobDescription ?? "",
      tailoredSummary: args.job.tailoredSummary ?? null,
      tailoredHeadline: args.job.tailoredHeadline ?? null,
      tailoredSkills,
      selectedProjectIds,
    },
    designResume: {
      id: args.designResume.id,
      revision: args.designResume.revision,
      resumeJson: args.designResume.resumeJson,
    },
  };

  return {
    resumeJson,
    selectedProjectIds,
    provenance: {
      version: TAILORED_CV_CANDIDATE_VERSION,
      jobId: args.job.id,
      jobUpdatedAt: args.job.updatedAt,
      jobDescriptionHash: sha256(args.job.jobDescription ?? ""),
      designResumeDocumentId: args.designResume.id,
      designResumeRevision: args.designResume.revision,
      inputHash: sha256(stableStringify(provenanceInput)),
    },
  };
}
