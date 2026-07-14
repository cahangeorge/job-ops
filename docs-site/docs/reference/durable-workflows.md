---
id: durable-workflows
title: Durable Workflows
description: SQLite-backed queue, transactional outbox, retries, leases, and dead-letter recovery.
sidebar_position: 20
---

## What it is

JobOps uses a SQLite-backed workflow queue for production background work. Domain mutations that emit work write a transactional outbox row in the same SQLite transaction. The dispatcher turns accepted outbox rows into tenant-scoped tasks.

The current vertical includes automatic PDF regeneration and related settings/Design Resume fan-out. The in-memory queue remains a test injection, not the production default.

## Why it exists

Durability prevents accepted work from disappearing between a database mutation and worker dispatch. Atomic claims, leases, recovery, retries, and dead-letter records make failures visible and recoverable without duplicating effects.

SQLite is the source of truth for this workflow scope. The implementation does not promise PostgreSQL, pg-boss, Temporal, object storage, or a distributed worker adapter.

## How to use it

- Enqueue work through the owning domain transaction or its outbox producer.
- Let the worker claim tasks with a lease and unique fencing token.
- Allow retryable failures to follow bounded backoff and jitter.
- Inspect queue health and dead letters through the operator queue endpoint.
- Replay a dead letter only as an explicit system-admin action. Replay creates a new task and audit event; the original failure history remains immutable.
- During process stop, the worker quiesces before accepting new claims. Startup recovers expired leases and future work.

## Common problems

- A delayed task is not missing; it is unavailable until its durable due time.
- A stopped or idle demand-driven worker is not itself a queue failure when the durable health query succeeds.
- A stale claimant cannot settle a reclaimed lease because completion and failure are fenced by tenant, owner, state, and expiry.
- Filesystem operations cannot be made atomic with SQLite. Design Resume imports and asset changes use durable reconciliation instead.
- Dead-letter payloads and errors are redacted and bounded in operator responses.

## Related pages

- [Runtime capability health](./runtime-capability-health.md)
- [Database backups](../getting-started/database-backups.md)
- [Data provenance and retention](./data-provenance-and-retention.md)
