# Architecture Decision Records (ADRs)

## ADR-001: Hybrid SvelteKit SPA + Express API

**Date:** 2025-01-XX
**Status:** Accepted
**Context:** Migrating from React SPA to SvelteKit while keeping Express backend.

**Decision:** Use SvelteKit with `adapter-static` (`ssr=false`) as SPA frontend. Express backend remains unchanged. SvelteKit static output served by Express.

**Rationale:**
- Porting 48 Express routes to SvelteKit `+server.ts` is high-risk with no performance gain
- Express API is stable, tested, and performant
- SvelteKit SPA mode gives us Svelte ecosystem benefits without backend rewrite
- Can incrementally migrate pages without breaking existing functionality

**Consequences:**
- Two build systems (Vite for SvelteKit, existing build for Express)
- No SSR benefits for initial page loads (acceptable for a dashboard app)
- Need to configure Express to serve SvelteKit static output

---

## ADR-002: shadcn-svelte as UI Component Library

**Date:** 2025-01-XX
**Status:** Accepted
**Context:** Need a UI component library for SvelteKit that matches job-ops design quality.

**Decision:** Use shadcn-svelte v1.2.5 (built on Bits UI headless primitives).

**Rationale:**
- Owned source code (copy into project, no dependency lock-in)
- Built on Bits UI (excellent accessibility, WAI-ARIA compliant)
- Tailwind CSS native (matches existing job-ops design system)
- Active community, regular updates
- Better than DaisyUI (more accessible, more customizable)

**Consequences:**
- Need to maintain component source code
- Initial setup time for shadcn CLI and configuration
- Benefits: full control over styling and behavior

---

## ADR-003: Svelte 5 Runes for State Management

**Date:** 2025-01-XX
**Status:** Accepted
**Context:** Need state management approach for SvelteKit frontend.

**Decision:** Use Svelte 5 runes ($state, $derived, $effect) with class-based state modules for shared state.

**Rationale:**
- Native to Svelte 5 (no external dependencies)
- Compiled reactivity (no virtual DOM diffing)
- Class-based state modules for complex shared state
- SvelteKit `load` functions for server state (no TanStack Query needed)
- Simpler than React hooks (no dependency arrays, no stale closures)

**Consequences:**
- Need to learn Svelte 5 runes syntax
- Class-based state modules require TypeScript discipline
- Benefits: smaller bundles, better performance, less boilerplate

---

## ADR-004: SQLite for Now, PostgreSQL Migration Path

**Date:** 2025-01-XX
**Status:** Accepted
**Context:** Database choice for new features (evaluations, story bank, etc.).

**Decision:** Keep SQLite (better-sqlite3, WAL mode) for now. Design schema for PostgreSQL migration.

**Rationale:**
- Current scale: single-node, <100 tenants, <1M jobs
- SQLite WAL mode handles concurrent reads well
- Write contention manageable with batch writes and proper indexing
- Operational simplicity (no external database server)
- Clear migration path when needed (>100 tenants, >5M jobs, need RLS)

**Consequences:**
- Must use `tenantId` as leading column in all composite indexes
- Must batch writes to minimize lock contention
- Must add FTS5 virtual tables for full-text search when needed
- Benefits: zero operational overhead, simple backups

---

## ADR-005: SSE Over WebSocket for Real-Time

**Date:** 2025-01-XX
**Status:** Accepted
**Context:** Real-time updates for pipeline progress, evaluation status, etc.

**Decision:** Keep SSE (Server-Sent Events) for real-time communication. Use sveltekit-sse library.

**Rationale:**
- SSE simpler than WebSocket (unidirectional, auto-reconnect)
- Works through proxies and load balancers
- Existing job-ops SSE infrastructure works well
- sveltekit-sse provides reactive SSE with Svelte 5 runes
- WebSocket overkill for pipeline progress and evaluation updates

**Consequences:**
- No bidirectional communication (use REST for mutations)
- Need to handle SSE connection management
- Benefits: simpler architecture, better reliability

---

## ADR-006: career-ops as Design Spec, Not Runtime Dependency

**Date:** 2025-01-XX
**Status:** Accepted
**Context:** How to integrate career-ops features without runtime bridge.

**Decision:** Extract career-ops' intellectual assets (prompts, algorithms, data structures) and implement natively in job-ops. No runtime bridge.

**Rationale:**
- career-ops is CLI/TUI (Go + Bubble Tea + Markdown)
- job-ops is full-stack web (React + Express + SQLite)
- No shared API, database, or deployment model
- Bridge would create fragile coupling and security issues
- More maintenance than porting ideas directly

**Consequences:**
- Need to rewrite career-ops logic in TypeScript
- Need to adapt career-ops prompts for job-ops LLM service
- Benefits: clean architecture, no external dependencies, full control

---

## ADR-007: LayerChart for Visualization

**Date:** 2025-01-XX
**Status:** Accepted
**Context:** Need chart library for SvelteKit that handles dashboard visualizations.

**Decision:** Use LayerChart for declarative Svelte charts.

**Rationale:**
- Declarative API (similar to Recharts but Svelte-native)
- SSR-friendly (works with SvelteKit)
- Supports SVG, HTML, Canvas, WebGL rendering
- Active development, good documentation
- Better than raw D3 (less boilerplate) or chart.js (more Svelte-integrated)

**Consequences:**
- Need to learn LayerChart API
- May need custom components for complex visualizations
- Benefits: Svelte-native, SSR-compatible, good performance

---

## ADR-008: SuperForms for Form Management

**Date:** 2025-01-XX
**Status:** Accepted
**Context:** Need form library for SvelteKit with validation.

**Decision:** Use SuperForms v2 with Zod validation.

**Rationale:**
- Gold standard for SvelteKit forms
- Progressive enhancement (works without JS)
- Typed validation with Zod (matches existing job-ops validation)
- Supports complex forms (multi-step, dynamic fields)
- Better than SvelteKit native forms (more features, better DX)

**Consequences:**
- Need to define Zod schemas for all forms
- Need to learn SuperForms API
- Benefits: excellent DX, progressive enhancement, type safety
