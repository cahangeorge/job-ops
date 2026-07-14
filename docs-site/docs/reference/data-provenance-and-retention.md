---
id: data-provenance-and-retention
title: Data Provenance and Retention
description: Tenant scope, immutable evidence, artifact history, and deletion boundaries.
sidebar_position: 22
---

## What it is

JobOps stores provenance alongside important workflow records. Competency evidence records preserve source type, source/version, revision, content hash, bounded excerpt, and confidence. Dossier drafts, job-posting snapshots, submitted artifacts, queue attempts, and replay audits preserve their own immutable history.

Every tenant-owned record, queue task, cache key, file path, and retrieval query is tenant-scoped.

## Why it exists

Provenance makes generated and imported information reviewable. Append-only history prevents later edits from rewriting what was known when an application, outcome, or background task was processed.

The system distinguishes mutable working data from immutable submitted artifacts and historical revisions. Filesystem and SQLite are not one atomic transaction; reconciliation records bridge that boundary for supported asset workflows.

## How to use it

- Use source/version and revision fields to identify the origin of evidence.
- Follow bounded evidence links from learning and dossier views.
- Treat submitted artifacts and historical revisions as read-only.
- Use tenant-scoped API views for retrieval; never construct another tenant's path or identifier into a request.
- Use database backup procedures before maintenance or deletion operations.

## Common problems

- Updating a working PDF does not update an already submitted artifact.
- A new job-posting snapshot or draft revision is created when source content changes; old history is not silently mutated.
- Deleting a mutable story or draft does not erase append-only usage, submission, or audit evidence required by the owning workflow.
- Credentials and provider authorization headers are never provenance fields and must not be copied into notes, logs, or evidence excerpts.
- Retention and deletion operations must preserve the owning feature's append-only and legal/audit boundaries; do not manually delete SQLite rows to bypass them.

## Related pages

- [Deep Application](../features/deep-application.md)
- [Outcome Learning](../features/outcome-learning.md)
- [Durable workflows](./durable-workflows.md)
- [Database backups](../getting-started/database-backups.md)
