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

export interface BatchJobInputs {
  jobIds: string[];
  profile?: Record<string, unknown>;
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
  | "coverage-page"
  | "standalone-page"
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

export async function getCareerOpsCoverage(): Promise<CareerOpsAvailabilityResponse> {
  return fetchApi<CareerOpsAvailabilityResponse>("/career-ops/health");
}

export async function getCareerOpsAvailability(): Promise<boolean> {
  return getCareerOpsCoverage().then((response) => response.available === true);
}
