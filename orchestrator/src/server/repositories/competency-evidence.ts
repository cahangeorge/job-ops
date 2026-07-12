import { createHash } from "node:crypto";
import { badRequest, conflict, notFound } from "@infra/errors";
import { db, schema } from "@server/db";
import { getActiveTenantId } from "@server/tenancy/context";
import {
  APPLICATION_OUTCOMES,
  APPLICATION_STAGES,
  type ApplicationStage,
  type JobOutcome,
} from "@shared/types";
import { and, asc, eq } from "drizzle-orm";

const { competencies, competencyEvidence } = schema;

const SOURCE_TYPES = [
  "job_posting_snapshot",
  "story_bank",
  "tailored_cv_candidate",
  "reviewer_finding",
  "dossier_revision",
  "stage_event",
  "submitted_artifact",
  "manual",
] as const;
const EXTRACTION_METHODS = ["manual", "deterministic"] as const;
const MAX_COMPETENCY_NAME_LENGTH = 128;
const MAX_EVIDENCE_EXCERPT_LENGTH = 2_000;
const MAX_SOURCE_FIELD_LENGTH = 128;

export type CompetencyEvidenceSourceType = (typeof SOURCE_TYPES)[number];
export type CompetencyEvidenceExtractionMethod =
  (typeof EXTRACTION_METHODS)[number];

export type RecordCompetencyEvidenceInput = {
  competencyId: string;
  sourceType: CompetencyEvidenceSourceType;
  sourceId: string;
  sourceVersion?: string;
  sourceRevision?: string;
  extractionMethod: CompetencyEvidenceExtractionMethod;
  confidence: number;
  evidenceExcerpt: string;
  observationStage?: string | null;
  observationOutcome?: string | null;
};

export async function createCompetency(input: { name: string }) {
  const tenantId = getActiveTenantId();
  const name = requiredText(
    input.name,
    "Competency name",
    MAX_COMPETENCY_NAME_LENGTH,
  );
  try {
    const [competency] = await db
      .insert(competencies)
      .values({ id: crypto.randomUUID(), tenantId, name })
      .returning();
    if (!competency) throw new Error("Failed to create competency");
    return competency;
  } catch (error) {
    if (isUniqueConstraint(error)) throw conflict("Competency already exists");
    throw error;
  }
}

export async function recordCompetencyEvidence(
  input: RecordCompetencyEvidenceInput,
) {
  const tenantId = getActiveTenantId();
  const sourceType = enumValue(input.sourceType, SOURCE_TYPES, "Source type");
  const extractionMethod = enumValue(
    input.extractionMethod,
    EXTRACTION_METHODS,
    "Extraction method",
  );
  const sourceId = requiredText(
    input.sourceId,
    "Source ID",
    MAX_SOURCE_FIELD_LENGTH,
  );
  const sourceVersion = optionalText(input.sourceVersion, "Source version");
  const sourceRevision = optionalText(input.sourceRevision, "Source revision");
  const evidenceExcerpt = requiredText(
    input.evidenceExcerpt,
    "Evidence excerpt",
    MAX_EVIDENCE_EXCERPT_LENGTH,
  );
  const { observationStage, observationOutcome } = observationSnapshot(
    input,
    sourceType,
  );
  if (
    !Number.isFinite(input.confidence) ||
    input.confidence < 0 ||
    input.confidence > 1
  ) {
    throw badRequest("Confidence must be between 0 and 1");
  }

  const competency = await db
    .select({ id: competencies.id })
    .from(competencies)
    .where(
      and(
        eq(competencies.id, input.competencyId),
        eq(competencies.tenantId, tenantId),
      ),
    )
    .limit(1)
    .get();
  if (!competency) throw notFound("Competency not found");

  try {
    const [evidence] = await db
      .insert(competencyEvidence)
      .values({
        id: crypto.randomUUID(),
        tenantId,
        competencyId: competency.id,
        sourceType,
        sourceId,
        sourceVersion,
        sourceRevision,
        extractionMethod,
        confidence: input.confidence,
        evidenceExcerpt,
        evidenceHash: createHash("sha256")
          .update(evidenceExcerpt)
          .digest("hex"),
        observationStage,
        observationOutcome,
      })
      .returning();
    if (!evidence) throw new Error("Failed to record competency evidence");
    return evidence;
  } catch (error) {
    if (isUniqueConstraint(error))
      throw conflict("Competency evidence already recorded");
    throw error;
  }
}

export async function listCompetencyEvidence() {
  const tenantId = getActiveTenantId();
  return db
    .select()
    .from(competencyEvidence)
    .where(eq(competencyEvidence.tenantId, tenantId))
    .orderBy(asc(competencyEvidence.createdAt), asc(competencyEvidence.id));
}

export async function listOutcomeLearningRecords() {
  const tenantId = getActiveTenantId();
  const rows = await db
    .select({
      competencyId: competencies.id,
      competencyName: competencies.name,
      sourceType: competencyEvidence.sourceType,
      sourceId: competencyEvidence.sourceId,
      sourceVersion: competencyEvidence.sourceVersion,
      sourceRevision: competencyEvidence.sourceRevision,
      extractionMethod: competencyEvidence.extractionMethod,
      confidence: competencyEvidence.confidence,
      evidenceHash: competencyEvidence.evidenceHash,
      stage: competencyEvidence.observationStage,
      outcome: competencyEvidence.observationOutcome,
    })
    .from(competencyEvidence)
    .innerJoin(
      competencies,
      and(
        eq(competencies.id, competencyEvidence.competencyId),
        eq(competencies.tenantId, competencyEvidence.tenantId),
      ),
    )
    .where(eq(competencyEvidence.tenantId, tenantId))
    .orderBy(asc(competencies.name), asc(competencyEvidence.createdAt));
  return rows.map((row) => ({
    ...row,
    sourceType: enumValue(row.sourceType, SOURCE_TYPES, "Stored source type"),
    tenantId,
  }));
}

function observationSnapshot(
  input: RecordCompetencyEvidenceInput,
  sourceType: CompetencyEvidenceSourceType,
): {
  observationStage: ApplicationStage | null;
  observationOutcome: JobOutcome | null;
} {
  const hasStage =
    input.observationStage !== undefined && input.observationStage !== null;
  const hasOutcome =
    input.observationOutcome !== undefined && input.observationOutcome !== null;
  if (hasStage !== hasOutcome) {
    throw badRequest("Observation stage and outcome must be provided together");
  }
  if (!hasStage) {
    if (sourceType === "stage_event") {
      throw badRequest("Stage event evidence requires an observation snapshot");
    }
    return { observationStage: null, observationOutcome: null };
  }
  return {
    observationStage: enumValue(
      input.observationStage,
      APPLICATION_STAGES,
      "Observation stage",
    ),
    observationOutcome: enumValue(
      input.observationOutcome,
      APPLICATION_OUTCOMES,
      "Observation outcome",
    ),
  };
}

function requiredText(
  value: unknown,
  label: string,
  maxLength: number,
): string {
  if (typeof value !== "string") throw badRequest(`${label} is required`);
  const normalized = value.trim();
  if (!normalized) throw badRequest(`${label} is required`);
  if (normalized.length > maxLength) throw badRequest(`${label} is too long`);
  return normalized;
}

function optionalText(value: unknown, label: string): string {
  if (value === undefined || value === null) return "";
  return requiredText(value, label, MAX_SOURCE_FIELD_LENGTH);
}

function enumValue<T extends string>(
  value: unknown,
  values: readonly T[],
  label: string,
): T {
  if (typeof value === "string" && values.includes(value as T))
    return value as T;
  throw badRequest(`${label} is invalid`);
}

function isUniqueConstraint(error: unknown): boolean {
  return error instanceof Error && /unique constraint/i.test(error.message);
}
