import type {
  CompetencyEvidenceExtractionMethod,
  CompetencyEvidenceSourceType,
} from "@server/repositories/competency-evidence";

export const DEFAULT_SMALL_SAMPLE_THRESHOLD = 5;

export type OutcomeLearningRecord = {
  tenantId: string;
  competencyId: string;
  competencyName: string;
  sourceType: CompetencyEvidenceSourceType;
  sourceId: string;
  sourceVersion: string;
  sourceRevision: string;
  extractionMethod: CompetencyEvidenceExtractionMethod;
  confidence: number;
  evidenceHash: string;
  stage: string | null;
  outcome: string | null;
};

export function aggregateOutcomeLearning(input: {
  tenantId: string;
  records: readonly OutcomeLearningRecord[];
  smallSampleThreshold?: number;
}) {
  const smallSampleThreshold =
    input.smallSampleThreshold ?? DEFAULT_SMALL_SAMPLE_THRESHOLD;
  if (!Number.isSafeInteger(smallSampleThreshold) || smallSampleThreshold < 1) {
    throw new Error("smallSampleThreshold must be a positive integer");
  }
  const competencyGroups = new Map<string, OutcomeLearningRecord[]>();
  for (const record of input.records) {
    if (record.tenantId !== input.tenantId) continue;
    const records = competencyGroups.get(record.competencyId) ?? [];
    records.push(record);
    competencyGroups.set(record.competencyId, records);
  }

  return {
    smallSampleThreshold,
    competencies: [...competencyGroups.entries()]
      .map(([competencyId, records]) => {
        const observed = records.filter(
          (record) => record.stage !== null && record.outcome !== null,
        );
        const observations = new Map<
          string,
          { stage: string; outcome: string; numerator: number }
        >();
        for (const record of observed) {
          const stage = record.stage as string;
          const outcome = record.outcome as string;
          const key = `${stage}\u0000${outcome}`;
          const aggregate = observations.get(key) ?? {
            stage,
            outcome,
            numerator: 0,
          };
          aggregate.numerator += 1;
          observations.set(key, aggregate);
        }
        return {
          competencyId,
          competencyName: records[0]?.competencyName ?? "",
          sampleSize: observed.length,
          observations: [...observations.values()]
            .sort(
              (left, right) =>
                left.stage.localeCompare(right.stage) ||
                left.outcome.localeCompare(right.outcome),
            )
            .map((observation) => ({
              ...observation,
              denominator: observed.length,
              sampleSize: observed.length,
              observation:
                observed.length < smallSampleThreshold
                  ? ("insufficient_sample" as const)
                  : ("descriptive" as const),
            })),
          evidenceSources: records
            .map(
              ({
                sourceType,
                sourceId,
                sourceVersion,
                sourceRevision,
                extractionMethod,
                confidence,
                evidenceHash,
              }) => ({
                sourceType,
                sourceId,
                sourceVersion,
                sourceRevision,
                extractionMethod,
                confidence,
                evidenceHash,
              }),
            )
            .sort(
              (left, right) =>
                left.sourceType.localeCompare(right.sourceType) ||
                left.sourceId.localeCompare(right.sourceId) ||
                left.evidenceHash.localeCompare(right.evidenceHash),
            ),
        };
      })
      .sort(
        (left, right) =>
          left.competencyName.localeCompare(right.competencyName) ||
          left.competencyId.localeCompare(right.competencyId),
      ),
  };
}
