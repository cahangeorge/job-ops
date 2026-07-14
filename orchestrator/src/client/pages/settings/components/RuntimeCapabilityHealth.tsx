import { SettingsSectionFrame } from "@client/pages/settings/components/SettingsSectionFrame";
import type {
  RuntimeCapabilityHealthResponse,
  RuntimeCapabilityState,
} from "@shared/types";
import { AlertCircle, CheckCircle2, RefreshCw, TriangleAlert } from "lucide-react";
import type React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type RuntimeCapabilityHealthProps = {
  health: RuntimeCapabilityHealthResponse | null;
  isLoading: boolean;
  onRefresh: () => void | Promise<void>;
  layoutMode?: "accordion" | "panel";
};

const statePresentation: Record<
  RuntimeCapabilityState,
  { label: string; className: string; icon: React.ReactNode }
> = {
  healthy: {
    label: "Healthy",
    className: "border-emerald-300 text-emerald-700",
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-700" />,
  },
  degraded: {
    label: "Degraded",
    className: "border-amber-300 text-amber-700",
    icon: <TriangleAlert className="h-4 w-4 text-amber-700" />,
  },
  unavailable: {
    label: "Unavailable",
    className: "border-destructive/40 text-destructive",
    icon: <AlertCircle className="h-4 w-4 text-destructive" />,
  },
  misconfigured: {
    label: "Misconfigured",
    className: "border-amber-300 text-amber-700",
    icon: <TriangleAlert className="h-4 w-4 text-amber-700" />,
  },
};

export const RuntimeCapabilityHealth: React.FC<RuntimeCapabilityHealthProps> = ({
  health,
  isLoading,
  onRefresh,
  layoutMode,
}) => (
  <SettingsSectionFrame mode={layoutMode} title="Runtime health" value="runtime-health">
    <div className="space-y-3">
      <h2 className="text-base font-semibold">Runtime health</h2>
      <p className="text-sm text-muted-foreground">
        Read-only checks for this workspace. Credentials and configuration values are never shown here.
      </p>
      {health?.capabilities.map((capability) => {
        const presentation = statePresentation[capability.state];
        return (
          <div key={capability.id} className="flex items-start justify-between gap-3 rounded-md border border-border/60 bg-muted/20 p-3">
            <div className="flex min-w-0 gap-2 text-sm">
              {presentation.icon}
              <div className="min-w-0">
                <div className="font-medium">{capability.label}</div>
                <p className="mt-0.5 text-xs text-muted-foreground">{capability.reason}</p>
              </div>
            </div>
            <Badge variant="outline" className={presentation.className}>{presentation.label}</Badge>
          </div>
        );
      })}
      {!health && !isLoading ? <p className="text-sm text-muted-foreground">Runtime health is not available yet.</p> : null}
      <div className="flex justify-end">
        <Button size="sm" variant="outline" disabled={isLoading} onClick={() => void onRefresh()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>
    </div>
  </SettingsSectionFrame>
);
