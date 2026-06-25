type ApplyChecklistJob = {
  id: string;
  title: string;
  employer: string;
  jobUrl: string;
  applicationLink?: string | null;
  suitabilityScore?: number | null;
  suitabilityReason?: string | null;
};

export interface ApplyChecklistNoteInput {
  job: ApplyChecklistJob;
  coverLetter?: string | null;
}

export interface ApplyChecklistNote {
  title: string;
  content: string;
}

const APPLY_CHECKLIST_ITEMS = [
  "- [ ] Opened external application page",
  "- [ ] Uploaded the selected PDF/resume",
  "- [ ] Pasted or attached cover letter if required",
  "- [ ] Answered knockout questions",
  "- [ ] Submitted externally",
  "- [ ] Saved confirmation screenshot / email / reference number",
  "- [ ] Returned to JobOps and marked as applied",
] as const;

export function buildApplyChecklistNote(
  input: ApplyChecklistNoteInput,
): ApplyChecklistNote {
  const { job, coverLetter } = input;
  const postingUrl = job.applicationLink?.trim() || job.jobUrl.trim();
  const coverLetterText =
    coverLetter?.trim() || "No cover letter draft saved yet.";

  const content = [
    `# Apply checklist — ${job.employer}`,
    "",
    `Role: ${job.title}`,
    postingUrl ? `Posting: ${postingUrl}` : null,
    job.suitabilityScore != null ? `Score: ${job.suitabilityScore}/100` : null,
    job.suitabilityReason ? `Fit: ${job.suitabilityReason}` : null,
    "",
    "## Submit checklist",
    ...APPLY_CHECKLIST_ITEMS,
    "",
    "## Cover letter draft",
    coverLetterText,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return {
    title: `Apply checklist — ${job.employer}`,
    content,
  };
}
