import { getOutcomeLearning, type OutcomeLearningReport } from "@client/api";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ChartNoAxesCombined, Database } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function formatSourceType(sourceType: string) {
  return sourceType.replaceAll("_", " ");
}

function formatExtractionMethod(extractionMethod: string) {
  return `${extractionMethod[0]?.toUpperCase() ?? ""}${extractionMethod.slice(1)} extraction`;
}

function formatRate(numerator: number, denominator: number) {
  if (denominator === 0) return "—";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function Provenance({
  evidenceSources,
}: {
  evidenceSources: OutcomeLearningReport["competencies"][number]["evidenceSources"];
}) {
  if (evidenceSources.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No provenance has been recorded for this competency yet.
      </p>
    );
  }

  return (
    <ul className="space-y-2" aria-label="Evidence provenance">
      {evidenceSources.map((source, index) => (
        <li
          className="rounded-md border border-border/50 p-3 text-sm"
          key={`${source.sourceType}-${source.sourceVersion}-${source.sourceRevision}-${index}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              {formatSourceType(source.sourceType)}
            </Badge>
            {source.sourceVersion ? (
              <span className="text-muted-foreground">
                Version {source.sourceVersion}
              </span>
            ) : null}
            {source.sourceRevision ? (
              <span className="text-muted-foreground">
                Revision {source.sourceRevision}
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-muted-foreground">
            {formatExtractionMethod(source.extractionMethod)} ·{" "}
            {Math.round(source.confidence * 100)}% confidence
          </p>
        </li>
      ))}
    </ul>
  );
}

export function OutcomeLearningPage() {
  const reportQuery = useQuery({
    queryKey: ["outcome-learning"],
    queryFn: getOutcomeLearning,
  });
  const report = reportQuery.data;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6">
      <header>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ChartNoAxesCombined className="h-4 w-4" />
          Analytics
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Outcome Learning
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Review descriptive outcome counts by competency alongside the source
          provenance that produced them.
        </p>
      </header>

      {reportQuery.isLoading ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Loading outcome learning…
          </CardContent>
        </Card>
      ) : null}

      {reportQuery.isError ? (
        <Card className="border-destructive/40">
          <CardContent className="flex items-center gap-2 p-6 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            Outcome learning could not be loaded.
          </CardContent>
        </Card>
      ) : null}

      {report?.competencies.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No competency outcome data yet. Record application outcomes to see
            descriptive counts here.
          </CardContent>
        </Card>
      ) : null}

      {report?.competencies.map((competency) => {
        const lowSample = competency.sampleSize < report.smallSampleThreshold;
        return (
          <section
            aria-labelledby={`competency-${competency.competencyName}`}
            key={competency.competencyName}
          >
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2
                      className="font-semibold leading-none tracking-tight"
                      id={`competency-${competency.competencyName}`}
                    >
                      {competency.competencyName}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {competency.sampleSize} observed outcome
                      {competency.sampleSize === 1 ? "" : "s"}
                    </p>
                  </div>
                  <Badge variant={lowSample ? "outline" : "secondary"}>
                    {lowSample ? "Low sample" : "Descriptive sample"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div>
                  <h3 className="text-sm font-medium">Observed outcomes</h3>
                  {competency.observations.length > 0 ? (
                    <ul
                      className="mt-3 space-y-2"
                      aria-label="Observed outcomes"
                    >
                      {competency.observations.map((observation) => (
                        <li
                          className="rounded-md border border-border/50 p-3"
                          key={`${observation.stage}-${observation.outcome}`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-medium">
                              {observation.stage} · {observation.outcome}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {observation.numerator} /{" "}
                              {observation.denominator} ·{" "}
                              {formatRate(
                                observation.numerator,
                                observation.denominator,
                              )}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">
                      No observed outcomes for this competency yet.
                    </p>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-medium">Source provenance</h3>
                  <div className="mt-3">
                    <Provenance evidenceSources={competency.evidenceSources} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>
        );
      })}

      <Card className="border-border/50 bg-muted/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4" />
            How to read this workspace
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Values are descriptive records, not predictions or recommendations. A
          low sample means fewer than the displayed threshold of{" "}
          {report?.smallSampleThreshold ?? "…"} observed outcomes. Provenance
          identifies the source type, version or revision, extraction method,
          and confidence without exposing underlying evidence.
        </CardContent>
      </Card>
    </main>
  );
}
