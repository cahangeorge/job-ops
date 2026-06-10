# Database Schema Definitions

## Existing Tables (30 tables)

### Tenant-Scoped Tables (26)
- `tenants` — Tenant definitions
- `users` — User accounts (global)
- `jobs` — Job listings
- `pipelineRuns` — Pipeline execution history
- `pipelineSteps` — Individual step results
- `settings` — User settings
- `profiles` — User profiles
- `resumes` — Generated resumes
- `resumeTemplates` — Resume templates
- `coverLetters` — Generated cover letters
- `applications` — Application tracking
- `applicationEvents` — Application status changes
- `watchlist` — Watched jobs/companies
- `watchlistAlerts` — Price change alerts
- `tracerLinks` — Tracking links
- `tracerLinkEvents` — Link click events
- `visaSponsors` — UK visa sponsors
- `visaSponsorMatches` — Sponsor-job matches
- `ghostwriterRequests` — Ghostwriter generations
- `writingStyleSamples` — Writing style calibration
- `designResumes` — Design resume generations
- `designResumeTemplates` — Design templates
- `onboardingProgress` — Onboarding state
- `analyticsInstallState` — Analytics (global)
- `analyticsMilestones` — Analytics milestones (global)
- `analyticsServerEventReplays` — Analytics replays (global)

### Global Tables (4)
- `users`
- `analyticsInstallState`
- `analyticsMilestones`
- `analyticsServerEventReplays`

---

## New Tables (Phase 1)

### job_evaluations
Tracks A-G evaluation runs for jobs.

```typescript
export const jobEvaluations = sqliteTable(
  "job_evaluations",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),

    // Block completion flags
    blockACompleted: integer("block_a_completed", { mode: "boolean" })
      .notNull()
      .default(false),
    blockBCompleted: integer("block_b_completed", { mode: "boolean" })
      .notNull()
      .default(false),
    blockCCompleted: integer("block_c_completed", { mode: "boolean" })
      .notNull()
      .default(false),
    blockDCompleted: integer("block_d_completed", { mode: "boolean" })
      .notNull()
      .default(false),
    blockECompleted: integer("block_e_completed", { mode: "boolean" })
      .notNull()
      .default(false),
    blockFCompleted: integer("block_f_completed", { mode: "boolean" })
      .notNull()
      .default(false),
    blockGCompleted: integer("block_g_completed", { mode: "boolean" })
      .notNull()
      .default(false),

    // Block data (JSON)
    blockAData: text("block_a_data", { mode: "json" }),
    blockBData: text("block_b_data", { mode: "json" }),
    blockCData: text("block_c_data", { mode: "json" }),
    blockDData: text("block_d_data", { mode: "json" }),
    blockEData: text("block_e_data", { mode: "json" }),
    blockFData: text("block_f_data", { mode: "json" }),
    blockGData: text("block_g_data", { mode: "json" }),

    // Status
    status: text("status", {
      enum: ["pending", "processing", "completed", "failed", "partial"],
    })
      .notNull()
      .default("pending"),

    // Cost tracking
    totalTokensIn: integer("total_tokens_in"),
    totalTokensOut: integer("total_tokens_out"),
    estimatedCostUsd: real("estimated_cost_usd"),

    // Timestamps
    startedAt: text("started_at").notNull().default("now"),
    completedAt: text("completed_at"),
    errorMessage: text("error_message"),
  },
  (table) => [
    index("idx_evaluations_tenant_job").on(table.tenantId, table.jobId),
    index("idx_evaluations_status").on(table.tenantId, table.status),
    index("idx_evaluations_user").on(table.tenantId, table.userId),
  ]
);
```

### evaluation_blocks
Tracks individual block execution within an evaluation.

```typescript
export const evaluationBlocks = sqliteTable(
  "evaluation_blocks",
  {
    id: text("id").primaryKey(),
    evaluationId: text("evaluation_id")
      .notNull()
      .references(() => jobEvaluations.id, { onDelete: "cascade" }),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    block: text("block", {
      enum: ["A", "B", "C", "D", "E", "F", "G"],
    }).notNull(),

    status: text("status", {
      enum: ["pending", "processing", "completed", "failed", "cached"],
    })
      .notNull()
      .default("pending"),

    data: text("data", { mode: "json" }),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    estimatedCostUsd: real("estimated_cost_usd"),
    durationMs: integer("duration_ms"),
    errorMessage: text("error_message"),

    startedAt: text("started_at").notNull().default("now"),
    completedAt: text("completed_at"),
  },
  (table) => [
    index("idx_blocks_evaluation").on(table.evaluationId),
    index("idx_blocks_tenant_block").on(table.tenantId, table.block),
  ]
);
```

### stories
STAR+R story bank for interview preparation.

```typescript
export const stories = sqliteTable(
  "stories",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),

    title: text("title").notNull(),
    content: text("content").notNull(),
    tags: text("tags", { mode: "json" }).notNull().default("[]"),
    skills: text("skills", { mode: "json" }).notNull().default("[]"),

    // STAR+R components (extracted or manually entered)
    situation: text("situation"),
    task: text("task"),
    action: text("action"),
    result: text("result"),
    reflection: text("reflection"),

    version: integer("version").notNull().default(1),

    createdAt: text("created_at").notNull().default("now"),
    updatedAt: text("updated_at").notNull().default("now"),
  },
  (table) => [
    index("idx_stories_tenant").on(table.tenantId),
    index("idx_stories_user").on(table.tenantId, table.userId),
  ]
);
```

### story_mappings
Maps stories to evaluation blocks (Block F).

```typescript
export const storyMappings = sqliteTable(
  "story_mappings",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    evaluationId: text("evaluation_id")
      .notNull()
      .references(() => jobEvaluations.id, { onDelete: "cascade" }),
    storyId: text("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),

    jobRequirement: text("job_requirement").notNull(),
    relevanceScore: real("relevance_score").notNull(),
    starPlusR: text("star_plus_r", { mode: "json" }).notNull(),

    createdAt: text("created_at").notNull().default("now"),
  },
  (table) => [
    index("idx_mappings_tenant_evaluation").on(table.tenantId, table.evaluationId),
    index("idx_mappings_story").on(table.storyId),
  ]
);
```

### interview_prep_packs
Generated interview preparation packs.

```typescript
export const interviewPrepPacks = sqliteTable(
  "interview_prep_packs",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),

    audience: text("audience", {
      enum: ["recruiter", "hiring-manager", "peer", "general"],
    }).notNull(),

    status: text("status", {
      enum: ["generating", "completed", "failed"],
    })
      .notNull()
      .default("generating"),

    companyIntel: text("company_intel", { mode: "json" }),
    questions: text("questions", { mode: "json" }),
    talkingPoints: text("talking_points", { mode: "json" }),

    generatedAt: text("generated_at"),
    errorMessage: text("error_message"),

    createdAt: text("created_at").notNull().default("now"),
    updatedAt: text("updated_at").notNull().default("now"),
  },
  (table) => [
    index("idx_prep_tenant_job").on(table.tenantId, table.jobId),
    index("idx_prep_tenant_user").on(table.tenantId, table.userId),
  ]
);
```

### writing_style_profiles
Calibrated writing style profiles.

```typescript
export const writingStyleProfiles = sqliteTable(
  "writing_style_profiles",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),

    tone: text("tone").notNull(),
    sentenceLength: text("sentence_length").notNull(),
    vocabulary: text("vocabulary").notNull(),
    structure: text("structure").notNull(),
    personalityTraits: text("personality_traits", { mode: "json" })
      .notNull()
      .default("[]"),

    calibratedAt: text("calibrated_at").notNull().default("now"),
    sampleCount: integer("sample_count").notNull().default(0),

    createdAt: text("created_at").notNull().default("now"),
    updatedAt: text("updated_at").notNull().default("now"),
  },
  (table) => [
    index("idx_style_tenant_user").on(table.tenantId, table.userId),
  ]
);
```

### legitimacy_signals
Raw legitimacy signals gathered for jobs.

```typescript
export const legitimacySignals = sqliteTable(
  "legitimacy_signals",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),

    postingAge: integer("posting_age"),
    recencyScore: real("recency_score"),
    descriptionPatternScore: real("description_pattern_score"),
    companyVerificationScore: real("company_verification_score"),
    socialPresenceScore: real("social_presence_score"),

    rawSignals: text("raw_signals", { mode: "json" }),

    gatheredAt: text("gathered_at").notNull().default("now"),
  },
  (table) => [
    index("idx_signals_tenant_job").on(table.tenantId, table.jobId),
  ]
);
```

### legitimacy_scores
Computed legitimacy scores with LLM analysis.

```typescript
export const legitimacyScores = sqliteTable(
  "legitimacy_scores",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    signalId: text("signal_id")
      .notNull()
      .references(() => legitimacySignals.id, { onDelete: "cascade" }),

    score: integer("score").notNull(), // 0-100
    confidence: text("confidence", {
      enum: ["high", "medium", "low"],
    }).notNull(),

    redFlags: text("red_flags", { mode: "json" }).notNull().default("[]"),
    llmAnalysis: text("llm_analysis"),

    analyzedAt: text("analyzed_at").notNull().default("now"),
  },
  (table) => [
    index("idx_legitimacy_tenant_job").on(table.tenantId, table.jobId),
  ]
);
```

---

## Index Strategy

All new tables follow the pattern:
- `tenantId` as leading column in composite indexes
- Foreign key indexes for cascade operations
- Status indexes for filtered queries

### Recommended Indexes
```sql
-- job_evaluations
CREATE INDEX idx_evaluations_tenant_job ON job_evaluations(tenant_id, job_id);
CREATE INDEX idx_evaluations_status ON job_evaluations(tenant_id, status);
CREATE INDEX idx_evaluations_user ON job_evaluations(tenant_id, user_id);

-- evaluation_blocks
CREATE INDEX idx_blocks_evaluation ON evaluation_blocks(evaluation_id);
CREATE INDEX idx_blocks_tenant_block ON evaluation_blocks(tenant_id, block);

-- stories
CREATE INDEX idx_stories_tenant ON stories(tenant_id);
CREATE INDEX idx_stories_user ON stories(tenant_id, user_id);

-- story_mappings
CREATE INDEX idx_mappings_tenant_evaluation ON story_mappings(tenant_id, evaluation_id);
CREATE INDEX idx_mappings_story ON story_mappings(story_id);

-- interview_prep_packs
CREATE INDEX idx_prep_tenant_job ON interview_prep_packs(tenant_id, job_id);
CREATE INDEX idx_prep_tenant_user ON interview_prep_packs(tenant_id, user_id);

-- writing_style_profiles
CREATE INDEX idx_style_tenant_user ON writing_style_profiles(tenant_id, user_id);

-- legitimacy_signals
CREATE INDEX idx_signals_tenant_job ON legitimacy_signals(tenant_id, job_id);

-- legitimacy_scores
CREATE INDEX idx_legitimacy_tenant_job ON legitimacy_scores(tenant_id, job_id);
```

---

## Migration Notes

1. **Drizzle Generate:** Run `npx drizzle-kit generate` after creating schema files
2. **Migration Order:** Create tables in dependency order (tenants → jobs → evaluations → blocks, etc.)
3. **Backward Compatibility:** All new tables are additive, no existing schema changes
4. **Rollback:** Each migration should have a rollback script
5. **Testing:** Test migrations on clean database before applying to production
