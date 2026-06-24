import { isAwaitingAiScore } from "@client/components";
import type { JobListItem } from "@shared/types.js";
import { Loader2, XCircle } from "lucide-react";
import { useState, type ReactNode } from "react";
import { isPdfRegenerating, isPdfStale } from "@/client/lib/pdf-freshness";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { defaultStatusToken, statusTokens } from "./constants";
import { getLegitimacyCategory } from "./useFilteredJobs";

type LegitimacyBadgeCategory = Exclude<
  ReturnType<typeof getLegitimacyCategory>,
  "all"
>;

interface JobRowContentProps {
  job: JobListItem;
  isSelected?: boolean;
  showStatusDot?: boolean;
  showSuitabilityScore?: boolean;
  statusDotClassName?: string;
  className?: string;
}

function getSuitabilityScoreTone(score: number): string {
  if (score >= 70) return "text-emerald-400/90";
  if (score >= 50) return "text-foreground/60";
  return "text-muted-foreground/60";
}

const legitimacyBadgeTokens: Record<
  LegitimacyBadgeCategory,
  {
    label: string;
    className: string;
    tooltip: string;
  }
> = {
  high: {
    label: "High legitimacy",
    tooltip:
      "A high-confidence role based on company and posting signals.",
    className:
      "border-emerald-200/70 bg-emerald-50 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-200",
  },
  medium: {
    label: "Medium legitimacy",
    tooltip:
      "A medium-confidence role with some positive company and posting signals.",
    className:
      "border-sky-200/70 bg-sky-50 text-sky-700 dark:border-sky-400/25 dark:bg-sky-400/10 dark:text-sky-200",
  },
  low: {
    label: "Low legitimacy",
    tooltip:
      "A low-confidence role with weak or concerning company and posting signals.",
    className:
      "border-rose-200/70 bg-rose-50 text-rose-700 dark:border-rose-400/25 dark:bg-rose-400/10 dark:text-rose-200",
  },
  unknown: {
    label: "Unknown legitimacy",
    tooltip:
      "There is not enough information to estimate this role's legitimacy.",
    className:
      "border-muted bg-muted/50 text-muted-foreground dark:border-muted-foreground/20",
  },
} as const;

const ghostJobTooltip =
  "This posting may be stale, low-intent, or unlikely to lead to a real hire.";

const livenessBadgeTokens = {
  live: {
    label: "Posting live",
    tooltip: "The posting recently showed active apply signals.",
    className:
      "border-emerald-200/70 bg-emerald-50 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-200",
  },
  expired: {
    label: "Posting expired",
    tooltip: "The posting appears closed or no longer available.",
    className:
      "border-rose-200/70 bg-rose-50 text-rose-700 dark:border-rose-400/25 dark:bg-rose-400/10 dark:text-rose-200",
  },
  uncertain: {
    label: "Liveness uncertain",
    tooltip: "The latest liveness check could not confirm whether this posting is still open.",
    className:
      "border-amber-200/70 bg-amber-50 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200",
  },
} as const;

function BadgeTooltip({
  children,
  content,
}: {
  children: ReactNode;
  content: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip open={isOpen} onOpenChange={setIsOpen}>
        <TooltipTrigger asChild>
          <span
            onMouseEnter={() => setIsOpen(true)}
            onMouseLeave={() => setIsOpen(false)}
          >
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent
          aria-label="Job badge explanation"
          side="top"
          className="max-w-60 text-xs"
        >
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export const JobRowContent = ({
  job,
  isSelected = false,
  showStatusDot = true,
  showSuitabilityScore = true,
  statusDotClassName,
  className,
}: JobRowContentProps) => {
  const hasScore = job.suitabilityScore != null;
  const isAwaitingAi = isAwaitingAiScore(job);
  const statusToken = statusTokens[job.status] ?? defaultStatusToken;
  const suitabilityTone = getSuitabilityScoreTone(job.suitabilityScore ?? 0);
  const showStalePdf = isPdfStale(job);
  const showRegeneratingPdf = isPdfRegenerating(job);
  const legitimacyBadge =
    legitimacyBadgeTokens[getLegitimacyCategory(job.evaluationLegitimacyScore)];
  const livenessBadge =
    job.postingLivenessStatus === "live" ||
    job.postingLivenessStatus === "expired" ||
    job.postingLivenessStatus === "uncertain"
      ? livenessBadgeTokens[job.postingLivenessStatus]
      : null;

  return (
    <div className={cn("flex min-w-0 flex-1 items-center gap-3", className)}>
      <span
        className={cn(
          "h-2 w-2 rounded-full shrink-0",
          statusToken.dot,
          !isSelected && "opacity-70",
          statusDotClassName,
          !showStatusDot && "hidden",
        )}
        title={statusToken.label}
      />

      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "truncate leading-tight",
            isSelected ? "font-semibold" : "font-medium",
          )}
        >
          {job.title}
        </div>
        <div className="truncate text-sm text-muted-foreground mt-0.5">
          {job.employer}
          {job.location && (
            <span className="before:content-['_in_']">{job.location}</span>
          )}
        </div>
        {(job.salary?.trim() ||
          showRegeneratingPdf ||
          showStalePdf ||
          legitimacyBadge ||
          livenessBadge ||
          job.isGhostJob === true) && (
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
            {job.salary?.trim() && (
              <span className="truncate text-xs text-muted-foreground">
                {job.salary}
              </span>
            )}
            <BadgeTooltip content={legitimacyBadge.tooltip}>
              <span
                className={cn(
                  "inline-flex shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px] font-medium leading-none",
                  legitimacyBadge.className,
                )}
              >
                {legitimacyBadge.label}
              </span>
            </BadgeTooltip>
            {livenessBadge && (
              <BadgeTooltip
                content={
                  job.postingLivenessReason ?? livenessBadge.tooltip
                }
              >
                <span
                  className={cn(
                    "inline-flex shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px] font-medium leading-none",
                    livenessBadge.className,
                  )}
                >
                  {livenessBadge.label}
                </span>
              </BadgeTooltip>
            )}
            {job.isGhostJob === true && (
              <BadgeTooltip content={ghostJobTooltip}>
                <span className="inline-flex shrink-0 rounded-sm border border-fuchsia-200/70 bg-fuchsia-50 px-1.5 py-0.5 text-[10px] font-medium leading-none text-fuchsia-700 dark:border-fuchsia-400/25 dark:bg-fuchsia-400/10 dark:text-fuchsia-200">
                  Ghost job
                </span>
              </BadgeTooltip>
            )}
            {showRegeneratingPdf && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-blue-200/70 bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium leading-none text-blue-700 dark:border-blue-400/25 dark:bg-blue-400/10 dark:text-blue-200">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                Generating PDF
              </span>
            )}
            {showStalePdf && (
              <span className="inline-flex shrink-0 rounded-sm border border-amber-200/70 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium leading-none text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200">
                Regenerate PDF
              </span>
            )}
          </div>
        )}
      </div>

      {showSuitabilityScore && hasScore ? (
        <div className="shrink-0 text-right">
          <span className={cn("text-sm tabular-nums", suitabilityTone)}>
            {job.suitabilityScore}
          </span>
        </div>
      ) : showSuitabilityScore && isAwaitingAi ? (
        <div className="shrink-0 text-right">
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Loader2
                  aria-label="Waiting for AI scoring to finish."
                  className="h-4 w-4 animate-spin text-muted-foreground"
                />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-60 text-xs">
                Waiting for AI scoring to finish.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      ) : showSuitabilityScore ? (
        <div className="shrink-0 text-right">
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <XCircle
                  aria-label="AI misconfiguration or service error."
                  className="h-4 w-4 text-destructive"
                />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-60 text-xs">
                AI misconfiguration or service error. Please check your settings
                and AI service status.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      ) : null}
    </div>
  );
};
