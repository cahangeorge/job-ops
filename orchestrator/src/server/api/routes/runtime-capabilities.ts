import { forbidden } from "@infra/errors";
import { asyncRoute, fail, ok } from "@infra/http";
import { getTenantId } from "@infra/request-context";
import { getRuntimeCapabilities } from "@server/services/runtime-capabilities";
import {
  RUNTIME_CAPABILITY_STATES,
  type RuntimeCapabilityHealthResponse,
} from "@shared/types";
import { type Request, type Response, Router } from "express";

export const runtimeCapabilitiesRouter = Router();

const capabilityIds = new Set([
  "pdf",
  "queue",
  "llm",
  "providers",
  "extractors",
]);
const capabilityStates = new Set<string>(RUNTIME_CAPABILITY_STATES);

function boundedText(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, 240) || fallback;
}

function toRuntimeCapabilitiesDto(
  value: RuntimeCapabilityHealthResponse,
): RuntimeCapabilityHealthResponse {
  return {
    checkedAt: boundedText(value.checkedAt, new Date(0).toISOString()),
    capabilities: value.capabilities.flatMap((capability) => {
      if (
        !capabilityIds.has(capability.id) ||
        !capabilityStates.has(capability.state)
      ) {
        return [];
      }
      return [
        {
          id: capability.id,
          label: boundedText(capability.label, "Runtime capability"),
          state: capability.state,
          reason: boundedText(
            capability.reason,
            "No status detail is available.",
          ),
        },
      ];
    }),
  };
}

runtimeCapabilitiesRouter.get(
  "/",
  asyncRoute(async (_req: Request, res: Response) => {
    const tenantId = getTenantId();
    if (!tenantId) {
      fail(res, forbidden("Authenticated tenant context is required"));
      return;
    }
    ok(res, toRuntimeCapabilitiesDto(await getRuntimeCapabilities(tenantId)));
  }),
);
