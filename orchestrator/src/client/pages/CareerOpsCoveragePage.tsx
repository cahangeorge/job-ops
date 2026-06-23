import * as api from "@client/api";
import { CareerOpsCoveragePanel } from "@client/components/CareerOpsCoveragePanel";
import { useQuery } from "@tanstack/react-query";

export function CareerOpsCoveragePage() {
  const coverageQuery = useQuery({
    queryKey: ["career-ops", "coverage"],
    queryFn: api.getCareerOpsCoverage,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const features = coverageQuery.data?.features ?? [];

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 text-slate-100">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wide text-cyan-300">
          JobOps + CareerOps
        </p>
        <h1 className="text-3xl font-semibold">CareerOps Coverage</h1>
        <p className="max-w-3xl text-sm text-slate-400">
          This page shows which CareerOps capabilities are already native in
          JobOps, which are partial, and which still need to be ported. Missing
          features are visible here for planning, but are not exposed as broken
          job-page actions.
        </p>
      </header>

      {coverageQuery.isLoading && (
        <p className="text-slate-400">Loading CareerOps coverage…</p>
      )}

      {coverageQuery.isError && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          CareerOps coverage could not be loaded.
        </p>
      )}

      {!coverageQuery.isLoading && !coverageQuery.isError && (
        <CareerOpsCoveragePanel features={features} />
      )}
    </main>
  );
}
