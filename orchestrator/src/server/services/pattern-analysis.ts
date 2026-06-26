export type PatternAnalysisStatus = "ok" | "insufficient_data";
export type PatternAnalysisRecommendationImpact = "high" | "medium" | "low";

export interface PatternAnalysisJobInput {
  id: string;
  source?: string | null;
  status?: string | null;
  outcome?: string | null;
  suitabilityScore?: number | null;
}

export interface PatternAnalysisReport {
  status: PatternAnalysisStatus;
  metadata: { total: number; progressed: number };
  funnel: Array<{ stage: string; count: number }>;
  sourceBreakdown: Array<{
    source: string;
    total: number;
    positive: number;
    conversionRate: number;
  }>;
  scoreThreshold: { recommendedMinimum: number | null; reason: string };
  recommendations: Array<{
    impact: PatternAnalysisRecommendationImpact;
    action: string;
    reason: string;
  }>;
}

const PROGRESSED_STATUSES = new Set(["applied", "in_progress"]);
const POSITIVE_OUTCOMES = new Set(["offer_accepted", "offer_declined"]);
const ACCEPTED_OUTCOMES = new Set(["offer_accepted"]);
const MIN_PROGRESS_SAMPLE = 5;

export function analyzePatternAnalysis(
  jobs: readonly PatternAnalysisJobInput[],
): PatternAnalysisReport {
  const progressedJobs = jobs.filter((job) => isProgressed(job));
  const positiveJobs = progressedJobs.filter((job) => isPositive(job));
  const acceptedJobs = progressedJobs.filter((job) =>
    ACCEPTED_OUTCOMES.has(job.outcome ?? ""),
  );
  const acceptedOfferCount = acceptedJobs.length > 0 ? 1 : 0;
  const funnel = [
    { stage: "All applications", count: jobs.length },
    { stage: "Progressed applications", count: progressedJobs.length },
    { stage: "Positive outcomes", count: positiveJobs.length },
    { stage: "Accepted offers", count: acceptedOfferCount },
  ];

  if (progressedJobs.length < MIN_PROGRESS_SAMPLE) {
    return {
      status: "insufficient_data",
      metadata: { total: jobs.length, progressed: progressedJobs.length },
      funnel,
      sourceBreakdown: buildSourceBreakdown(progressedJobs),
      scoreThreshold: {
        recommendedMinimum: null,
        reason:
          "Need at least 5 progressed applications to estimate a score floor.",
      },
      recommendations: [
        {
          impact: "low",
          action: "Collect more application outcomes",
          reason:
            "The current sample is too small for a reliable targeting recommendation.",
        },
      ],
    };
  }

  const scoreThreshold = buildScoreThreshold(positiveJobs);
  const recommendations = buildRecommendations({
    scoreThreshold,
    sourceBreakdown: buildSourceBreakdown(progressedJobs),
  });

  return {
    status: "ok",
    metadata: { total: jobs.length, progressed: progressedJobs.length },
    funnel,
    sourceBreakdown: buildSourceBreakdown(progressedJobs),
    scoreThreshold,
    recommendations,
  };
}

function isProgressed(job: PatternAnalysisJobInput) {
  return PROGRESSED_STATUSES.has(job.status ?? "") || isPositive(job);
}

function isPositive(job: PatternAnalysisJobInput) {
  return POSITIVE_OUTCOMES.has(job.outcome ?? "");
}

function buildSourceBreakdown(jobs: readonly PatternAnalysisJobInput[]) {
  const bySource = new Map<string, { total: number; positive: number }>();
  for (const job of jobs) {
    const source = job.source?.trim() || "unknown";
    const current = bySource.get(source) ?? { total: 0, positive: 0 };
    current.total += 1;
    if (isPositive(job)) current.positive += 1;
    bySource.set(source, current);
  }

  return Array.from(bySource.entries())
    .map(([source, stats]) => ({
      source,
      total: stats.total,
      positive: stats.positive,
      conversionRate: roundPercent((stats.positive / stats.total) * 100),
    }))
    .sort((left, right) => {
      if (right.conversionRate !== left.conversionRate) {
        return right.conversionRate - left.conversionRate;
      }
      return left.source.localeCompare(right.source);
    });
}

function buildScoreThreshold(jobs: readonly PatternAnalysisJobInput[]) {
  const scores = jobs
    .map((job) => job.suitabilityScore)
    .filter((score): score is number => typeof score === "number")
    .sort((left, right) => left - right);

  if (scores.length === 0) {
    return {
      recommendedMinimum: null,
      reason: "No positive outcomes have suitability scores yet.",
    };
  }

  const median = scores[Math.floor(scores.length / 2)];
  return {
    recommendedMinimum: median,
    reason: `Recommended score floor is based on the median positive suitability score (${median}).`,
  };
}

function buildRecommendations(input: {
  scoreThreshold: PatternAnalysisReport["scoreThreshold"];
  sourceBreakdown: PatternAnalysisReport["sourceBreakdown"];
}) {
  const recommendations: PatternAnalysisReport["recommendations"] = [];
  if (input.scoreThreshold.recommendedMinimum != null) {
    recommendations.push({
      impact: "medium",
      action: `Raise the minimum suitability score floor to ${input.scoreThreshold.recommendedMinimum}`,
      reason:
        "Positive outcomes cluster around this score; use it to prioritize tailoring time.",
    });
  }

  const bestSource = input.sourceBreakdown[0];
  if (bestSource) {
    recommendations.push({
      impact: bestSource.conversionRate >= 50 ? "high" : "medium",
      action: `Prioritize ${bestSource.source}`,
      reason: `${bestSource.source} has the strongest observed conversion rate at ${bestSource.conversionRate}%.`,
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      impact: "low",
      action: "Keep collecting outcomes",
      reason: "There is not enough signal to recommend a targeting change yet.",
    });
  }

  return recommendations;
}

function roundPercent(value: number) {
  return Math.round(value * 10) / 10;
}
