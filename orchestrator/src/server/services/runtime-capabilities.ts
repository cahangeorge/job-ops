import { logger } from "@infra/logger";
import { runWithRequestContext } from "@infra/request-context";
import { getExtractorRegistry } from "@server/extractors/registry";
import { getJobQueue } from "@server/infra/job-queue-registry";
import { SqliteJobQueue } from "@server/infra/job-queue-sqlite";
import * as settingsRepo from "@server/repositories/settings";
import {
  listPostApplicationProviders,
  resolvePostApplicationProvider,
} from "@server/services/post-application/providers";
import { getOriginalEnvValue } from "@server/services/envSettings";
import { getTypstTemplatePath } from "@server/services/resume-renderer/typst";
import { PIPELINE_EXTRACTOR_SOURCE_IDS } from "@shared/extractors";
import type {
  RuntimeCapabilityHealth,
  RuntimeCapabilityHealthResponse,
} from "@shared/types";
import { settingsRegistry } from "@shared/settings-registry";

type RuntimeSettings = Partial<Record<settingsRepo.SettingKey, string>>;
type QueueHealth = { durable: boolean; worker: "running" | "stopped"; pending: number };
type ProviderStatus = {
  provider: string;
  classification:
    | "ready"
    | "not_configured"
    | "disconnected"
    | "missing_credentials"
    | "provider_error"
    | "provider_unavailable";
};

export type RuntimeCapabilityDependencies = {
  getSettings: () => Promise<RuntimeSettings>;
  getQueueHealth: (tenantId: string) => Promise<QueueHealth>;
  getProviderStatuses: () => Promise<ProviderStatus[]>;
  getExtractors: () => Promise<{ available: number; expected: number }>;
  checkPdfQa: () => Promise<boolean>;
};

async function getDefaultQueueHealth(tenantId: string): Promise<QueueHealth> {
  const queue = getJobQueue();
  if (!(queue instanceof SqliteJobQueue)) {
    return { durable: false, worker: "stopped", pending: 0 };
  }
  const health = await queue.getHealthSummary(tenantId, { deadLetterLimit: 1 });
  return {
    durable: true,
    // The auto-PDF worker is demand-driven and intentionally has no permanent
    // run loop. A successful durable queue health query is the readiness signal;
    // an idle worker must not be reported as unhealthy.
    worker: "running",
    pending: health.states.ready + health.states.leased + health.pendingOutbox,
  };
}

async function getDefaultProviderStatuses(): Promise<ProviderStatus[]> {
  return await Promise.all(
    listPostApplicationProviders().map(async (provider) => {
      const result = await resolvePostApplicationProvider(provider).status({
        accountKey: "default",
      });
      return { provider, classification: result.status.health.classification };
    }),
  );
}

const defaultDependencies: RuntimeCapabilityDependencies = {
  getSettings: () => settingsRepo.getAllSettings(),
  getQueueHealth: getDefaultQueueHealth,
  getProviderStatuses: getDefaultProviderStatuses,
  async getExtractors() {
    const registry = await getExtractorRegistry();
    return {
      available: registry.availableSources.length,
      expected: PIPELINE_EXTRACTOR_SOURCE_IDS.length,
    };
  },
  async checkPdfQa() {
    await import("pdf-parse");
    return true;
  },
};

function hasValue(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function getLlmCapability(settings: RuntimeSettings): RuntimeCapabilityHealth {
  const provider = settingsRegistry.llmProvider.parse(settings.llmProvider);
  if (!provider) {
    return { id: "llm", label: "LLM", state: "misconfigured", reason: "No LLM provider is configured." };
  }
  const hasCredential = hasValue(settings.llmApiKey) || hasValue(getOriginalEnvValue("LLM_API_KEY"));
  if (!hasCredential && provider !== "codex" && provider !== "gemini_cli") {
    return { id: "llm", label: "LLM", state: "misconfigured", reason: "The selected LLM provider has no configured credential." };
  }
  return { id: "llm", label: "LLM", state: "healthy", reason: "An LLM provider is configured." };
}

function getPdfCapability(settings: RuntimeSettings, qaAvailable: boolean): RuntimeCapabilityHealth {
  const renderer = settingsRegistry.pdfRenderer.parse(settings.pdfRenderer) ?? settingsRegistry.pdfRenderer.default();
  if (!qaAvailable) return { id: "pdf", label: "PDF rendering and QA", state: "degraded", reason: "PDF text QA dependency is unavailable." };
  if (renderer === "rxresume") {
    const configured = hasValue(settings.rxresumeBaseResumeId) &&
      (hasValue(settings.rxresumeApiKey) || hasValue(getOriginalEnvValue("RXRESUME_API_KEY"))) &&
      (hasValue(settings.rxresumeUrl) || hasValue(getOriginalEnvValue("RXRESUME_URL")));
    return configured
      ? { id: "pdf", label: "PDF rendering and QA", state: "healthy", reason: "PDF renderer and QA dependencies are configured." }
      : { id: "pdf", label: "PDF rendering and QA", state: "misconfigured", reason: "The selected PDF renderer is missing required local configuration." };
  }
  if (renderer === "typst") getTypstTemplatePath();
  return { id: "pdf", label: "PDF rendering and QA", state: "healthy", reason: "PDF renderer and QA dependencies are available." };
}

function getQueueCapability(health: QueueHealth): RuntimeCapabilityHealth {
  if (!health.durable) {
    return {
      id: "queue",
      label: "Durable queue",
      state: "unavailable",
      reason: "The durable queue is unavailable.",
    };
  }
  return {
    id: "queue",
    label: "Durable queue",
    state: "healthy",
    reason:
      health.pending > 0
        ? "The durable queue is available with pending work."
        : "The durable queue is available and idle.",
  };
}

function getProviderCapability(statuses: ProviderStatus[]): RuntimeCapabilityHealth {
  if (statuses.length === 0) return { id: "providers", label: "Provider connectors", state: "unavailable", reason: "No provider connectors are available." };
  if (statuses.every(({ classification }) => classification === "ready")) return { id: "providers", label: "Provider connectors", state: "healthy", reason: "All provider connectors are ready." };
  if (statuses.every(({ classification }) => classification === "not_configured" || classification === "disconnected")) return { id: "providers", label: "Provider connectors", state: "misconfigured", reason: "No provider connector is connected." };
  return { id: "providers", label: "Provider connectors", state: "degraded", reason: "One or more provider connectors require attention." };
}

function getExtractorCapability(extractors: { available: number; expected: number }): RuntimeCapabilityHealth {
  if (extractors.available === 0) return { id: "extractors", label: "Extractors", state: "unavailable", reason: "No extractor manifests are available at runtime." };
  if (extractors.available < extractors.expected) return { id: "extractors", label: "Extractors", state: "degraded", reason: "Some extractor manifests are unavailable at runtime." };
  return { id: "extractors", label: "Extractors", state: "healthy", reason: "All expected extractor manifests are available." };
}

async function boundedCapability<T>(args: {
  id: RuntimeCapabilityHealth["id"];
  tenantId: string;
  check: () => Promise<T>;
  map: (value: T) => RuntimeCapabilityHealth;
}): Promise<RuntimeCapabilityHealth> {
  try {
    return args.map(await args.check());
  } catch {
    logger.warn("Runtime capability check failed", {
      capability: args.id,
      tenantId: args.tenantId,
    });
    return { id: args.id, label: args.id === "pdf" ? "PDF rendering and QA" : args.id === "llm" ? "LLM" : args.id === "queue" ? "Durable queue" : args.id === "providers" ? "Provider connectors" : "Extractors", state: "unavailable", reason: "This capability could not be checked safely." };
  }
}

export async function collectRuntimeCapabilities(
  tenantId: string,
  dependencies: RuntimeCapabilityDependencies = defaultDependencies,
): Promise<RuntimeCapabilityHealthResponse> {
  return await runWithRequestContext({ tenantId }, async () => {
    const [llm, pdf, queue, providers, extractors] = await Promise.all([
      boundedCapability({ id: "llm", tenantId, check: dependencies.getSettings, map: getLlmCapability }),
      boundedCapability({ id: "pdf", tenantId, check: async () => ({ settings: await dependencies.getSettings(), qaAvailable: await dependencies.checkPdfQa() }), map: ({ settings, qaAvailable }) => getPdfCapability(settings, qaAvailable) }),
      boundedCapability({ id: "queue", tenantId, check: () => dependencies.getQueueHealth(tenantId), map: getQueueCapability }),
      boundedCapability({ id: "providers", tenantId, check: dependencies.getProviderStatuses, map: getProviderCapability }),
      boundedCapability({ id: "extractors", tenantId, check: dependencies.getExtractors, map: getExtractorCapability }),
    ]);
    return { checkedAt: new Date().toISOString(), capabilities: [pdf, queue, llm, providers, extractors] };
  });
}

export async function getRuntimeCapabilities(tenantId: string): Promise<RuntimeCapabilityHealthResponse> {
  return await collectRuntimeCapabilities(tenantId);
}
