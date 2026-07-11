import { getPatternAnalysis } from "@client/api";
import type { Job, JobNote } from "@shared/types.js";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, BookOpen, Code2, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type JobCvIntelligencePanelProps = {
  job: Job;
  notes?: JobNote[];
};

export function JobCvIntelligencePanel({ job }: JobCvIntelligencePanelProps) {
  const reportQuery = useQuery({
    queryKey: ["pattern-analysis", "job", job.id],
    queryFn: getPatternAnalysis,
    staleTime: 60_000,
  });

  const jobGap = reportQuery.data?.jobKnowledgeGaps.find(
    (gap) => gap.jobId === job.id,
  );
  const topGaps = reportQuery.data?.topKnowledgeGaps ?? [];

  return (
    <section data-testid="job-cv-intelligence-panel" className="space-y-4">
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-4 w-4" />
            CV Intelligence
          </CardTitle>
          <CardDescription>
            Compares this job with your CV sections and the broader scraped
            job-history demand map.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {reportQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading CV intelligence…
            </div>
          ) : null}

          {reportQuery.isError ? (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              Failed to load CV intelligence.
            </div>
          ) : null}

          {reportQuery.data?.profileStatus === "missing" ? (
            <div className="rounded-md border border-amber-400/40 bg-amber-500/5 p-3 text-sm text-muted-foreground">
              CV profile is not available yet. Upload or select a base CV to
              compare job requirements against your real sections.
            </div>
          ) : null}

          {reportQuery.data && !jobGap ? (
            <div className="rounded-md border border-border/50 p-3 text-sm text-muted-foreground">
              No specific missing knowledge gaps were detected for this job from
              the current term catalog.
            </div>
          ) : null}

          {jobGap ? (
            <div className="space-y-4">
              <div className="rounded-md border border-border/50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">{jobGap.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {jobGap.employer}
                    </div>
                  </div>
                  <Badge variant="outline">
                    {jobGap.missingTerms.length} gaps
                  </Badge>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {jobGap.missingTerms.map((term) => (
                    <Badge key={term} variant="outline">
                      {term}
                    </Badge>
                  ))}
                </div>

                {jobGap.coveredTerms.length > 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Already covered in your CV: {jobGap.coveredTerms.join(", ")}
                    .
                  </p>
                ) : null}
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <Card className="border-border/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <BookOpen className="h-4 w-4" />
                      Free learning repos
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {jobGap.recommendedResources.map((resource) => (
                      <a
                        key={resource.url}
                        href={resource.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-md border border-border/50 p-3 text-sm transition-colors hover:border-primary/40"
                      >
                        <span className="font-medium text-primary">
                          {resource.title}
                        </span>
                        <span className="mt-1 block text-muted-foreground">
                          {resource.reason}
                        </span>
                      </a>
                    ))}
                  </CardContent>
                </Card>

                <Card className="border-border/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Code2 className="h-4 w-4" />
                      Portfolio projects to build
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      {jobGap.projectIdeas.map((idea) => (
                        <li
                          key={idea}
                          className="rounded-md border border-border/50 p-3"
                        >
                          {idea}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {topGaps.length > 0 ? (
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Broader market demand</CardTitle>
            <CardDescription>
              Top repeated gaps across your scraped job history.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {topGaps.slice(0, 8).map((gap) => (
              <Badge key={gap.term} variant="secondary">
                {gap.term} · {gap.demandCount} jobs
              </Badge>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
