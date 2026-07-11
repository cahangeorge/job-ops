import type { ResumeProfile } from "@shared/types";

export type PatternAnalysisStatus = "ok" | "insufficient_data";
export type PatternAnalysisRecommendationImpact = "high" | "medium" | "low";
export type PatternAnalysisProfileStatus = "available" | "missing";
export type CvSectionId =
  | "summary"
  | "skills"
  | "experience"
  | "projects"
  | "certifications";

export interface PatternAnalysisJobInput {
  id: string;
  title?: string | null;
  employer?: string | null;
  source?: string | null;
  status?: string | null;
  outcome?: string | null;
  suitabilityScore?: number | null;
  jobDescription?: string | null;
  jobBrief?: string | null;
  skills?: string | null;
}

export interface LearningResourceRecommendation {
  title: string;
  url: string;
  reason: string;
}

export interface CvDemandTerm {
  term: string;
  demandCount: number;
  matchedInResume: boolean;
  matchedSections: CvSectionId[];
}

export interface CvSectionDemand {
  section: CvSectionId;
  label: string;
  demandedTerms: CvDemandTerm[];
  missingTerms: string[];
  recommendations: string[];
}

export interface KnowledgeGapRecommendation {
  term: string;
  demandCount: number;
  jobIds: string[];
  matchedSections: CvSectionId[];
  recommendedResources: LearningResourceRecommendation[];
  projectIdeas: string[];
}

export interface JobKnowledgeGapRecommendation {
  jobId: string;
  title: string;
  employer: string;
  missingTerms: string[];
  coveredTerms: string[];
  recommendedResources: LearningResourceRecommendation[];
  projectIdeas: string[];
}

export interface PatternAnalysisReport {
  status: PatternAnalysisStatus;
  profileStatus: PatternAnalysisProfileStatus;
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
  cvSectionDemand: CvSectionDemand[];
  topKnowledgeGaps: KnowledgeGapRecommendation[];
  jobKnowledgeGaps: JobKnowledgeGapRecommendation[];
}

type TermDefinition = {
  term: string;
  aliases: string[];
  sections: CvSectionId[];
  resources: LearningResourceRecommendation[];
  projectIdeas: string[];
};

const PROGRESSED_STATUSES = new Set(["applied", "in_progress"]);
const POSITIVE_OUTCOMES = new Set(["offer_accepted", "offer_declined"]);
const ACCEPTED_OUTCOMES = new Set(["offer_accepted"]);
const MIN_PROGRESS_SAMPLE = 5;

const SECTION_LABELS: Record<CvSectionId, string> = {
  summary: "Summary / headline",
  skills: "Skills",
  experience: "Experience",
  projects: "Projects",
  certifications: "Certifications",
};

const TERM_DEFINITIONS: TermDefinition[] = [
  {
    term: "react",
    aliases: ["react", "react.js", "reactjs"],
    sections: ["summary", "skills", "projects"],
    resources: [
      {
        title: "React official docs",
        url: "https://github.com/reactjs/react.dev",
        reason:
          "Free official learning material and examples for modern React.",
      },
    ],
    projectIdeas: [
      "Build a responsive React dashboard with filters, charts, and saved views.",
    ],
  },
  {
    term: "typescript",
    aliases: ["typescript", "type script", "ts"],
    sections: ["summary", "skills", "projects"],
    resources: [
      {
        title: "Type Challenges",
        url: "https://github.com/type-challenges/type-challenges",
        reason:
          "Free TypeScript exercises that show practical type-system depth.",
      },
    ],
    projectIdeas: [
      "Create a typed API client and form validation layer for a real app.",
    ],
  },
  {
    term: "python",
    aliases: ["python", "py"],
    sections: ["skills", "projects", "experience"],
    resources: [
      {
        title: "The Algorithms - Python",
        url: "https://github.com/TheAlgorithms/Python",
        reason:
          "Free Python implementations useful for practice and interview refreshers.",
      },
    ],
    projectIdeas: [
      "Build a Python CLI that cleans, scores, and exports scraped job data.",
    ],
  },
  {
    term: "docker",
    aliases: ["docker", "container", "containers", "containerization"],
    sections: ["skills", "projects", "experience"],
    resources: [
      {
        title: "Docker Awesome Compose",
        url: "https://github.com/docker/awesome-compose",
        reason:
          "Free Docker Compose examples for common production-style stacks.",
      },
    ],
    projectIdeas: [
      "Containerize a full-stack app with API, worker, database, and health checks.",
    ],
  },
  {
    term: "kubernetes",
    aliases: ["kubernetes", "k8s"],
    sections: ["skills", "projects", "experience", "certifications"],
    resources: [
      {
        title: "Kubernetes examples",
        url: "https://github.com/kubernetes/examples",
        reason:
          "Free practical manifests that demonstrate core Kubernetes objects.",
      },
    ],
    projectIdeas: [
      "Deploy a small service to Kubernetes with config maps, probes, autoscaling, and rollout notes.",
    ],
  },
  {
    term: "aws",
    aliases: [
      "aws",
      "amazon web services",
      "lambda",
      "ecs",
      "s3",
      "cloudwatch",
    ],
    sections: ["skills", "projects", "experience", "certifications"],
    resources: [
      {
        title: "Open Guide to AWS",
        url: "https://github.com/open-guides/og-aws",
        reason:
          "Free community guide for understanding AWS services and trade-offs.",
      },
    ],
    projectIdeas: [
      "Ship a serverless job-alert prototype using S3, Lambda, queues, and observability.",
    ],
  },
  {
    term: "ci/cd",
    aliases: [
      "ci/cd",
      "cicd",
      "continuous integration",
      "continuous delivery",
      "github actions",
    ],
    sections: ["skills", "projects", "experience"],
    resources: [
      {
        title: "GitHub Actions starter workflows",
        url: "https://github.com/actions/starter-workflows",
        reason:
          "Free workflow examples for CI, testing, and deployment automation.",
      },
    ],
    projectIdeas: [
      "Add CI/CD to a portfolio app with tests, typecheck, security scan, and preview deployment.",
    ],
  },
  {
    term: "testing",
    aliases: [
      "testing",
      "test automation",
      "unit tests",
      "integration tests",
      "vitest",
      "jest",
      "playwright",
    ],
    sections: ["skills", "projects", "experience"],
    resources: [
      {
        title: "JavaScript Testing Best Practices",
        url: "https://github.com/goldbergyoni/javascript-testing-best-practices",
        reason: "Free practical guidance for reliable JS/TS test suites.",
      },
    ],
    projectIdeas: [
      "Create an end-to-end tested workflow with unit, API, and Playwright coverage.",
    ],
  },
  {
    term: "accessibility",
    aliases: ["accessibility", "a11y", "wcag", "aria"],
    sections: ["skills", "projects", "experience"],
    resources: [
      {
        title: "ARIA Authoring Practices Guide",
        url: "https://github.com/w3c/aria-practices",
        reason: "Free W3C examples for accessible UI patterns.",
      },
    ],
    projectIdeas: [
      "Audit and fix keyboard navigation, labels, contrast, and screen-reader flows in a React app.",
    ],
  },
  {
    term: "observability",
    aliases: [
      "observability",
      "opentelemetry",
      "open telemetry",
      "prometheus",
      "grafana",
      "tracing",
      "metrics",
    ],
    sections: ["skills", "projects", "experience"],
    resources: [
      {
        title: "OpenTelemetry JavaScript",
        url: "https://github.com/open-telemetry/opentelemetry-js",
        reason: "Free instrumentation SDK and examples for traces and metrics.",
      },
    ],
    projectIdeas: [
      "Instrument an API with logs, metrics, traces, dashboards, and error budgets.",
    ],
  },
  {
    term: "machine learning",
    aliases: [
      "machine learning",
      "ml",
      "ai model",
      "llm",
      "model serving",
      "mlops",
    ],
    sections: ["summary", "skills", "projects", "experience"],
    resources: [
      {
        title: "Machine Learning for Beginners",
        url: "https://github.com/microsoft/ML-For-Beginners",
        reason: "Free Microsoft curriculum for core machine-learning concepts.",
      },
    ],
    projectIdeas: [
      "Build an ML service that classifies job posts, exposes an API, and tracks model quality.",
    ],
  },
];

export function analyzePatternAnalysis(
  jobs: readonly PatternAnalysisJobInput[],
  profile?: ResumeProfile | null,
): PatternAnalysisReport {
  const progressedJobs = jobs.filter((job) => isProgressed(job));
  const positiveJobs = progressedJobs.filter((job) => isPositive(job));
  const acceptedJobs = progressedJobs.filter((job) =>
    ACCEPTED_OUTCOMES.has(job.outcome ?? ""),
  );
  const acceptedOfferCount = acceptedJobs.length;
  const funnel = [
    { stage: "All applications", count: jobs.length },
    { stage: "Progressed applications", count: progressedJobs.length },
    { stage: "Positive outcomes", count: positiveJobs.length },
    { stage: "Accepted offers", count: acceptedOfferCount },
  ];
  const intelligence = buildCvIntelligence(jobs, profile ?? null);

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
      ...intelligence,
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
    ...intelligence,
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

function buildCvIntelligence(
  jobs: readonly PatternAnalysisJobInput[],
  profile: ResumeProfile | null,
): Pick<
  PatternAnalysisReport,
  "profileStatus" | "cvSectionDemand" | "topKnowledgeGaps" | "jobKnowledgeGaps"
> {
  const resumeSectionTexts = buildResumeSectionTexts(profile);
  const demand = new Map<
    string,
    {
      definition: TermDefinition;
      jobIds: Set<string>;
    }
  >();
  const termsByJobId = new Map<string, Set<string>>();

  for (const job of jobs) {
    const jobTerms = findDemandedTerms(buildJobDemandText(job));
    termsByJobId.set(job.id, jobTerms);
    for (const term of jobTerms) {
      const definition = getTermDefinition(term);
      if (!definition) continue;
      const current = demand.get(term) ?? {
        definition,
        jobIds: new Set<string>(),
      };
      current.jobIds.add(job.id);
      demand.set(term, current);
    }
  }

  const matchedSectionsByTerm = new Map<string, CvSectionId[]>();
  for (const definition of TERM_DEFINITIONS) {
    matchedSectionsByTerm.set(
      definition.term,
      getMatchedResumeSections(definition, resumeSectionTexts),
    );
  }

  const cvSectionDemand: CvSectionDemand[] = (
    Object.keys(SECTION_LABELS) as CvSectionId[]
  ).map((section) => {
    const demandedTerms = Array.from(demand.values())
      .filter(({ definition }) => definition.sections.includes(section))
      .map(({ definition, jobIds }) => {
        const matchedSections =
          matchedSectionsByTerm.get(definition.term) ?? [];
        return {
          term: definition.term,
          demandCount: jobIds.size,
          matchedInResume: matchedSections.length > 0,
          matchedSections,
        };
      })
      .sort(sortDemandTerms);
    const missingTerms = demandedTerms
      .filter((term) => !term.matchedInResume)
      .map((term) => term.term)
      .slice(0, 8);

    return {
      section,
      label: SECTION_LABELS[section],
      demandedTerms,
      missingTerms,
      recommendations: buildSectionRecommendations(section, missingTerms),
    };
  });

  const topKnowledgeGaps = Array.from(demand.values())
    .map(({ definition, jobIds }) => ({
      term: definition.term,
      demandCount: jobIds.size,
      jobIds: Array.from(jobIds).sort(),
      matchedSections: matchedSectionsByTerm.get(definition.term) ?? [],
      recommendedResources: definition.resources,
      projectIdeas: definition.projectIdeas,
    }))
    .filter((gap) => gap.matchedSections.length === 0)
    .sort(sortKnowledgeGaps)
    .slice(0, 10);

  const jobKnowledgeGaps = jobs
    .map((job) => {
      const jobTerms = Array.from(termsByJobId.get(job.id) ?? []);
      const missingTerms = jobTerms.filter(
        (term) => (matchedSectionsByTerm.get(term) ?? []).length === 0,
      );
      const coveredTerms = jobTerms.filter(
        (term) => (matchedSectionsByTerm.get(term) ?? []).length > 0,
      );
      const missingDefinitions = missingTerms
        .map(getTermDefinition)
        .filter((definition): definition is TermDefinition =>
          Boolean(definition),
        );

      return {
        jobId: job.id,
        title: job.title?.trim() || "Untitled role",
        employer: job.employer?.trim() || "Unknown employer",
        missingTerms,
        coveredTerms,
        recommendedResources: uniqueResources(
          missingDefinitions.flatMap((definition) => definition.resources),
        ).slice(0, 4),
        projectIdeas: uniqueStrings(
          missingDefinitions.flatMap((definition) => definition.projectIdeas),
        ).slice(0, 4),
      } satisfies JobKnowledgeGapRecommendation;
    })
    .filter((jobGap) => jobGap.missingTerms.length > 0)
    .sort((left, right) => right.missingTerms.length - left.missingTerms.length)
    .slice(0, 12);

  return {
    profileStatus: profile ? "available" : "missing",
    cvSectionDemand,
    topKnowledgeGaps,
    jobKnowledgeGaps,
  };
}

function buildJobDemandText(job: PatternAnalysisJobInput): string {
  return [
    job.title,
    job.jobDescription,
    job.jobBrief,
    normalizeSkillsText(job.skills),
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");
}

function normalizeSkillsText(value: string | null | undefined): string {
  if (!value) return "";
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item): item is string => typeof item === "string")
        .join(", ");
    }
  } catch {
    // Plain comma-separated skills are common in scraped jobs.
  }
  return value;
}

function findDemandedTerms(text: string): Set<string> {
  const normalizedText = normalizeForMatching(text);
  const terms = new Set<string>();
  for (const definition of TERM_DEFINITIONS) {
    if (
      definition.aliases.some((alias) =>
        normalizedText.includes(normalizeForMatching(alias)),
      )
    ) {
      terms.add(definition.term);
    }
  }
  return terms;
}

function getTermDefinition(term: string): TermDefinition | undefined {
  return TERM_DEFINITIONS.find((definition) => definition.term === term);
}

function buildResumeSectionTexts(
  profile: ResumeProfile | null,
): Record<CvSectionId, string> {
  if (!profile) {
    return {
      summary: "",
      skills: "",
      experience: "",
      projects: "",
      certifications: "",
    };
  }

  const skills = profile.sections?.skills?.items ?? [];
  const experience = profile.sections?.experience?.items ?? [];
  const projects = profile.sections?.projects?.items ?? [];
  const sections = (profile.sections ?? {}) as Record<string, unknown>;

  return {
    summary: normalizeForMatching(
      [
        profile.basics?.summary,
        profile.basics?.headline,
        profile.basics?.label,
        profile.sections?.summary?.content,
      ].join("\n"),
    ),
    skills: normalizeForMatching(
      skills
        .filter((item) => item.visible !== false)
        .flatMap((item) => [
          item.name,
          item.description,
          ...(item.keywords ?? []),
        ])
        .join("\n"),
    ),
    experience: normalizeForMatching(
      experience
        .filter((item) => item.visible !== false)
        .flatMap((item) => [item.company, item.position, item.summary])
        .join("\n"),
    ),
    projects: normalizeForMatching(
      projects
        .filter((item) => item.visible !== false)
        .flatMap((item) => [
          item.name,
          item.description,
          item.summary,
          ...(item.keywords ?? []),
        ])
        .join("\n"),
    ),
    certifications: normalizeForMatching(
      [sections.certifications, sections.awards, sections.publications]
        .map((section) => stringifyUnknown(section))
        .join("\n"),
    ),
  };
}

function getMatchedResumeSections(
  definition: TermDefinition,
  sectionTexts: Record<CvSectionId, string>,
): CvSectionId[] {
  return (Object.keys(sectionTexts) as CvSectionId[]).filter((section) =>
    definition.aliases.some((alias) =>
      sectionTexts[section].includes(normalizeForMatching(alias)),
    ),
  );
}

function buildSectionRecommendations(
  section: CvSectionId,
  missingTerms: readonly string[],
): string[] {
  if (missingTerms.length === 0) {
    return [
      `${SECTION_LABELS[section]} already covers the strongest detected demand signals.`,
    ];
  }

  const terms = missingTerms.slice(0, 4).join(", ");
  if (section === "summary") {
    return [
      `Mention one credible ${terms} proof point in the headline or summary when it matches your real experience.`,
    ];
  }
  if (section === "skills") {
    return [
      `Add truthful skill keywords for ${terms}, grouped by stack, if you can defend them in interviews.`,
    ];
  }
  if (section === "projects") {
    return [
      `Create or highlight portfolio projects that demonstrate ${terms} with links and measurable outcomes.`,
    ];
  }
  if (section === "experience") {
    return [
      `Rewrite bullets to show where you used ${terms}, including scale, ownership, and impact.`,
    ];
  }
  return [
    `Consider a free course, lab, or certification-style artifact for ${terms} if jobs repeatedly request it.`,
  ];
}

function sortDemandTerms(left: CvDemandTerm, right: CvDemandTerm) {
  if (right.demandCount !== left.demandCount)
    return right.demandCount - left.demandCount;
  return left.term.localeCompare(right.term);
}

function sortKnowledgeGaps(
  left: KnowledgeGapRecommendation,
  right: KnowledgeGapRecommendation,
) {
  if (right.demandCount !== left.demandCount)
    return right.demandCount - left.demandCount;
  return left.term.localeCompare(right.term);
}

function uniqueResources(
  resources: readonly LearningResourceRecommendation[],
): LearningResourceRecommendation[] {
  const seen = new Set<string>();
  return resources.filter((resource) => {
    if (seen.has(resource.url)) return false;
    seen.add(resource.url);
    return true;
  });
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}

function stringifyUnknown(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function normalizeForMatching(value: string): string {
  return value
    .toLowerCase()
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z0-9#]+;/gi, " ")
    .replace(/[^a-z0-9+#/.-]+/g, " ")
    .replace(/[./-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function roundPercent(value: number) {
  return Math.round(value * 10) / 10;
}
