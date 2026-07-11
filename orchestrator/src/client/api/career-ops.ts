import { fetchApi } from "./core";

export interface AtsKeywordAnalysisInput {
  jobDescription: string;
  resumeText: string;
}

export interface AtsKeywordAnalysisResult {
  requiredKeywords: string[];
  preferredKeywords: string[];
  missingKeywords: string[];
  keywordDensity: Array<{ keyword: string; count: number }>;
  optimizedSummary: string;
}

export interface CoverLetterInput {
  jobTitle: string;
  employer: string;
  jobDescription: string;
  resumeSummary: string;
  companyResearch?: string;
  tone?: "formal" | "conversational" | "enthusiastic";
  angle?:
    | "company_mission"
    | "problem_solving"
    | "culture_fit"
    | "technical_challenge";
}

export interface CoverLetterResult {
  coverLetter: string;
  researchNotes: string;
  keywordsMirrored: string[];
  tone: string;
  angle: string;
}

export interface NegotiationInput {
  jobTitle: string;
  employer: string;
  currentSalary?: string;
  offerSalary?: string;
  location: string;
  benefits?: string;
  competingOffers?: string;
  tone?: "assertive" | "collaborative" | "cautious";
}

export interface NegotiationResult {
  openingScript: string;
  counterOfferScript: string;
  geographicDiscountPushback?: string;
  benefitsNegotiation?: string;
  competingOfferLeverage?: string;
  timeline: string;
}

export interface PortalScannerInput {
  orgSlug: string;
  portal: "greenhouse" | "ashby" | "lever";
  keywords?: string[];
  departments?: string[];
  excludeInternships?: boolean;
}

export interface PortalScanResultJob {
  id: string;
  title: string;
  employer: string;
  location: string | null;
  department: string | null;
  url: string;
  portal: "greenhouse" | "ashby" | "lever";
  postedAt: string | null;
  description: string | null;
  employmentType: string | null;
  experienceLevel: string | null;
  isRemote: boolean;
}

export interface PortalScanResult {
  jobs: PortalScanResultJob[];
  total: number;
  filtered: number;
  errors: string[];
}

export interface PortalScanImportJobInput {
  id?: string;
  title: string;
  employer: string;
  location?: string | null;
  department?: string | null;
  url: string;
  portal: "greenhouse" | "ashby" | "lever";
  description?: string | null;
  postedAt?: string | null;
  employmentType?: string | null;
  experienceLevel?: string | null;
  isRemote?: boolean;
  sourceJobId?: string | null;
}

export interface PortalScanImportResult {
  importedCount: number;
  skippedDuplicatesCount: number;
  jobIds: string[];
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
  matchedSections: string[];
}

export interface CvSectionDemand {
  section: string;
  label: string;
  demandedTerms: CvDemandTerm[];
  missingTerms: string[];
  recommendations: string[];
}

export interface KnowledgeGapRecommendation {
  term: string;
  demandCount: number;
  jobIds: string[];
  matchedSections: string[];
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
  status: "ok" | "insufficient_data";
  profileStatus: "available" | "missing";
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
    impact: "high" | "medium" | "low";
    action: string;
    reason: string;
  }>;
  cvSectionDemand: CvSectionDemand[];
  topKnowledgeGaps: KnowledgeGapRecommendation[];
  jobKnowledgeGaps: JobKnowledgeGapRecommendation[];
}

export type OfferEvaluationRecommendation =
  | "accept"
  | "negotiate"
  | "reject"
  | "hold";

export interface OfferEvaluationInput {
  offeredSalary?: string;
  benefits?: string;
  deadline?: string;
  competingOffers?: string;
  dealBreakers?: string[];
}

export interface OfferEvaluationResult {
  score: number;
  recommendation: OfferEvaluationRecommendation;
  risks: string[];
  tradeoffs: string[];
  negotiationAngle: string;
}

export interface OfferEvaluationResponse {
  evaluation: OfferEvaluationResult;
  note: {
    id: string;
    jobId: string;
    title: string;
    content: string;
    createdAt: string;
    updatedAt: string;
  };
}

export interface BatchScoreResult {
  jobId: string;
  title: string;
  employer: string;
  score: number | null;
  reason: string | null;
  error?: string;
}

export interface BatchCoverLetterInput {
  jobId: string;
  jobTitle: string;
  employer: string;
  jobDescription: string;
  resumeSummary: string;
  companyResearch?: string;
  tone?: "formal" | "conversational" | "enthusiastic";
  angle?:
    | "company_mission"
    | "problem_solving"
    | "culture_fit"
    | "technical_challenge";
}

export interface BatchCoverLetterResult {
  jobId: string;
  coverLetter: string;
  keywordsMirrored: string[];
  error?: string;
}

export interface BatchScoreJobsResponse {
  results: BatchScoreResult[];
}

export interface BatchCoverLettersResponse {
  results: BatchCoverLetterResult[];
}

export interface BatchJobInputs {
  jobIds: string[];
  profile?: Record<string, unknown>;
}

export interface InterviewPrepStoryInput {
  id: string;
  title: string;
  situation?: string;
  task?: string;
  action?: string;
  result?: string;
  reflection?: string | null;
  skills?: string | null;
  tags?: string | null;
  isMasterStory?: boolean;
}

export interface GenerateInterviewPrepInput {
  jobTitle: string;
  employer: string;
  jobDescription?: string | null;
  resumeSummary?: string | null;
  companyResearch?: string | null;
  evaluationInterviewPrep?: string | null;
  targetQuestions?: string | null;
  stories?: InterviewPrepStoryInput[];
}

export interface InterviewPrepAnswerOutline {
  question: string;
  outline: string;
  storyIds: string[];
}

export interface GenerateInterviewPrepResult {
  prepGuidance: string;
  targetQuestions: string[];
  answerOutlines: InterviewPrepAnswerOutline[];
  recommendedStoryIds: string[];
  interviewerQuestions: string[];
}

export interface BatchCoverLettersRequest {
  inputs: BatchCoverLetterInput[];
}

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

export interface CareerOpsAvailabilityResponse {
  available: boolean;
  actions?: string[];
  features?: CareerOpsFeature[];
}

export async function analyzeAtsKeywords(
  input: AtsKeywordAnalysisInput,
): Promise<AtsKeywordAnalysisResult> {
  return fetchApi<AtsKeywordAnalysisResult>("/ats/analyze", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function generateCoverLetter(
  input: CoverLetterInput,
): Promise<CoverLetterResult> {
  return fetchApi<CoverLetterResult>("/cover-letter/generate", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function generateNegotiationScripts(
  input: NegotiationInput,
): Promise<NegotiationResult> {
  return fetchApi<NegotiationResult>("/negotiation/generate", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function scanCompanyPortal(
  input: PortalScannerInput,
): Promise<PortalScanResult> {
  return fetchApi<PortalScanResult>("/portal-scanner/scan", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function importPortalScanJobs(input: {
  jobs: PortalScanImportJobInput[];
}): Promise<PortalScanImportResult> {
  return fetchApi<PortalScanImportResult>("/portal-scanner/import", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function generateInterviewPrep(
  input: GenerateInterviewPrepInput,
): Promise<GenerateInterviewPrepResult> {
  return fetchApi<GenerateInterviewPrepResult>("/interview-prep/generate", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function batchScoreJobs(
  input: BatchJobInputs,
): Promise<BatchScoreJobsResponse> {
  return fetchApi<BatchScoreJobsResponse>("/batch/score", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function batchGenerateCoverLetters(
  input: BatchCoverLettersRequest,
): Promise<BatchCoverLettersResponse> {
  return fetchApi<BatchCoverLettersResponse>("/batch/cover-letters", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getPatternAnalysis(): Promise<PatternAnalysisReport> {
  return fetchApi<PatternAnalysisReport>("/pattern-analysis");
}

export async function evaluateJobOffer(
  jobId: string,
  input: OfferEvaluationInput = {},
): Promise<OfferEvaluationResponse> {
  return fetchApi<OfferEvaluationResponse>(`/offer-evaluation/jobs/${jobId}`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getCareerOpsCoverage(): Promise<CareerOpsAvailabilityResponse> {
  return fetchApi<CareerOpsAvailabilityResponse>("/career-ops/health");
}

export async function getCareerOpsAvailability(): Promise<boolean> {
  return getCareerOpsCoverage().then((response) => response.available === true);
}
