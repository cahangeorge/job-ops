import type { CareerOpsFeature } from "@client/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STATUS_LABELS: Record<CareerOpsFeature["status"], string> = {
  implemented: "Implemented",
  partial: "Partial",
  missing: "Missing",
  planned: "Planned",
  blocked: "Blocked",
};

const STATUS_CLASSES: Record<CareerOpsFeature["status"], string> = {
  implemented: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  partial: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  missing: "border-slate-500/40 bg-slate-500/10 text-slate-200",
  planned: "border-blue-500/40 bg-blue-500/10 text-blue-200",
  blocked: "border-red-500/40 bg-red-500/10 text-red-200",
};

interface CareerOpsCoveragePanelProps {
  features: CareerOpsFeature[];
}

export function CareerOpsCoveragePanel({
  features,
}: CareerOpsCoveragePanelProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {features.map((feature) => (
        <Card
          key={feature.id}
          data-testid={`careerops-feature-${feature.id}`}
          className="border-white/10 bg-slate-950/70"
        >
          <CardHeader className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <CardTitle className="text-base text-slate-50">
                {feature.label}
              </CardTitle>
              <Badge className={STATUS_CLASSES[feature.status]}>
                {STATUS_LABELS[feature.status]}
              </Badge>
            </div>
            <p className="text-sm text-slate-400">{feature.description}</p>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-300">
            <p>
              <span className="text-slate-500">Source area:</span>{" "}
              {feature.sourceArea}
            </p>
            {feature.sourcePath && (
              <p>
                <span className="text-slate-500">CareerOps path:</span>{" "}
                {feature.sourcePath}
              </p>
            )}
            {feature.jobOpsPath && (
              <p>
                <span className="text-slate-500">JobOps path:</span>{" "}
                {feature.jobOpsPath}
              </p>
            )}
            {feature.missingReason && <p>{feature.missingReason}</p>}
            {feature.nextStep && (
              <p>
                <span className="text-slate-500">Next:</span> {feature.nextStep}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
