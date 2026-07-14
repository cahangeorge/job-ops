---
id: deep-application
title: Deep Application
description: Tenant-scoped application dossiers, human approval, and immutable submitted artifacts.
sidebar_position: 10
---

## What it is

Deep Application is the controlled path from a job posting to a reviewable application dossier. A dossier records the normalized job-posting snapshot, selected Design Resume revision, Story Bank evidence, tailored proof points, manual drafts, reviewer findings, and any submitted artifact.

A generated draft is not an application submission. The terminal `applied` outcome is available only through the explicit human submission gateway.

## Why it exists

The workflow separates generated or assisted work from a human-approved external action. It preserves the evidence used to assemble an application and prevents generic job updates, stage transitions, inbox actions, or PDF automation from bypassing human approval.

Dossiers, jobs, evidence, artifacts, and filesystem paths are tenant-scoped. Browser DTOs expose bounded summaries rather than raw snapshots, full hashes, internal paths, request/user IDs, or credentials.

## How to use it

1. Open a job's Dossier tab.
2. Review the immutable posting snapshot and current lifecycle.
3. Select bounded Story Bank proof points and confirm the Design Resume revision.
4. Save manual drafts. Each saved draft creates an immutable revision; the editable draft is distinct from history.
5. Send the dossier through reviewer checks.
6. Inspect the generated PDF and text QA state.
7. Submit only through the human submission action after confirming the final PDF and destination.
8. Download the immutable submitted artifact from the tenant-scoped artifact view.

## Common problems

- Editing a job after drafting does not mutate the historical snapshot. Create a new draft revision when the source changes.
- A missing Design Resume or empty Story Bank is a reviewable state, not a reason to fabricate evidence.
- A submission with a changed working-PDF hash is rejected; regenerate or explicitly review the new artifact.
- Generic status PATCHes and automation cannot set `applied`.
- Submitted artifacts are write-once copies and are not overwritten by later working-PDF regeneration.

## Related pages

- [Orchestrator](./orchestrator.md)
- [CareerOps](./careerops.md)
- [Post-application tracking](./post-application-tracking.md)
- [Durable workflows](../reference/durable-workflows.md)
- [Data provenance and retention](../reference/data-provenance-and-retention.md)
