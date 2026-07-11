import * as api from "@client/api";
import {
  ApplicationsPerDayChart,
  ConversionAnalytics,
  DurationSelector,
  type DurationValue,
  ResponseRateBySourceChart,
} from "@client/components/charts";
import { PageHeader, PageMain } from "@client/components/layout";
import type { JobSource, StageEvent } from "@shared/types.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChartColumn, ExternalLink } from "lucide-react";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { queryKeys } from "@/client/lib/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OverviewPipelineRunsSection } from "./overview/OverviewPipelineRunsSection";

type JobWithEvents = {
  id: string;
  source: JobSource;
  datePosted: string | null;
  discoveredAt: string;
  appliedAt: string | null;
  events: StageEvent[];
};

const DURATION_OPTIONS = [7, 14, 30, 90] as const;
const DEFAULT_DURATION = 30;

export const HomePage: React.FC = () => {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Read initial duration from URL
  const initialDuration: DurationValue = (() => {
    const value = Number(searchParams.get("duration"));
    return (
      (DURATION_OPTIONS as readonly number[]).includes(value)
        ? value
        : DEFAULT_DURATION
    ) as DurationValue;
  })();

  const [duration, setDuration] = useState<DurationValue>(initialDuration);

  const overviewQuery = useQuery({
    queryKey: queryKeys.jobs.list({
      statuses: ["applied", "in_progress"],
      view: "list",
    }),
    queryFn: async () => {
      const response = await api.getJobs({
        statuses: ["applied", "in_progress"],
        view: "list",
      });
      const appliedDates = response.jobs.map((job) => job.appliedAt);
      const jobSummaries = response.jobs.map((job) => ({
        id: job.id,
        source: job.source,
        datePosted: job.datePosted,
        discoveredAt: job.discoveredAt,
        appliedAt: job.appliedAt,
      }));

      const appliedJobs = jobSummaries.filter((job) => job.appliedAt);
      const results = await Promise.allSettled(
        appliedJobs.map((job) =>
          queryClient.fetchQuery({
            queryKey: queryKeys.jobs.stageEvents(job.id),
            queryFn: () => api.getJobStageEvents(job.id),
            staleTime: 0,
          }),
        ),
      );
      const eventsMap = new Map<string, StageEvent[]>();

      results.forEach((result, index) => {
        const jobId = appliedJobs[index]?.id;
        if (!jobId) return;
        if (result.status !== "fulfilled") {
          eventsMap.set(jobId, []);
          return;
        }
        eventsMap.set(jobId, result.value);
      });

      const jobsWithEvents: JobWithEvents[] = jobSummaries
        .filter((job) => job.appliedAt)
        .map((job) => ({
          ...job,
          events: eventsMap.get(job.id) ?? [],
        }));

      return { jobsWithEvents, appliedDates };
    },
  });

  const cvIntelligenceQuery = useQuery({
    queryKey: ["pattern-analysis", "overview"],
    queryFn: api.getPatternAnalysis,
    staleTime: 60_000,
  });

  const jobsWithEvents = useMemo(
    () => overviewQuery.data?.jobsWithEvents ?? [],
    [overviewQuery.data],
  );
  const appliedDates = useMemo(
    () => overviewQuery.data?.appliedDates ?? [],
    [overviewQuery.data],
  );
  const error = overviewQuery.error
    ? overviewQuery.error instanceof Error
      ? overviewQuery.error.message
      : "Failed to load applications"
    : null;
  const isLoading = overviewQuery.isLoading;

  const handleDurationChange = useCallback(
    (newDuration: DurationValue) => {
      setDuration(newDuration);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (newDuration === DEFAULT_DURATION) {
          next.delete("duration");
        } else {
          next.set("duration", String(newDuration));
        }
        // Clean up old params
        next.delete("days");
        next.delete("conversionWindow");
        return next;
      });
    },
    [setSearchParams],
  );

  return (
    <>
      <PageHeader
        icon={ChartColumn}
        title="Overview"
        subtitle="Analytics & Insights"
        actions={
          <DurationSelector value={duration} onChange={handleDurationChange} />
        }
      />

      <PageMain>
        <Card className="border-border/50">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>CV intelligence</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                See which skills recur across scraped jobs, where your CV
                already covers them, and what to learn or build next.
              </p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/pattern-analysis">
                Open analysis
                <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {cvIntelligenceQuery.isLoading ? (
              <span className="text-sm text-muted-foreground">
                Loading CV demand map…
              </span>
            ) : null}
            {cvIntelligenceQuery.data?.topKnowledgeGaps.length ? (
              cvIntelligenceQuery.data.topKnowledgeGaps
                .slice(0, 6)
                .map((gap) => (
                  <Badge key={gap.term} variant="secondary">
                    {gap.term} · {gap.demandCount} jobs
                  </Badge>
                ))
            ) : cvIntelligenceQuery.isSuccess ? (
              <span className="text-sm text-muted-foreground">
                No repeated CV gaps detected yet.
              </span>
            ) : null}
          </CardContent>
        </Card>

        <ApplicationsPerDayChart
          appliedAt={appliedDates}
          isLoading={isLoading}
          error={error}
          daysToShow={duration}
        />

        <ConversionAnalytics
          jobsWithEvents={jobsWithEvents}
          error={error}
          daysToShow={duration}
        />

        <ResponseRateBySourceChart jobs={jobsWithEvents} error={error} />

        <OverviewPipelineRunsSection />
      </PageMain>
    </>
  );
};
