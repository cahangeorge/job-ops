import { getPatternAnalysis } from "@client/api";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, BarChart3, BookOpen, Code2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function PatternAnalysisPage() {
  const reportQuery = useQuery({
    queryKey: ["pattern-analysis"],
    queryFn: getPatternAnalysis,
  });

  const report = reportQuery.data;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <BarChart3 className="h-4 w-4" />
          CareerOps
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Pattern Analysis
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Review job-search outcomes, source conversion, score floors, and
          targeting recommendations.
        </p>
      </div>

      {reportQuery.isLoading ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Loading pattern analysis…
          </CardContent>
        </Card>
      ) : null}

      {reportQuery.isError ? (
        <Card className="border-destructive/40">
          <CardContent className="flex items-center gap-2 p-6 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            Failed to load pattern analysis.
          </CardContent>
        </Card>
      ) : null}

      {report ? (
        <>
          {report.status === "insufficient_data" ? (
            <Card className="border-amber-400/40 bg-amber-500/5">
              <CardHeader>
                <CardTitle className="text-base">
                  More outcome data needed
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {report.scoreThreshold.reason}
              </CardContent>
            </Card>
          ) : null}

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {report.funnel.map((item) => (
              <Card key={item.stage}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {item.stage}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-semibold">{item.count}</div>
                </CardContent>
              </Card>
            ))}
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Source conversion</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {report.sourceBreakdown.length > 0 ? (
                  report.sourceBreakdown.map((source) => (
                    <div
                      key={source.source}
                      className="rounded-md border border-border/50 p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium">{source.source}</span>
                        <Badge variant="secondary">
                          {source.conversionRate}%
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {source.positive} positive from {source.total}{" "}
                        progressed applications
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No progressed applications by source yet.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recommendations</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-md border border-border/50 p-3">
                  <div className="text-sm font-medium">Score floor</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {report.status === "insufficient_data"
                      ? "No reliable score floor yet."
                      : report.scoreThreshold.reason}
                  </p>
                </div>
                {report.recommendations.map((recommendation) => (
                  <div
                    key={recommendation.action}
                    className="rounded-md border border-border/50 p-3"
                  >
                    <div className="flex items-center gap-2">
                      <Badge>{recommendation.impact}</Badge>
                      <span className="font-medium">
                        {recommendation.action}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {recommendation.reason}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>

          <section className="space-y-4">
            <div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <BookOpen className="h-4 w-4" />
                Resume demand map
              </div>
              <h2 className="text-2xl font-semibold tracking-tight">
                CV intelligence
              </h2>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Compares your uploaded/selected CV sections with skills
                repeatedly requested by scraped jobs.
              </p>
            </div>

            {report.profileStatus === "missing" ? (
              <Card className="border-amber-400/40 bg-amber-500/5">
                <CardContent className="p-4 text-sm text-muted-foreground">
                  CV profile is not available yet, so demand is shown without
                  coverage scoring. Upload or select a base CV to unlock gap
                  analysis.
                </CardContent>
              </Card>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Demand by CV section</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {report.cvSectionDemand.length > 0 ? (
                    report.cvSectionDemand.map((section) => (
                      <div
                        key={section.section}
                        className="rounded-md border border-border/50 p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">{section.label}</span>
                          <Badge
                            variant={
                              section.missingTerms.length > 0
                                ? "outline"
                                : "secondary"
                            }
                          >
                            {section.missingTerms.length} gaps
                          </Badge>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {section.demandedTerms.slice(0, 8).map((term) => (
                            <Badge
                              key={term.term}
                              variant={
                                term.matchedInResume ? "secondary" : "outline"
                              }
                            >
                              {term.term} · {term.demandCount}
                            </Badge>
                          ))}
                        </div>
                        {section.recommendations[0] ? (
                          <p className="mt-3 text-sm text-muted-foreground">
                            {section.recommendations[0]}
                          </p>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No recognizable demand terms found yet.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Top knowledge gaps</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {report.topKnowledgeGaps.length > 0 ? (
                    report.topKnowledgeGaps.slice(0, 6).map((gap) => (
                      <div
                        key={gap.term}
                        className="rounded-md border border-border/50 p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium capitalize">
                            {gap.term}
                          </span>
                          <Badge>{gap.demandCount} jobs</Badge>
                        </div>
                        {gap.recommendedResources[0] ? (
                          <a
                            href={gap.recommendedResources[0].url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 block text-sm text-primary underline-offset-4 hover:underline"
                          >
                            {gap.recommendedResources[0].title}
                          </a>
                        ) : null}
                        {gap.projectIdeas[0] ? (
                          <p className="mt-2 text-sm text-muted-foreground">
                            Project idea: {gap.projectIdeas[0]}
                          </p>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Your CV already covers the strongest detected demand
                      signals.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Code2 className="h-4 w-4" />
                  Per-job learning plan
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 lg:grid-cols-2">
                {report.jobKnowledgeGaps.length > 0 ? (
                  report.jobKnowledgeGaps.slice(0, 8).map((jobGap) => (
                    <div
                      key={jobGap.jobId}
                      className="rounded-md border border-border/50 p-3"
                    >
                      <div className="text-sm font-semibold">
                        {jobGap.title}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {jobGap.employer}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {jobGap.missingTerms.map((term) => (
                          <Badge key={term} variant="outline">
                            {term}
                          </Badge>
                        ))}
                      </div>
                      {jobGap.recommendedResources[0] ? (
                        <a
                          href={jobGap.recommendedResources[0].url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 block text-sm text-primary underline-offset-4 hover:underline"
                        >
                          Learn: {jobGap.recommendedResources[0].title}
                        </a>
                      ) : null}
                      {jobGap.projectIdeas[0] ? (
                        <p className="mt-2 text-sm text-muted-foreground">
                          Build: {jobGap.projectIdeas[0]}
                        </p>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No per-job skill gaps detected for the current job history.
                  </p>
                )}
              </CardContent>
            </Card>
          </section>
        </>
      ) : null}
    </main>
  );
}
