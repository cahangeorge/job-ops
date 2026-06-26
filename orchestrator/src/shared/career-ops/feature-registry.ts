export type CareerOpsFeatureStatus =
  | "implemented"
  | "partial"
  | "missing"
  | "planned"
  | "blocked";

export type CareerOpsFeatureSurface =
  | "job-page-action"
  | "job-list-action"
  | "job-detail-panel"
  | "coverage-page"
  | "standalone-page"
  | "tracking-workflow"
  | "api-only"
  | "not-wired";

export interface CareerOpsFeature {
  id: string;
  label: string;
  description: string;
  status: CareerOpsFeatureStatus;
  surface: CareerOpsFeatureSurface;
  sourceArea: string;
  jobOpsPath?: string;
  sourcePath?: string;
  missingReason?: string;
  nextStep?: string;
}

export const CAREER_OPS_FEATURES: CareerOpsFeature[] = [
  {
    id: "ats",
    label: "ATS Fit",
    description:
      "Analyze a job description against resume/profile text and suggest keyword alignment.",
    status: "implemented",
    surface: "job-page-action",
    sourceArea: "job-fit-analysis",
    jobOpsPath: "orchestrator/src/client/components/CareerOpsQuickActions.tsx",
  },
  {
    id: "cover-letter",
    label: "Cover Letter",
    description:
      "Generate a tailored cover letter from job, company, and resume context.",
    status: "implemented",
    surface: "job-page-action",
    sourceArea: "apply-mode",
    sourcePath: "vendor/career-ops/modes/apply.md",
    jobOpsPath: "orchestrator/src/client/components/CareerOpsQuickActions.tsx",
  },
  {
    id: "negotiation",
    label: "Negotiation",
    description:
      "Generate collaborative compensation negotiation scripts for a target role.",
    status: "implemented",
    surface: "job-page-action",
    sourceArea: "offer-mode",
    sourcePath: "vendor/career-ops/modes/oferta.md",
    jobOpsPath: "orchestrator/src/client/components/CareerOpsQuickActions.tsx",
  },
  {
    id: "portal-scanner",
    label: "Portal Scanner",
    description:
      "Scan supported company ATS portals for related open roles without LLM tokens and import selected results as JobOps jobs.",
    status: "implemented",
    surface: "job-page-action",
    sourceArea: "portal-scanner",
    sourcePath: "vendor/career-ops/scan.mjs",
    jobOpsPath: "orchestrator/src/client/components/CareerOpsQuickActions.tsx",
  },
  {
    id: "pipeline-tracker",
    label: "Pipeline Tracker",
    description:
      "Track application pipeline status, reports, PDFs, and notes across the job search.",
    status: "partial",
    surface: "coverage-page",
    sourceArea: "pipeline-tracking",
    sourcePath: "vendor/career-ops/data/applications.md",
    missingReason:
      "JobOps has job/application state, but no explicit CareerOps parity mapping for report/PDF tracker columns.",
    nextStep:
      "Map CareerOps tracker fields to JobOps job/application states and visible list columns.",
  },
  {
    id: "offer-evaluation",
    label: "Offer Evaluation",
    description:
      "Evaluate offers with structured score blocks, tradeoffs, risk, recommendation output, and a saved report note.",
    status: "implemented",
    surface: "job-page-action",
    sourceArea: "offer-evaluation",
    sourcePath: "vendor/career-ops/modes/oferta.md",
    jobOpsPath: "orchestrator/src/server/api/routes/offer-evaluation.ts",
  },
  {
    id: "cv-generation",
    label: "Tailored CV Generation",
    description:
      "Generate tailored CV outputs from profile, proof points, templates, and a target role.",
    status: "partial",
    surface: "coverage-page",
    sourceArea: "cv-generation",
    sourcePath: "vendor/career-ops/templates/cv-template.html",
    missingReason:
      "JobOps has Design Resume flows, but CareerOps template/profile parity has not been mapped fully.",
    nextStep:
      "Map CareerOps CV templates and proof-point inputs into JobOps Design Resume.",
  },
  {
    id: "interview-prep",
    label: "Interview Prep",
    description:
      "Prepare company-specific interview intel, questions, answer outlines, and STAR+R stories.",
    status: "implemented",
    surface: "job-detail-panel",
    sourceArea: "interview-prep",
    sourcePath: "vendor/career-ops/modes/interview.md",
    jobOpsPath: "orchestrator/src/client/pages/job-page/InterviewPrepPanel.tsx",
  },
  {
    id: "story-bank",
    label: "Story Bank",
    description:
      "Maintain reusable STAR+R proof-point stories across evaluations and interviews.",
    status: "partial",
    surface: "standalone-page",
    sourceArea: "interview-prep",
    sourcePath: "vendor/career-ops/interview-prep/story-bank.md",
    jobOpsPath: "orchestrator/src/client/pages/StoryBankPage.tsx",
    missingReason:
      "JobOps has structured story-bank persistence, API routes, a dedicated UI, and Interview Prep generation wiring; remaining parity work is richer story reuse analytics and tagging workflows.",
    nextStep:
      "Add story usage history and smarter tag/skill recommendations across interview prep sessions.",
  },
  {
    id: "liveness-checker",
    label: "Job Posting Liveness Checker",
    description:
      "Check whether a saved job posting is still live, expired, removed, or stale using HTTP fast paths and browser-backed Camoufox fallback.",
    status: "implemented",
    surface: "job-page-action",
    sourceArea: "liveness",
    sourcePath: "vendor/career-ops/check-liveness.mjs",
    jobOpsPath: "orchestrator/src/server/api/routes/liveness.ts",
  },
  {
    id: "follow-up-cadence",
    label: "Follow-up Cadence",
    description:
      "Calculate follow-up urgency for applications and recruiter conversations, then create reusable follow-up draft notes.",
    status: "implemented",
    surface: "tracking-workflow",
    sourceArea: "follow-ups",
    sourcePath: "vendor/career-ops/followup-cadence.mjs",
    jobOpsPath: "orchestrator/src/server/services/follow-up-cadence.ts",
  },
  {
    id: "pattern-analysis",
    label: "Job Search Pattern Analysis",
    description:
      "Analyze outcomes and patterns across applications to improve targeting strategy with source conversion and score-floor recommendations.",
    status: "implemented",
    surface: "standalone-page",
    sourceArea: "analytics",
    sourcePath: "vendor/career-ops/analyze-patterns.mjs",
    jobOpsPath: "orchestrator/src/client/pages/PatternAnalysisPage.tsx",
  },
  {
    id: "batch-processing",
    label: "Batch Processing",
    description:
      "Run batch evaluation and liveness workflows over multiple selected job opportunities from the job list.",
    status: "implemented",
    surface: "job-list-action",
    sourceArea: "batch",
    sourcePath: "vendor/career-ops/modes/batch.md",
    jobOpsPath:
      "orchestrator/src/client/pages/orchestrator/FloatingJobActionsBar.tsx",
  },
  {
    id: "profile-onboarding",
    label: "Career Profile Onboarding",
    description:
      "Collect CV, target roles, salary range, deal-breakers, narrative, and proof points.",
    status: "partial",
    surface: "coverage-page",
    sourceArea: "onboarding",
    sourcePath: "vendor/career-ops/config/profile.example.yml",
    missingReason:
      "JobOps onboarding exists, but CareerOps profile contract fields are not fully mapped.",
    nextStep:
      "Audit JobOps onboarding fields against CareerOps profile.yml and modes/_profile.md.",
  },
];

export function getCareerOpsImplementedActionIds(): string[] {
  return CAREER_OPS_FEATURES.filter(
    (feature) =>
      feature.status === "implemented" && feature.surface === "job-page-action",
  ).map((feature) => feature.id);
}

export function getCareerOpsMissingFeatures(): CareerOpsFeature[] {
  return CAREER_OPS_FEATURES.filter(
    (feature) => feature.status !== "implemented",
  );
}
