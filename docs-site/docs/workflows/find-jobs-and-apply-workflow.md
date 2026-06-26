---
id: find-jobs-and-apply-workflow
title: Find Jobs and Apply Workflow
description: Recommended end-to-end CareerOps workflow from discovery through offer decisions.
sidebar_position: 1
---

## Goal

This guide documents the main intended CareerOps-powered workflow in JobOps.

If you follow this order, you get the strongest results from discovery, liveness checks, scoring, tailoring, application tracking, follow-up, interview prep, and offer decisions.

## Recommended flow (in order)

### 1) Run a pipeline first

From the **Jobs** page, use the top-right pipeline/run control.

What this does:

- fetches jobs from enabled extractors
- scores relevance against your resume/profile
- optionally tailors top jobs and prepares PDFs

Important:

- Some scrapers are slower and can take significant time.
- Larger scrape ranges and more sources increase run duration.
- If you are returning after a few days, run the pipeline again before reviewing jobs. Existing results are not auto-refreshed, so older discovered jobs may be stale or expired.

### 2) Add company portal results when needed

For a target company, open a job detail page and use **Portal Scanner** from CareerOps quick actions.

You can:

- scan supported ATS portals such as Greenhouse, Ashby, and Lever
- filter by keywords, department, internship exclusion, and portal
- import selected scan results back into JobOps as jobs

This is useful when a company has multiple related roles and you want them in the same scoring/tailoring pipeline.

### 3) Configure pipeline advanced settings

In pipeline advanced settings, configure:

- how many jobs to discover (approximate target)
- minimum score threshold for tailoring
- how many jobs should be tailored/generated

This directly controls how many jobs appear downstream in `discovered` and `ready`.

### 4) Review discovered jobs and verify liveness

After the run, `discovered` is populated with jobs found by extractors.

For each discovered job:

- review the suitability score
- read the AI fit justification in **Fit Assessment**
- use posting liveness badges/filters to avoid stale jobs
- run **Check posting** from job details when the current posting status matters
- decide whether the opportunity is worth advancing

The liveness workflow uses fast HTTP checks first and falls back to browser-backed Camoufox rendering for pages where static HTML is not enough.

### 5) Use CareerOps evaluation details

Open a job detail page and select **CareerOps Evaluation** in the left sidebar.

Use this panel to review stored evaluation fields such as:

- overall grade and archetype
- CV match score and reasoning
- level strategy
- compensation research
- personalization angle
- legitimacy assessment
- interview preparation guidance

These fields turn the original scoring/evaluation output into concrete application decisions.

### 6) Work from `Ready` for applications

`ready` jobs are the primary application queue.

These jobs already have tailored PDFs generated for the specific job description, using the workflow described in [Reactive Resume](../features/reactive-resume).

At this stage:

1. Open job details.
2. Open the **search links** row when you want quick external research on LinkedIn, GitHub, or the wider web.
3. Use **Prepare application checklist** to save a job note with submission steps, missing evidence, and cover-letter context.
4. If you wrote a resume outside JobOps, use **Upload PDF** in the job detail view to attach that file to the application instead of using the generated version.
5. Optionally enable tracer links for that specific job.
6. If the job shows `PDF stale`, wait for the automatic regeneration to finish before using the refreshed PDF. You can still open or download the old PDF while it is labeled as old.
7. Download the PDF you want to submit.
8. Submit your application externally.

### 7) Use batch actions for queues

When you select multiple jobs in the Jobs page, the floating action bar can run batch CareerOps actions.

Use it to:

- rescore multiple jobs
- check posting liveness for selected jobs
- keep existing bulk skip / move-to-ready workflows intact

Batch liveness is especially useful before spending time tailoring or applying to a queue of older jobs.

### 8) Mark jobs as applied in JobOps

After submitting, return to JobOps and mark the job as `applied`.

Effects:

- job moves to the `applied` state
- configured completion webhook(s) are triggered
- job is included in overview analytics
- follow-up cadence can start from the application timeline

This completes the detailed pre-application loop.

### 9) Follow up, interview, and evaluate offers

After application:

1. Use [Post-Application Tracking](../features/post-application-tracking) and the In Progress board to monitor responses.
2. Use follow-up urgency badges and **Follow-up draft** actions when a recruiter/application needs a nudge.
3. Use **Interview Prep** and the Story Bank to prepare role-specific answers and STAR+R evidence.
4. If an offer arrives, use **Evaluate offer** from the job detail sidebar. JobOps creates a structured evaluation and saves it as a note for the job.

### 10) Run pattern analysis periodically

Open **Pattern Analysis** from the main navigation after you have enough progressed applications.

The report summarizes:

- pipeline funnel counts
- source conversion
- recommended score floor
- targeting recommendations

If the data set is too small, JobOps shows an insufficient-data state instead of overfitting a recommendation.

## What happens next

Once a job is marked `applied`, it becomes part of:

- pipeline outcome analytics on [Overview](/docs/next/features/overview)
- follow-up cadence in Tracking Inbox and In Progress workflows
- optional post-application workflows (inbox/review routing)
- pattern analysis once enough applications have progressed

## Practical tips

- Start with conservative run sizes while tuning sources.
- Re-run the pipeline after time away when you want fresh listings.
- Check liveness before spending time on tailoring or applications.
- Increase tailored-job count only after score thresholds feel calibrated.
- Expect scraper runtime variance by source.
- Keep resume/project context up to date so scoring/tailoring quality stays high.
- Save apply checklists and offer evaluations as notes so future reviews have evidence.
- Use per-job tracer links when you want measurable outbound-link analytics.
- If you use tracer links, review the risk note in [Tracer Links](/docs/next/features/tracer-links): some recipients/security tools may treat redirects as suspicious.

## Related pages

- [CareerOps](/docs/next/features/careerops)
- [Orchestrator](/docs/next/features/orchestrator)
- [Reactive Resume](/docs/next/features/reactive-resume)
- [Settings](/docs/next/features/settings)
- [Overview](/docs/next/features/overview)
- [Post-Application Workflow](/docs/next/workflows/post-application-workflow)
- [Post-Application Tracking](/docs/next/features/post-application-tracking)
