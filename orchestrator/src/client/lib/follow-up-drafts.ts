import type { JobFollowUpUrgency } from "@shared/types.js";
import { FOLLOW_UP_NOTE_TITLE_PREFIX } from "@shared/types.js";

type BuildFollowUpDraftInput = {
  employer: string;
  title: string;
  daysSinceApplication: number | null;
  urgency: JobFollowUpUrgency;
};

export type FollowUpDraft = {
  title: string;
  content: string;
};

export function getFollowUpUrgencyLabel(
  urgency: JobFollowUpUrgency | undefined,
): string | null {
  if (urgency === "overdue") return "Overdue follow-up";
  if (urgency === "urgent") return "Urgent reply";
  if (urgency === "waiting") return "Waiting";
  if (urgency === "cold") return "Cold";
  return null;
}

function getUrgencySentence(
  urgency: JobFollowUpUrgency,
  daysSinceApplication: number | null,
): string {
  if (urgency === "urgent") {
    return "I wanted to reply promptly and keep the conversation moving.";
  }
  if (daysSinceApplication === null) {
    return "I wanted to follow up and reiterate my interest in the role.";
  }
  return `I applied ${daysSinceApplication} days ago and wanted to follow up on the current status.`;
}

export function buildFollowUpDraft(
  input: BuildFollowUpDraftInput,
): FollowUpDraft {
  const employer = input.employer.trim() || "the team";
  const title = input.title.trim() || "the role";

  return {
    title: `${FOLLOW_UP_NOTE_TITLE_PREFIX} - ${employer}`,
    content: [
      `# ${FOLLOW_UP_NOTE_TITLE_PREFIX}`,
      "",
      `Role: ${title}`,
      `Employer: ${employer}`,
      "",
      "Hi [Recruiter Name],",
      "",
      `I'm following up on my application for the ${title} role at ${employer}. ${getUrgencySentence(input.urgency, input.daysSinceApplication)}`,
      "",
      "I'm still very interested and would be glad to provide any additional information that would be helpful.",
      "",
      "Best,",
      "[Your Name]",
    ].join("\n"),
  };
}
