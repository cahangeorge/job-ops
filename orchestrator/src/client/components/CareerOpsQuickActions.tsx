import * as api from "@client/api";
import { showErrorToast } from "@client/lib/error-toast";
import { TooltipWhenDisabled } from "@client/components/TooltipWhenDisabled";
import { queryKeys } from "@client/lib/queryKeys";
import type { Job } from "@shared/types.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  ClipboardCheck,
  Copy,
  Handshake,
  Loader2,
  Search,
  ShieldPlus,
  X,
} from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { copyTextToClipboard } from "@/lib/utils";
import {
  derivePortalOrgSlug,
  getCareerOpsResumeSummary,
  inferPortalFromJob,
  type CareerOpsPortal,
} from "./career-ops-quick-actions";

type ActionKind = "ats" | "cover" | "negotiation" | "portal";

type ActionState =
  | {
      kind: ActionKind;
      error: string;
      result?: undefined;
    }
  | {
      kind: "ats";
      result: api.AtsKeywordAnalysisResult;
      error?: undefined;
    }
  | {
      kind: "cover";
      result: api.CoverLetterResult;
      error?: undefined;
    }
  | {
      kind: "negotiation";
      result: api.NegotiationResult;
      error?: undefined;
    }
  | {
      kind: "portal";
      result: api.PortalScanResult;
      error?: undefined;
    };

type CareerOpsQuickActionsProps = {
  job: Job;
  resumeSummaryFallback?: string | null;
  className?: string;
};

function getActionTitle(kind: ActionKind) {
  switch (kind) {
    case "ats":
      return "ATS Fit";
    case "cover":
      return "Cover Letter";
    case "negotiation":
      return "Negotiation";
    case "portal":
      return "Scan company jobs";
  }
}

export const CareerOpsQuickActions: React.FC<CareerOpsQuickActionsProps> = ({
  job,
  resumeSummaryFallback,
  className,
}) => {
  const queryClient = useQueryClient();
  const [loadingAction, setLoadingAction] = useState<ActionKind | null>(null);
  const [actionState, setActionState] = useState<ActionState | null>(null);
  const [lastSavedNoteId, setLastSavedNoteId] = useState<string | null>(null);
  const availabilityQuery = useQuery({
    queryKey: queryKeys.careerOps.availability(),
    queryFn: api.getCareerOpsAvailability,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const resumeSummary = useMemo(
    () => getCareerOpsResumeSummary(job, resumeSummaryFallback),
    [job, resumeSummaryFallback],
  );
  const jobDescription = job.jobDescription?.trim() || null;
  const portal = useMemo(() => inferPortalFromJob(job), [job]);
  const orgSlug = useMemo(() => derivePortalOrgSlug(job), [job]);
  const portalDisabledReason =
    portal && orgSlug
      ? null
      : "Portal type could not be inferred from this job";

  const setLocalError = (kind: ActionKind, error: string) => {
    setActionState({ kind, error });
  };

  const runAction = async <T,>(
    kind: ActionKind,
    task: () => Promise<T>,
    onSuccess: (result: T) => void,
    errorMessage: string,
  ) => {
    try {
      setLoadingAction(kind);
      setLastSavedNoteId(null);
      const result = await task();
      onSuccess(result);
    } catch (error) {
      const message =
        error instanceof Error && error.message ? error.message : errorMessage;
      setLocalError(kind, message);
      showErrorToast(error, errorMessage);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleAts = async () => {
    if (!jobDescription) {
      setLocalError("ats", "Job description not available");
      return;
    }
    if (!resumeSummary) {
      setLocalError("ats", "Resume summary not available");
      return;
    }

    await runAction(
      "ats",
      () =>
        api.analyzeAtsKeywords({
          jobDescription,
          resumeText: resumeSummary,
        }),
      (result) => setActionState({ kind: "ats", result }),
      "ATS analysis failed",
    );
  };

  const handleCoverLetter = async () => {
    if (!jobDescription) {
      setLocalError("cover", "Job description not available");
      return;
    }
    if (!resumeSummary) {
      setLocalError("cover", "Resume summary not available");
      return;
    }

    await runAction(
      "cover",
      () =>
        api.generateCoverLetter({
          jobTitle: job.title,
          employer: job.employer,
          jobDescription,
          resumeSummary,
          companyResearch: job.companyDescription || undefined,
          tone: "formal",
          angle: "company_mission",
        }),
      (result) => setActionState({ kind: "cover", result }),
      "Cover letter generation failed",
    );
  };

  const handleNegotiation = async () => {
    await runAction(
      "negotiation",
      () =>
        api.generateNegotiationScripts({
          jobTitle: job.title,
          employer: job.employer,
          location: job.location?.trim() || "Remote",
          tone: "collaborative",
        }),
      (result) => setActionState({ kind: "negotiation", result }),
      "Negotiation generation failed",
    );
  };

  const handlePortalScan = async () => {
    if (!portal || !orgSlug) {
      setLocalError("portal", "Portal type could not be inferred from this job");
      return;
    }

    await runAction(
      "portal",
      () =>
        api.scanCompanyPortal({
          orgSlug,
          portal: portal as CareerOpsPortal,
          excludeInternships: true,
        }),
      (result) => setActionState({ kind: "portal", result }),
      "Portal scan failed",
    );
  };

  const handleCopy = async (value: string, successMessage: string) => {
    try {
      await copyTextToClipboard(value);
      toast.success(successMessage);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  const saveResultToNotes = async () => {
    if (!actionState || "error" in actionState) return;

    let title = "";
    let content = "";

    if (actionState.kind === "ats") {
      title = `ATS fit - ${job.title}`;
      content = [
        `## ATS Fit`,
        "",
        `**Optimized summary**`,
        actionState.result.optimizedSummary,
        "",
        `**Required keywords**`,
        actionState.result.requiredKeywords.join(", ") || "n/a",
        "",
        `**Preferred keywords**`,
        actionState.result.preferredKeywords.join(", ") || "n/a",
        "",
        `**Missing keywords**`,
        actionState.result.missingKeywords.join(", ") || "none detected",
      ].join("\n");
    } else if (actionState.kind === "cover") {
      title = `Cover letter - ${job.title}`;
      content = actionState.result.coverLetter;
    } else if (actionState.kind === "negotiation") {
      title = `Negotiation script - ${job.title}`;
      content = [
        `## Opening script`,
        actionState.result.openingScript,
        "",
        `## Counter-offer script`,
        actionState.result.counterOfferScript,
        "",
        `## Timeline`,
        actionState.result.timeline,
      ].join("\n");
    } else {
      title = `Company scan - ${job.employer}`;
      content = [
        `## Company scan`,
        "",
        `**Employer**`,
        job.employer,
        "",
        `**Total results**`,
        String(actionState.result.total),
        "",
        `**Filtered results**`,
        String(actionState.result.filtered),
        "",
        `**Jobs**`,
        actionState.result.jobs.length > 0
          ? actionState.result.jobs
              .map(
                (resultJob) =>
                  `- ${resultJob.title} | ${resultJob.location || "Unknown location"} | ${resultJob.url}`,
              )
              .join("\n")
          : "No jobs found.",
      ].join("\n");
    }

    try {
      const note = await api.createJobNote(job.id, { title, content });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.jobs.notes(job.id),
      });
      setLastSavedNoteId(note.id);
      toast.success("Saved to notes");
    } catch (error) {
      showErrorToast(error, "Failed to save note");
    }
  };

  if (availabilityQuery.isPending) return null;
  if (availabilityQuery.isError || availabilityQuery.data !== true) return null;

  return (
    <section
      data-testid="career-ops-quick-actions"
      className={[
        "rounded-lg border border-border/45 bg-muted/10 p-3",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground/90">
            <BriefcaseBusiness className="h-4 w-4 text-sky-400/80" />
            Career Ops
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground/70">
            Run quick AI actions from the current job context.
          </p>
        </div>
        {actionState ? (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label="Close Career Ops result"
            onClick={() => {
              setActionState(null);
              setLastSavedNoteId(null);
            }}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Button
          size="sm"
          variant="outline"
          className="justify-start"
          disabled={loadingAction !== null}
          onClick={() => void handleAts()}
        >
          {loadingAction === "ats" ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="mr-1.5 h-3.5 w-3.5" />
          )}
          ATS Fit
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="justify-start"
          disabled={loadingAction !== null}
          onClick={() => void handleCoverLetter()}
        >
          {loadingAction === "cover" ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <ClipboardCheck className="mr-1.5 h-3.5 w-3.5" />
          )}
          Cover Letter
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="justify-start"
          disabled={loadingAction !== null}
          onClick={() => void handleNegotiation()}
        >
          {loadingAction === "negotiation" ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Handshake className="mr-1.5 h-3.5 w-3.5" />
          )}
          Negotiation
        </Button>
        <TooltipWhenDisabled reason={portalDisabledReason} className="w-full">
          <Button
            size="sm"
            variant="outline"
            className="w-full justify-start"
            disabled={loadingAction !== null || Boolean(portalDisabledReason)}
            onClick={() => void handlePortalScan()}
          >
            {loadingAction === "portal" ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <ShieldPlus className="mr-1.5 h-3.5 w-3.5" />
            )}
            Scan company jobs
          </Button>
        </TooltipWhenDisabled>
      </div>

      {actionState ? (
        <div className="mt-3 space-y-3 rounded-md border border-border/40 bg-background/40 p-3 text-sm">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{getActionTitle(actionState.kind)}</Badge>
          </div>

          {"error" in actionState ? (
            <div className="text-sm text-destructive">{actionState.error}</div>
          ) : actionState.kind === "ats" ? (
            <div className="space-y-3">
              <div>
                <div className="mb-1 text-xs font-semibold text-muted-foreground">
                  Optimized summary
                </div>
                <p>{actionState.result.optimizedSummary}</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <div>
                  <div className="mb-1 text-xs font-semibold text-muted-foreground">
                    Required
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {actionState.result.requiredKeywords.map((keyword) => (
                      <Badge key={keyword} variant="secondary">
                        {keyword}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-xs font-semibold text-muted-foreground">
                    Preferred
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {actionState.result.preferredKeywords.map((keyword) => (
                      <Badge key={keyword} variant="secondary">
                        {keyword}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-xs font-semibold text-muted-foreground">
                    Missing
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {actionState.result.missingKeywords.length > 0 ? (
                      actionState.result.missingKeywords.map((keyword) => (
                        <Badge key={keyword} variant="outline">
                          {keyword}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-muted-foreground">none detected</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : actionState.kind === "cover" ? (
            <div className="space-y-3">
              <div className="whitespace-pre-wrap rounded-md border border-border/35 bg-background/50 p-3">
                {actionState.result.coverLetter}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void handleCopy(
                      actionState.result.coverLetter,
                      "Cover letter copied",
                    )
                  }
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  Copy letter
                </Button>
                <Button size="sm" variant="outline" onClick={() => void saveResultToNotes()}>
                  Save to notes
                </Button>
              </div>
            </div>
          ) : actionState.kind === "negotiation" ? (
            <div className="space-y-3">
              <div>
                <div className="mb-1 text-xs font-semibold text-muted-foreground">
                  Opening script
                </div>
                <p className="whitespace-pre-wrap rounded-md border border-border/35 bg-background/50 p-3">
                  {actionState.result.openingScript}
                </p>
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold text-muted-foreground">
                  Counter-offer script
                </div>
                <p className="whitespace-pre-wrap rounded-md border border-border/35 bg-background/50 p-3">
                  {actionState.result.counterOfferScript}
                </p>
              </div>
              <div className="text-xs text-muted-foreground">
                Timeline: {actionState.result.timeline}
              </div>
              <Button size="sm" variant="outline" onClick={() => void saveResultToNotes()}>
                Save to notes
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">
                Total: {actionState.result.total}, filtered: {actionState.result.filtered}
              </div>
              {actionState.result.jobs.length > 0 ? (
                <div className="space-y-2">
                  {actionState.result.jobs.map((resultJob) => (
                    <div
                      key={resultJob.id}
                      className="rounded-md border border-border/35 bg-background/50 p-3"
                    >
                      <div className="font-medium">{resultJob.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {resultJob.employer}
                        {resultJob.location ? ` • ${resultJob.location}` : ""}
                      </div>
                      <a
                        href={resultJob.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs text-blue-400 hover:underline"
                      >
                        Open listing
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-muted-foreground">No jobs found.</div>
              )}
              <Button size="sm" variant="outline" onClick={() => void saveResultToNotes()}>
                Save to notes
              </Button>
            </div>
          )}

          {actionState.kind === "ats" ? (
            <Button size="sm" variant="outline" onClick={() => void saveResultToNotes()}>
              Save to notes
            </Button>
          ) : null}
          {lastSavedNoteId ? (
            <Button asChild size="sm" variant="ghost" className="justify-start px-0">
              <Link to={`/job/${job.id}/notes?noteId=${lastSavedNoteId}`}>
                Open notes
                <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};
