# Master Plan: Job-Ops Platform Migration & Enhancement

## Vision

Merge the best of **career-ops** (A-G evaluation framework, story bank, interview prep, legitimacy scoring) into **job-ops** (full-stack web platform), then migrate the React SPA frontend to **SvelteKit** for performance, developer experience, and ecosystem advantages.

## Architecture Decision

**Hybrid SvelteKit SPA + Express API Backend**

- SvelteKit with `adapter-static` (`ssr=false`) — SvelteKit builds a static SPA, Express serves it
- Express backend remains unchanged — all 48 API routes stay as-is
- New features get new Express API routes (Phase 1)
- SvelteKit replaces React for all frontend pages (Phases 2-4)

**Why not SvelteKit full-stack?** Porting 48 Express routes to SvelteKit `+server.ts` is high-risk, high-effort with no performance gain (the API is already fast). Keep the stable backend.

**Why not React SPA forever?** SvelteKit offers smaller bundles (no virtual DOM), better DX (runes, no boilerplate), and superior performance (compiled, not interpreted).

## Tech Stack

### Frontend (SvelteKit)
| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | SvelteKit + Svelte 5 | Compiled, tiny bundles, runes reactivity |
| UI Components | shadcn-svelte (Bits UI primitives) | Owned source, excellent a11y, Tailwind-native |
| Styling | Tailwind CSS v4 | Matches existing job-ops design system |
| Forms | SuperForms + Zod | Progressive enhancement, typed validation |
| Charts | LayerChart | Declarative Svelte charts, SSR-friendly |
| State | Svelte 5 runes ($state, $derived, $effect) | No external store needed for most cases |
| Server State | SvelteKit `load` functions + fetch | Native, no TanStack Query needed |
| Real-time | sveltekit-sse library | Reactive SSE with runes, auto-reconnect |
| Animations | Svelte built-in transitions + CSS | No Framer Motion needed |
| Routing | SvelteKit file-based routing | Automatic, no react-router config |

### Backend (Unchanged)
| Layer | Choice |
|-------|--------|
| Runtime | Node.js 22 + Express |
| Database | better-sqlite3 (WAL mode) + Drizzle ORM |
| Auth | JWT via better-sqlite3 sessions |
| LLM | 16-provider resilient service |
| Pipeline | 7-step sequential with asyncPool |
| Extractors | 20 manifest-based extractors |

### New Backend Additions (Phase 1)
| Feature | New Tables | New Routes |
|---------|-----------|------------|
| A-G Evaluation | `job_evaluations`, `evaluation_blocks` | `/api/jobs/:id/evaluations/*` |
| Story Bank | `stories`, `story_mappings` | `/api/stories/*` |
| Interview Prep | `interview_prep_packs` | `/api/interview-prep/*` |
| Writing Style | `writing_style_profiles` | `/api/writing-style/*` |
| Legitimacy | `legitimacy_signals`, `legitimacy_scores` | `/api/jobs/:id/legitimacy` |

## Implementation Phases

### Phase 1: Backend Foundations (Week 1-2)
- [ ] Create 8 new database tables (Drizzle schema + migrations)
- [ ] Implement A-G evaluation service (orchestrator, per-block LLM calls)
- [ ] Implement story bank service (CRUD, versioning, search)
- [ ] Implement interview prep service (audience-segmented packs)
- [ ] Implement writing style service (calibration from samples)
- [ ] Implement legitimacy scoring service (signal gathering + LLM analysis)
- [ ] Create all new API routes with validation
- [ ] Write tests for all new services and routes

### Phase 2: SvelteKit Shell & Design System (Week 2-3)
- [ ] Create SvelteKit project with adapter-static
- [ ] Set up shadcn-svelte with Bits UI
- [ ] Configure Tailwind CSS v4 (match existing design tokens)
- [ ] Create layout system (sidebar, header, content area)
- [ ] Implement theme system (dark/light, matching job-ops)
- [ ] Create shared components (StatusBadge, ScoreRing, etc.)
- [ ] Set up sveltekit-sse for real-time updates
- [ ] Configure Express to serve SvelteKit static output

### Phase 3: Page-by-Page Migration (Week 3-5)
- [ ] Dashboard (HomePage → +page.svelte)
- [ ] Job Detail (JobPage → +page.svelte)
- [ ] Orchestrator (OrchestratorPage → +page.svelte)
- [ ] Settings (SettingsPage → +page.svelte)
- [ ] In-Progress Board (InProgressBoardPage → +page.svelte)
- [ ] Tracking Inbox (TrackingInboxPage → +page.svelte)
- [ ] Watchlist (WatchlistPage → +page.svelte)
- [ ] Design Resume (DesignResumePage → +page.svelte)
- [ ] Visa Sponsors (VisaSponsorsPage → +page.svelte)
- [ ] Tracer Links (TracerLinksPage → +page.svelte)
- [ ] Onboarding (OnboardingPage → +page.svelte)
- [ ] Auth (SignInPage → +page.svelte)
- [ ] Offline (OfflinePage → +page.svelte)

### Phase 4: New Feature Frontend (Week 5-6)
- [ ] A-G Evaluation UI (per-block results, progress tracking)
- [ ] Story Bank UI (CRUD, search, version history)
- [ ] Interview Prep UI (pack generation, audience selection)
- [ ] Writing Style UI (calibration, preview)
- [ ] Legitimacy Score UI (score display, red flags)

### Phase 5: Polish & Cutover (Week 6-7)
- [ ] Performance audit (Lighthouse, bundle analysis)
- [ ] Accessibility audit (WCAG AA compliance)
- [ ] Responsive design verification
- [ ] E2E test suite (Playwright)
- [ ] Docker build update (SvelteKit output)
- [ ] Documentation updates
- [ ] Cutover from React to SvelteKit

## Performance Targets

| Metric | Current (React) | Target (SvelteKit) |
|--------|----------------|-------------------|
| Bundle Size | ~500KB gzipped | ~150KB gzipped |
| First Contentful Paint | ~2s | ~800ms |
| Time to Interactive | ~3.5s | ~1.2s |
| Lighthouse Score | ~70 | ~95 |
| Memory Usage | ~80MB | ~30MB |

## Risk Mitigation

1. **Incremental migration** — SvelteKit SPA mode means both React and SvelteKit can coexist during transition
2. **Backend stability** — Express API unchanged, no risk to existing functionality
3. **Rollback capability** — Keep React build alongside SvelteKit until cutover is complete
4. **Test coverage** — Run CI-parity checks after each phase
5. **Performance validation** — Measure bundle size and load times at each phase boundary
