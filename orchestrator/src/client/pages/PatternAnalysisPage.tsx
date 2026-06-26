import { getPatternAnalysis } from "@client/api";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, BarChart3 } from "lucide-react";
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
        </>
      ) : null}
    </main>
  );
}
