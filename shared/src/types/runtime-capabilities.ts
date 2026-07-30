export const RUNTIME_CAPABILITY_STATES = [
  "healthy",
  "degraded",
  "unavailable",
  "misconfigured",
] as const;

export type RuntimeCapabilityState = (typeof RUNTIME_CAPABILITY_STATES)[number];

export interface RuntimeCapabilityHealth {
  id: "pdf" | "queue" | "llm" | "providers" | "extractors";
  label: string;
  state: RuntimeCapabilityState;
  reason: string;
}

export interface RuntimeCapabilityHealthResponse {
  checkedAt: string;
  capabilities: RuntimeCapabilityHealth[];
}
