---
id: outcome-learning
title: Outcome Learning
description: Tenant-scoped descriptive learning from application evidence and outcomes.
sidebar_position: 11
---

## What it is

Outcome Learning summarizes observed relationships between application evidence, competency signals, workflow choices, and later outcomes. It is descriptive reporting, not a causal model and not an automatic decision-maker.

Results are sample-aware. Small or incomplete samples are labeled insufficient rather than presented as reliable guidance.

## Why it exists

The feature makes recurring evidence useful without turning historical outcomes into unsupported claims. Every competency evidence item carries source, version, revision, excerpt, confidence, and hash provenance. Learning results remain tenant-scoped and link back to the evidence that supports them.

## How to use it

1. Open the Outcome Learning workspace for the current tenant.
2. Choose the available evidence or outcome view.
3. Read the sample size and confidence label before interpreting a pattern.
4. Open evidence links to inspect the underlying provenance.
5. Treat the result as a prompt for reviewer judgment, not as an automatic ranking or application decision.

## Common problems

- A result marked `insufficient` needs more observations; do not infer a trend from it.
- Evidence from another tenant is never included in a result.
- Generated claims are not verified evidence until a reviewer accepts the source.
- Deleting or superseding source records does not silently rewrite append-only provenance; the result reflects the available historical evidence.

## Related pages

- [Deep Application](./deep-application.md)
- [CareerOps](./careerops.md)
- [Data provenance and retention](../reference/data-provenance-and-retention.md)
