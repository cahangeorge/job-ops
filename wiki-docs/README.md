# Wiki Docs — SvelteKit Migration & A-G Evaluation Integration

## Overview

This wiki-doc contains the complete implementation plan, architecture decisions, task tracking, and technical specifications for migrating the **job-ops** platform to a **SvelteKit SPA + Express API hybrid architecture**, while integrating advanced evaluation, story bank, and interview preparation features from the **career-ops** project.

## How to Read This

| Document | What it is | Read when |
|---|---|---|
| [`00-master-plan.md`](00-master-plan.md) | The full architectural plan, from Phase 0 to Phase 5 | Start here for the big picture |
| [`01-decisions-log.md`](01-decisions-log.md) | Architecture decisions (ADR-style) and their rationale | When you need to understand *why* a choice was made |
| [`02-tasks.md`](02-tasks.md) | Phase-by-phase task lists, priorities, and dependencies | When you are ready to work |
| [`03-status.md`](03-status.md) | Current status of each phase — updated in real time | When you want to know where we are |
| [`04-api-contract.md`](04-api-contract.md) | REST API endpoint specifications, SSE streams, request/response schemas | When building or consuming the API |
| [`05-database-schema.md`](05-database-schema.md) | Drizzle ORM schema definitions for new tables and indexes | When writing migrations or queries |
| [`06-components.md`](06-components.md) | Frontend component mapping: React → SvelteKit (shadcn-svelte) | When porting UI components |
| [`07-new-features.md`](07-new-features.md) | Deep specifications for A-G evaluation, story bank, interview prep, posting legitimacy | When implementing domain logic |

## Quick Links

- **Up-stream Project:** `job-ops` (React + Express + SQLite)
- **Feature Reference:** `career-ops` (TUI + Markdown workflows)
- **Build Tool:** Vite, SvelteKit, Tailwind CSS v4, `adapter-static`
- **Deployment:** Podman / Docker, Linux amd64, Node 22

## Conventions

- All paths in this wiki are relative to the repository root unless noted otherwise.
- Status states: `🔴 Not Started`, `🟡 In Progress`, `🟢 Complete`, `⏸️ Paused`.
- Every task in `02-tasks.md` is linked to a phase in `00-master-plan.md`.

Last updated: 2026-06-05
