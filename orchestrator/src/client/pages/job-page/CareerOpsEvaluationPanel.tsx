import type { Job } from "@shared/types.js";
import { BadgeCheck, FileText, Gauge, Scale, Sparkles } from "lucide-react";
import type React from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type CareerOpsEvaluationPanelProps = {
  job: Job;
};

type FieldCardProps = {
  label: string;
  value: React.ReactNode;
  className?: string;
};

const FieldCard: React.FC<FieldCardProps> = ({ label, value, className }) => (
  <article className={className}>
    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
      {label}
    </div>
    <div className="mt-2 text-sm leading-6 text-foreground">{value}</div>
  </article>
);

const formatPercentage = (value: number | null) =>
  value === null ? null : `${Math.round(value)}%`;

export const CareerOpsEvaluationPanel: React.FC<
  CareerOpsEvaluationPanelProps
> = ({ job }) => {
  const hasAnyEvaluationData = [
    job.evaluationOverallGrade,
    job.archetype,
    job.evaluationCvMatchScore,
    job.evaluationCvMatchReason,
    job.evaluationLevelStrategy,
    job.evaluationCompResearch,
    job.evaluationPersonalization,
    job.evaluationLegitimacyReason,
    job.evaluationInterviewPrep,
  ].some((value) => value !== null && value !== "");

  return (
    <section
      data-testid="career-ops-evaluation-panel"
      className="space-y-4 rounded-xl border border-border/50 bg-card/85"
    >
      <div className="border-b border-border/50 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-base font-semibold">
            <BadgeCheck className="h-4 w-4 text-primary" />
            CareerOps evaluation
          </div>
          <Badge variant="secondary" className="text-[10px] uppercase">
            Deep evaluation fields
          </Badge>
        </div>
      </div>

      <CardContent className="space-y-4 p-4">
        {hasAnyEvaluationData ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-border/50 bg-background/25">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Gauge className="h-4 w-4 text-primary" />
                  Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 pt-0 sm:grid-cols-2">
                <FieldCard
                  label="Overall grade"
                  value={
                    job.evaluationOverallGrade ?? (
                      <span className="text-muted-foreground">
                        Not provided
                      </span>
                    )
                  }
                />
                <FieldCard
                  label="Archetype"
                  value={
                    job.archetype ?? (
                      <span className="text-muted-foreground">
                        Not provided
                      </span>
                    )
                  }
                />
                <FieldCard
                  label="CV match"
                  value={
                    job.evaluationCvMatchScore !== null ||
                    job.evaluationCvMatchReason ? (
                      <div className="space-y-1">
                        {job.evaluationCvMatchScore !== null && (
                          <div className="font-semibold">
                            {formatPercentage(job.evaluationCvMatchScore)}
                          </div>
                        )}
                        {job.evaluationCvMatchReason && (
                          <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                            {job.evaluationCvMatchReason}
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">
                        Not provided
                      </span>
                    )
                  }
                />
                <FieldCard
                  label="Legitimacy reason"
                  value={
                    job.evaluationLegitimacyReason ?? (
                      <span className="text-muted-foreground">
                        Not provided
                      </span>
                    )
                  }
                />
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-background/25">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Scale className="h-4 w-4 text-primary" />
                  Positioning
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                <FieldCard
                  label="Evaluation level strategy"
                  value={
                    job.evaluationLevelStrategy ?? (
                      <span className="text-muted-foreground">
                        Not provided
                      </span>
                    )
                  }
                />
                <FieldCard
                  label="Compensation research"
                  value={
                    job.evaluationCompResearch ?? (
                      <span className="text-muted-foreground">
                        Not provided
                      </span>
                    )
                  }
                />
                <FieldCard
                  label="Personalization angle"
                  value={
                    job.evaluationPersonalization ?? (
                      <span className="text-muted-foreground">
                        Not provided
                      </span>
                    )
                  }
                />
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-background/25 md:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Additional notes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                <FieldCard
                  label="Interview prep guidance"
                  value={
                    job.evaluationInterviewPrep ?? (
                      <span className="text-muted-foreground">
                        Not provided
                      </span>
                    )
                  }
                />
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border/60 bg-background/25 p-6 text-sm text-muted-foreground">
            No CareerOps evaluation fields have been saved for this job yet.
          </div>
        )}

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <FileText className="h-3.5 w-3.5" />
          These values come from the stored CareerOps scoring record on the job.
        </div>
      </CardContent>
    </section>
  );
};
