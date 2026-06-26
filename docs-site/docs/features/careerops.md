---
id: careerops
title: CareerOps
description: CareerOps-powered scoring, application, follow-up, interview, offer, and learning workflows in JobOps.
sidebar_position: 8
---

## What it is

CareerOps is the JobOps workflow layer that turns scraped or manually added jobs into an end-to-end operating system for applications.

It covers the full loop:

1. discover or import roles
2. score and evaluate fit
3. verify postings are still live
4. tailor documents and prepare application checklists
5. apply and track follow-up cadence
6. prepare for interviews
7. evaluate offers
8. learn from outcome patterns

## Why it exists

Job search work breaks down when discovery, evidence, application status, follow-up, interview preparation, and offer decisions live in separate tools.

CareerOps keeps those artifacts attached to the job record so you can:

- avoid stale postings before tailoring or applying
- reuse evaluation output when deciding whether to apply
- keep checklists, follow-up drafts, offer evaluations, and notes in one place
- learn which sources and score ranges produce progressed applications

## How to use it

### Job detail quick actions

Open a job detail page and use CareerOps actions for:

- **ATS Fit**: analyze job description keywords against resume/profile text.
- **Cover Letter**: draft a tailored cover letter from job, company, and resume context.
- **Negotiation**: generate collaborative negotiation scripts.
- **Portal Scanner**: scan a supported company ATS portal and import selected results as JobOps jobs.
- **Check posting**: verify whether the saved posting still appears live, expired, removed, or uncertain.
- **Evaluate offer**: create a structured offer evaluation and save it as a job note.

### Job detail panels

Use job detail panels to review and preserve application evidence:

- **CareerOps Evaluation** exposes stored evaluation details such as grade, archetype, CV match, compensation research, personalization angle, legitimacy, and interview guidance.
- **Interview Prep** generates role-specific preparation from the job, profile, and Story Bank.
- **Notes** stores apply checklists, follow-up drafts, offer evaluations, cover letters, and other job evidence.

### Job list batch actions

Select multiple jobs in the Jobs page to use the floating action bar.

CareerOps batch actions include:

- batch rescore
- batch posting liveness checks
- existing bulk skip / move-to-ready actions

Use these before tailoring or applying to a queue of older jobs.

### Tracking workflows

Follow-up cadence is calculated for applications and conversations based on stage, timestamps, and existing follow-up history.

You can use follow-up urgency indicators and draft creation from:

- Tracking Inbox
- In Progress board

Drafts are saved as job notes so they remain attached to the application record.

### Standalone pages

Use standalone CareerOps pages for cross-job workflows:

- **Story Bank** maintains reusable STAR+R stories and proof points.
- **Pattern Analysis** summarizes progressed applications, source conversion, score floor recommendations, and targeting advice.
- **CareerOps Coverage** reports which CareerOps surfaces are implemented, partial, or still planned.

## Common problems

### Posting liveness is uncertain

Some job boards render important content with JavaScript, hide state behind region/cookie banners, or block automated requests.

JobOps uses a layered liveness strategy:

1. direct HTTP checks for clear 404/410/expired/live signals
2. HTML signal detection for static pages
3. Camoufox-backed browser rendering when a page needs JavaScript

If the result is still uncertain, open the posting manually before spending time tailoring or applying.

### Pattern Analysis says there is not enough data

Pattern Analysis is useful only after enough applications have progressed.

When the data set is too small, JobOps shows an insufficient-data state instead of producing a misleading recommendation.

### Offer evaluation is saved as a note

Offer evaluation is intentionally lightweight in the first version.

The workflow produces:

- score
- recommendation (`accept`, `negotiate`, `reject`, or `hold`)
- risks
- tradeoffs
- negotiation angle
- saved JobNote report

A structured offer table can be added later if the workflow needs richer reporting.

## Related pages

- [Find Jobs and Apply Workflow](/docs/next/workflows/find-jobs-and-apply-workflow)
- [Post-Application Tracking](/docs/next/features/post-application-tracking)
- [In Progress Board](/docs/next/features/in-progress-board)
- [Orchestrator](/docs/next/features/orchestrator)
- [Multi-select and Bulk Actions](/docs/next/features/multi-select-and-bulk-actions)
