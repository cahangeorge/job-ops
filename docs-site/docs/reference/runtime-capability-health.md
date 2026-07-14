---
id: runtime-capability-health
title: Runtime Capability Health
description: Read-only tenant-safe status for PDF, queue, LLM, connectors, and extractors.
sidebar_position: 21
---

## What it is

Runtime capability health is a read-only Settings view and API response for the capabilities needed by JobOps. It reports normalized `healthy`, `degraded`, `unavailable`, or `misconfigured` states for PDF rendering and QA, the durable queue, the configured LLM, provider connectors, and extractors.

The response includes bounded human-readable reasons and a check timestamp. It does not include credentials, secret values, raw environment configuration, internal paths, or provider payloads.

## Why it exists

A failed dependency should be visible before a user starts a workflow. The health check separates missing configuration from temporary unavailability and keeps diagnostics safe to show in the tenant's Settings page.

Checks are bounded and non-destructive. A durable queue can be healthy while its demand-driven worker is idle.

## How to use it

1. Open Settings → Runtime Health.
2. Review each capability state and its bounded reason.
3. Correct configuration only in the relevant Settings or self-hosting environment.
4. Refresh the view after a change.
5. Use server logs with the request ID for operator investigation; do not paste credentials into logs or support requests.

## Common problems

- `misconfigured` means required configuration is missing or invalid; it does not expose the missing secret.
- `unavailable` means the bounded check could not use the dependency safely.
- `degraded` means the capability is partially available, such as only some extractors or connectors.
- Queue health does not mean an external provider is healthy; inspect each capability separately.

## Related pages

- [Durable workflows](./durable-workflows.md)
- [Settings](../features/settings.md)
- [Self-hosting](../getting-started/self-hosting.md)
- [Add an extractor](../workflows/add-an-extractor.md)
