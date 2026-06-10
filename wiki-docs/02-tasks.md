# Implementation Tasks

## Phase 1: Backend Foundations (Week 1-2)

### 1.1 Database Schema (Drizzle)
- [ ] Create `job_evaluations` table schema
- [ ] Create `evaluation_blocks` table schema
- [ ] Create `stories` table schema
- [ ] Create `story_mappings` table schema
- [ ] Create `interview_prep_packs` table schema
- [ ] Create `writing_style_profiles` table schema
- [ ] Create `legitimacy_signals` table schema
- [ ] Create `legitimacy_scores` table schema
- [ ] Generate Drizzle migrations
- [ ] Test migrations on clean database

### 1.2 A-G Evaluation Service
- [ ] Create evaluation orchestrator (coordinates per-block execution)
- [ ] Implement Block A: Role Summary & Score
- [ ] Implement Block B: Candidate Fit Analysis
- [ ] Implement Block C: Level & Positioning Strategy
- [ ] Implement Block D: Compensation Benchmarking
- [ ] Implement Block E: Application Customization Plan
- [ ] Implement Block F: Interview Preparation (STAR+R)
- [ ] Implement Block G: Posting Legitimacy Check
- [ ] Add per-block caching (A, D cacheable by job)
- [ ] Add cost tracking (tokens in/out, estimated USD)
- [ ] Write unit tests for all blocks

### 1.3 Story Bank Service
- [ ] Create story CRUD operations
- [ ] Implement versioned history (story versions)
- [ ] Add search by skill/tag
- [ ] Add auto-extraction from evaluation completions
- [ ] Write unit tests

### 1.4 Interview Prep Service
- [ ] Create pack generation (audience-segmented)
- [ ] Implement company-specific intel gathering
- [ ] Add caching for generated packs
- [ ] Write unit tests

### 1.5 Writing Style Service
- [ ] Create calibration from writing samples
- [ ] Implement style profile storage
- [ ] Add style application to generated content
- [ ] Write unit tests

### 1.6 Legitimacy Scoring Service
- [ ] Implement signal gathering (posting age, description patterns)
- [ ] Add LLM pattern analysis
- [ ] Create score computation (0-100 with confidence)
- [ ] Write unit tests

### 1.7 API Routes
- [ ] `POST /api/jobs/:id/evaluations` — Initiate evaluation
- [ ] `GET /api/jobs/:id/evaluations/:evalId` — Get evaluation results
- [ ] `POST /api/jobs/:id/evaluations/:evalId/blocks/:block` — Run single block
- [ ] `GET /api/jobs/:id/evaluations/:evalId/progress` — SSE progress stream
- [ ] `GET /api/jobs/:id/evaluations/latest` — Latest evaluation
- [ ] `GET /api/stories` — List stories
- [ ] `POST /api/stories` — Create story
- [ ] `PUT /api/stories/:id` — Update story
- [ ] `DELETE /api/stories/:id` — Delete story
- [ ] `GET /api/stories/search` — Search stories
- [ ] `POST /api/interview-prep` — Generate interview prep pack
- [ ] `GET /api/interview-prep/:id` — Get prep pack
- [ ] `POST /api/writing-style/calibrate` — Calibrate writing style
- [ ] `GET /api/writing-style/profile` — Get style profile
- [ ] `GET /api/jobs/:id/legitimacy` — Get legitimacy score
- [ ] Write integration tests for all routes

### 1.8 Verification
- [ ] Run `biome ci .`
- [ ] Run `npm run check:types:shared`
- [ ] Run `npm --workspace orchestrator run check:types`
- [ ] Run `npm --workspace orchestrator run build:client`
- [ ] Run `npm --workspace orchestrator run test:run`
- [ ] Code review with @oracle

---

## Phase 2: SvelteKit Shell & Design System (Week 2-3)

### 2.1 SvelteKit Project Setup
- [ ] Create SvelteKit project with `create-svelte`
- [ ] Configure `adapter-static` (`ssr=false`)
- [ ] Set up Tailwind CSS v4
- [ ] Configure path aliases (`$lib`, `$components`, etc.)
- [ ] Set up TypeScript configuration
- [ ] Configure build output for Express serving

### 2.2 shadcn-svelte Setup
- [ ] Install shadcn-svelte CLI
- [ ] Initialize shadcn with Tailwind CSS v4
- [ ] Install core components (Button, Card, Dialog, etc.)
- [ ] Configure component theme (match job-ops design tokens)
- [ ] Test component rendering

### 2.3 Layout System
- [ ] Create main layout (sidebar + header + content)
- [ ] Implement responsive sidebar (collapsible on mobile)
- [ ] Create header with navigation
- [ ] Implement content area with routing
- [ ] Add dark/light theme toggle

### 2.4 Shared Components
- [ ] StatusBadge (mapped from React StatusBadge)
- [ ] ScoreRing (mapped from React ScoreRing)
- [ ] ScoreIndicator (mapped from React ScoreIndicator)
- [ ] PipelineProgress (mapped from React PipelineProgress)
- [ ] StatusIndicator (mapped from React StatusIndicator)
- [ ] LoadingSpinner
- [ ] ErrorBoundary
- [ ] ConfirmDialog

### 2.5 Real-Time Integration
- [ ] Install sveltekit-sse
- [ ] Configure SSE connection with auth headers
- [ ] Create reactive SSE stores for pipeline progress
- [ ] Create reactive SSE stores for evaluation updates
- [ ] Test auto-reconnection

### 2.6 Express Integration
- [ ] Configure Express to serve SvelteKit static output
- [ ] Set up path routing (SPA fallback)
- [ ] Test production build serving
- [ ] Update Dockerfile for SvelteKit build

### 2.7 Verification
- [ ] Run SvelteKit build
- [ ] Test static output serving
- [ ] Verify theme consistency
- [ ] Test responsive design
- [ ] Run accessibility audit

---

## Phase 3: Page-by-Page Migration (Week 3-5)

### 3.1 Dashboard (HomePage)
- [ ] Create `+page.svelte` with job stats
- [ ] Implement job list with filtering
- [ ] Add pipeline status overview
- [ ] Port charts (LayerChart)
- [ ] Test responsive layout

### 3.2 Job Detail (JobPage)
- [ ] Create `+page.svelte` with job details
- [ ] Implement scoring display
- [ ] Add tailoring interface
- [ ] Port PDF preview
- [ ] Add evaluation results display

### 3.3 Orchestrator (OrchestratorPage)
- [ ] Create `+page.svelte` with pipeline controls
- [ ] Implement real-time progress (SSE)
- [ ] Add extractor selection
- [ ] Port pipeline history
- [ ] Test concurrent pipeline runs

### 3.4 Settings (SettingsPage)
- [ ] Create `+page.svelte` with settings forms
- [ ] Port all settings sections
- [ ] Implement form validation (SuperForms)
- [ ] Add API key management
- [ ] Test settings persistence

### 3.5 In-Progress Board (InProgressBoardPage)
- [ ] Create `+page.svelte` with Kanban-style board
- [ ] Implement drag-and-drop (if needed)
- [ ] Add real-time updates (SSE)
- [ ] Port filtering and sorting

### 3.6 Tracking Inbox (TrackingInboxPage)
- [ ] Create `+page.svelte` with inbox view
- [ ] Implement application status tracking
- [ ] Add email integration display
- [ ] Port filtering and search

### 3.7 Watchlist (WatchlistPage)
- [ ] Create `+page.svelte` with watchlist
- [ ] Implement add/remove functionality
- [ ] Add price change alerts
- [ ] Port company info display

### 3.8 Design Resume (DesignResumePage)
- [ ] Create `+page.svelte` with resume builder
- [ ] Port template selection
- [ ] Implement preview rendering
- [ ] Add PDF generation trigger

### 3.9 Visa Sponsors (VisaSponsorsPage)
- [ ] Create `+page.svelte` with sponsor list
- [ ] Implement search and filtering
- [ ] Add sponsor details display

### 3.10 Tracer Links (TracerLinksPage)
- [ ] Create `+page.svelte` with link management
- [ ] Implement link creation
- [ ] Add click tracking display

### 3.11 Onboarding (OnboardingPage)
- [ ] Create `+page.svelte` with onboarding flow
- [ ] Implement step-by-step wizard
- [ ] Add profile setup
- [ ] Port progress tracking

### 3.12 Auth (SignInPage)
- [ ] Create `+page.svelte` with login form
- [ ] Implement JWT handling
- [ ] Add session management
- [ ] Test auth flow

### 3.13 Offline (OfflinePage)
- [ ] Create `+page.svelte` with offline message
- [ ] Implement service worker registration
- [ ] Add retry logic

### 3.14 Verification
- [ ] Test all pages individually
- [ ] Verify routing between pages
- [ ] Test responsive design on all pages
- [ ] Run accessibility audit on all pages
- [ ] Performance benchmark vs React

---

## Phase 4: New Feature Frontend (Week 5-6)

### 4.1 A-G Evaluation UI
- [ ] Create evaluation trigger button
- [ ] Implement per-block progress display
- [ ] Add block result cards (A through G)
- [ ] Implement SSE progress tracking
- [ ] Add cost display
- [ ] Test partial evaluations

### 4.2 Story Bank UI
- [ ] Create story list view
- [ ] Implement story editor
- [ ] Add search and filtering
- [ ] Implement version history display
- [ ] Add story-to-evaluation mapping

### 4.3 Interview Prep UI
- [ ] Create pack generation interface
- [ ] Implement audience selection (recruiter/HM/peer)
- [ ] Add company intel display
- [ ] Implement pack export (PDF/markdown)

### 4.4 Writing Style UI
- [ ] Create calibration interface
- [ ] Implement sample upload
- [ ] Add style preview
- [ ] Implement style application toggle

### 4.5 Legitimacy Score UI
- [ ] Create score display component
- [ ] Implement red flags list
- [ ] Add confidence indicator
- [ ] Implement signal breakdown

### 4.6 Verification
- [ ] Test all new feature flows
- [ ] Verify SSE integration
- [ ] Test error handling
- [ ] Run accessibility audit

---

## Phase 5: Polish & Cutover (Week 6-7)

### 5.1 Performance Optimization
- [ ] Run Lighthouse audit
- [ ] Analyze bundle size
- [ ] Optimize lazy loading
- [ ] Implement code splitting
- [ ] Test loading performance

### 5.2 Accessibility Audit
- [ ] Run axe-core audit
- [ ] Fix WCAG AA violations
- [ ] Test keyboard navigation
- [ ] Test screen reader compatibility

### 5.3 Responsive Design
- [ ] Test on mobile devices
- [ ] Test on tablet devices
- [ ] Verify breakpoint behavior
- [ ] Test touch interactions

### 5.4 E2E Testing
- [ ] Set up Playwright for SvelteKit
- [ ] Write critical path tests
- [ ] Test auth flow end-to-end
- [ ] Test pipeline flow end-to-end
- [ ] Test evaluation flow end-to-end

### 5.5 Docker Update
- [ ] Update Dockerfile for SvelteKit build
- [ ] Test container build
- [ ] Test container runtime
- [ ] Verify health checks

### 5.6 Documentation
- [ ] Update README.md
- [ ] Update API documentation
- [ ] Update deployment guide
- [ ] Update development guide

### 5.7 Cutover
- [ ] Deploy SvelteKit to staging
- [ ] Run full regression test
- [ ] Get user approval
- [ ] Deploy to production
- [ ] Monitor for issues
- [ ] Decommission React build

### 5.8 Final Verification
- [ ] Run full CI-parity checks
- [ ] Run performance benchmarks
- [ ] Run security audit
- [ ] Get final code review
- [ ] Document lessons learned
