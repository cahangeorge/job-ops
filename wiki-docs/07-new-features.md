# New Feature Specifications

## Overview

This document specifies the new features being added to job-ops, ported from career-ops' intellectual assets. These features enhance job evaluation, interview preparation, and application quality.

---

## 1. A-G Evaluation Framework

### Description
A comprehensive 7-block evaluation system that analyzes job postings from multiple angles. Each block is an independent LLM call, allowing selective execution, partial results, and per-block caching.

### Block Descriptions

#### Block A: Role Summary & Score
**Purpose:** Summarize the role and provide an initial relevance score.

**Input:**
- Job description
- Job metadata (title, company, location)

**Output:**
```json
{
  "roleSummary": "Senior Software Engineer role at Acme Corp...",
  "idealCandidate": {
    "skills": ["React", "TypeScript", "Node.js"],
    "experience": ["5+ years", "team lead experience"],
    "traits": ["self-starter", "collaborative", "detail-oriented"]
  },
  "score": 85
}
```

**Caching:** Cacheable by job (same job → same output)
**TTL:** 24 hours
**Estimated Cost:** ~$0.01

#### Block B: Candidate Fit Analysis
**Purpose:** Analyze how well the candidate's profile matches the role.

**Input:**
- Job description
- User profile (skills, experience, education)
- Block A output (role summary)

**Output:**
```json
{
  "skillsMatch": {
    "matched": ["React", "TypeScript"],
    "missing": ["Kubernetes"],
    "score": 0.85
  },
  "experienceMatch": {
    "relevantYears": 6,
    "gapAnalysis": "Strong match for seniority level"
  },
  "overallFit": 0.78
}
```

**Caching:** Profile-dependent (not cacheable across users)
**Estimated Cost:** ~$0.02

#### Block C: Level & Positioning Strategy
**Purpose:** Assess appropriate seniority level and positioning strategy.

**Input:**
- Job description
- User profile
- Block B output (fit analysis)

**Output:**
```json
{
  "assessedLevel": "Senior",
  "recommendedPositioning": "Position as a senior engineer with team lead aspirations",
  "seniorityScore": 8.5,
  "positioningStrategy": "Emphasize leadership experience and technical depth"
}
```

**Caching:** Profile-dependent
**Estimated Cost:** ~$0.02

#### Block D: Compensation Benchmarking
**Purpose:** Research market compensation for the role.

**Input:**
- Job title
- Location
- Seniority level
- Company size

**Output:**
```json
{
  "currency": "USD",
  "marketRate": {
    "low": 120000,
    "high": 180000,
    "median": 150000
  },
  "dataFreshness": "2025-01",
  "sources": ["Glassdoor", "Levels.fyi", "LinkedIn Salary"]
}
```

**Caching:** Cacheable by (title, location, seniority)
**TTL:** 24 hours
**Estimated Cost:** ~$0.01

#### Block E: Application Customization Plan
**Purpose:** Create a tailored application strategy.

**Input:**
- Job description
- User profile
- Writing style profile
- Block A-D outputs

**Output:**
```json
{
  "headline": "Senior Software Engineer | React & TypeScript Expert",
  "summaryRewrite": "Rewritten summary emphasizing relevant experience...",
  "skillsReorder": ["React", "TypeScript", "Node.js", "GraphQL"],
  "projectSelection": ["project_abc", "project_def"],
  "rationale": "Prioritize React experience due to job requirements..."
}
```

**Caching:** Profile-dependent
**Estimated Cost:** ~$0.03

#### Block F: Interview Preparation (STAR+R)
**Purpose:** Map user stories to job requirements using STAR+R format.

**Input:**
- Job description
- Story bank (user's STAR+R stories)
- Block A output (ideal candidate profile)

**Output:**
```json
{
  "mappedStories": [
    {
      "jobRequirement": "Experience leading technical projects",
      "storyId": "story_abc123",
      "starPlusR": {
        "situation": "Company needed to migrate from monolith...",
        "task": "Lead a team of 5 engineers...",
        "action": "Designed migration plan, implemented core services...",
        "result": "Reduced deployment time by 80%, improved reliability...",
        "reflection": "Learned importance of incremental migration..."
      },
      "relevanceScore": 0.92
    }
  ]
}
```

**Caching:** Profile-dependent
**Estimated Cost:** ~$0.04 (most expensive block)

#### Block G: Posting Legitimacy Check
**Purpose:** Analyze whether the job posting is legitimate.

**Input:**
- Job description
- Company information
- Posting metadata

**Output:**
```json
{
  "legitimacyScore": 72,
  "confidence": "medium",
  "redFlags": [
    "Generic job description",
    "No company benefits listed"
  ],
  "signals": {
    "postingAge": 45,
    "recencyScore": 0.6,
    "descriptionPatternScore": 0.7
  }
}
```

**Caching:** Partially cacheable (company + description hash)
**TTL:** 6 hours
**Estimated Cost:** ~$0.01

### Total Cost Estimate
- **Full A-G evaluation:** ~$0.14
- **With caching (A, D, G):** ~$0.10
- **Selective (B, C only):** ~$0.04

### API Endpoints
- `POST /api/jobs/:id/evaluations` — Initiate evaluation
- `GET /api/jobs/:id/evaluations/:evalId` — Get results
- `POST /api/jobs/:id/evaluations/:evalId/blocks/:block` — Run single block
- `GET /api/jobs/:id/evaluations/:evalId/progress` — SSE progress stream
- `GET /api/jobs/:id/evaluations/latest` — Latest evaluation

### Frontend Components
- `EvaluationDashboard` — Main evaluation UI
- `BlockResultCard` — Individual block display
- `EvaluationProgress` — Real-time progress tracking
- `EvaluationCostTracker` — Cost display

---

## 2. Story Bank

### Description
A versioned collection of STAR+R stories that can be reused across job applications. Stories are automatically extracted from evaluation completions and can be manually created/edited.

### Story Structure
```json
{
  "id": "story_abc123",
  "title": "Led Migration to Microservices",
  "content": "When I joined Company X, the monolith was...",
  "tags": ["leadership", "architecture", "microservices"],
  "skills": ["system-design", "team-management", "kubernetes"],
  "situation": "Company needed to scale...",
  "task": "Lead migration team...",
  "action": "Designed architecture, implemented core services...",
  "result": "80% faster deployments, 99.9% uptime...",
  "reflection": "Learned importance of incremental approach...",
  "version": 3,
  "createdAt": "2025-01-10T08:00:00Z",
  "updatedAt": "2025-01-12T14:30:00Z"
}
```

### Features
1. **CRUD Operations:** Create, read, update, delete stories
2. **Versioned History:** Each update creates a new version
3. **Search:** Full-text search across title, content, tags, skills
4. **Auto-Extraction:** Automatically extract stories from evaluation completions
5. **Tagging:** Tag stories by skill, industry, role type
6. **Mapping:** Map stories to job requirements (Block F)

### API Endpoints
- `GET /api/stories` — List stories
- `POST /api/stories` — Create story
- `PUT /api/stories/:id` — Update story (creates new version)
- `DELETE /api/stories/:id` — Delete story
- `GET /api/stories/search` — Search stories

### Frontend Components
- `StoryBankView` — Story list with search/filter
- `StoryEditor` — Create/edit stories
- `StoryVersionHistory` — View previous versions
- `StoryMapping` — Map stories to job requirements

---

## 3. Interview Preparation Packs

### Description
Audience-segmented interview preparation packages that combine company intelligence, relevant questions, and talking points. Generated asynchronously with caching.

### Pack Structure
```json
{
  "packId": "pack_abc123",
  "jobId": "job_456",
  "audience": "hiring-manager",
  "status": "completed",
  "companyIntel": {
    "companyName": "Acme Corp",
    "recentNews": ["Raised $50M Series C"],
    "cultureNotes": ["Fast-paced", "Remote-first"],
    "interviewProcess": ["HR screen", "Technical round", "Culture fit"]
  },
  "questions": [
    {
      "category": "technical",
      "question": "How would you design a microservices architecture?",
      "suggestedApproach": "Start with domain boundaries...",
      "relevantStories": ["story_abc123"]
    }
  ],
  "talkingPoints": [
    "Emphasize experience with scaling systems"
  ],
  "generatedAt": "2025-01-15T10:31:00Z"
}
```

### Audience Segments
1. **Recruiter:** Focus on cultural fit, career progression, compensation
2. **Hiring Manager:** Focus on technical skills, leadership, problem-solving
3. **Peer:** Focus on collaboration, technical depth, teamwork
4. **General:** Balanced mix of all aspects

### Features
1. **Company Intelligence:** Gathered from Glassdoor, LinkedIn, news
2. **Question Generation:** Role-specific interview questions
3. **Story Mapping:** Link relevant stories to each question
4. **Talking Points:** Key messages to emphasize
5. **Caching:** Generated packs cached per job + audience

### API Endpoints
- `POST /api/interview-prep` — Generate pack
- `GET /api/interview-prep/:id` — Get pack

### Frontend Components
- `InterviewPrepView` — Display generated pack
- `InterviewPrepGenerator` — Generate new pack
- `CompanyIntelDisplay` — Show company intelligence
- `QuestionList` — Display questions with stories

---

## 4. Writing Style Calibration

### Description
Analyzes user's writing samples to extract their unique voice, tone, and style. Applied to generated content (cover letters, summaries, emails) for authenticity.

### Style Profile Structure
```json
{
  "profileId": "style_abc123",
  "tone": "professional-but-approachable",
  "sentenceLength": "medium",
  "vocabulary": "technical-with-explanations",
  "structure": "problem-solution-result",
  "personalityTraits": ["confident", "collaborative", "detail-oriented"],
  "calibratedAt": "2025-01-15T10:30:00Z"
}
```

### Features
1. **Sample Upload:** Users provide writing samples
2. **Style Analysis:** LLM analyzes tone, structure, vocabulary
3. **Profile Storage:** Calibrated profile stored per user
4. **Content Application:** Style applied to generated content
5. **Calibration Updates:** Re-calibrate with new samples

### API Endpoints
- `POST /api/writing-style/calibrate` — Calibrate from samples
- `GET /api/writing-style/profile` — Get style profile

### Frontend Components
- `WritingStyleCalibrator` — Upload samples and calibrate
- `StylePreview` — Preview how style affects generated content
- `StyleProfileDisplay` — Show current style profile

---

## 5. Legitimacy Scoring

### Description
Analyzes job postings to detect potential scams, ghost jobs, or illegitimate postings. Uses signal gathering + LLM pattern analysis.

### Score Structure
```json
{
  "jobId": "job_456",
  "score": 72,
  "confidence": "medium",
  "redFlags": [
    "Generic job description",
    "No company benefits listed"
  ],
  "signals": {
    "postingAge": 45,
    "recencyScore": 0.6,
    "descriptionPatternScore": 0.7,
    "companyVerificationScore": 0.8,
    "socialPresenceScore": 0.9
  }
}
```

### Signal Sources
1. **Posting Age:** How long the job has been posted
2. **Description Patterns:** Generic vs. specific language
3. **Company Verification:** Does the company exist?
4. **Social Presence:** Does the company have LinkedIn, Glassdoor?
5. **Benefits Analysis:** Are benefits listed?
6. **Salary Transparency:** Is salary range provided?

### Scoring Algorithm
- **0-30:** High risk (likely scam/ghost job)
- **31-60:** Medium risk (proceed with caution)
- **61-80:** Low risk (likely legitimate)
- **81-100:** Very low risk (verified legitimate)

### Features
1. **Signal Gathering:** Automated data collection
2. **LLM Analysis:** Pattern recognition for red flags
3. **Score Computation:** Weighted signal combination
4. **Confidence Assessment:** Based on signal quality
5. **Caching:** Cached per company + description hash

### API Endpoints
- `GET /api/jobs/:id/legitimacy` — Get legitimacy score

### Frontend Components
- `LegitimacyScoreCard` — Display score and confidence
- `RedFlagsList` — Show detected red flags
- `SignalBreakdown` — Display individual signals

---

## Integration Points

### With Existing Features
1. **Job Detail Page:** Add evaluation section, legitimacy score
2. **Pipeline:** Add evaluation step after scoring
3. **Ghostwriter:** Use writing style calibration
4. **Resume Design:** Use evaluation insights for tailoring
5. **Application Tracking:** Store evaluation results with applications

### Data Flow
```
Job Discovery → Pipeline Scoring → A-G Evaluation → Story Mapping → Interview Prep
                    ↓                    ↓                ↓              ↓
              Legitimacy Check    Writing Style     Story Bank    Company Intel
```

### Cost Optimization
1. **Selective Evaluation:** Users can run only needed blocks
2. **Caching:** Cache A, D, G blocks across evaluations
3. **Batch Processing:** Run multiple evaluations in parallel
4. **Model Selection:** Use cheaper models for less critical blocks
5. **Pre-computation:** Gather signals before LLM calls

---

## Success Metrics

1. **Evaluation Completion Rate:** % of jobs that get full A-G evaluation
2. **Story Bank Growth:** Average stories per user
3. **Interview Prep Usage:** % of interviews with prep pack
4. **Legitimacy Accuracy:** % of correctly flagged illegitimate jobs
5. **Cost Per Evaluation:** Average cost per full evaluation
6. **User Satisfaction:** Feedback on evaluation quality
