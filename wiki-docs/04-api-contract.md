# API Contract Specification

## Base URL
```
/api
```

## Authentication
All endpoints require JWT Bearer token:
```
Authorization: Bearer <token>
```

## Response Envelope
All responses follow the standard envelope:
```json
{
  "ok": true,
  "data": { ... },
  "meta": { "requestId": "req_abc123" }
}
```

Error responses:
```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request body",
    "details": { ... }
  },
  "meta": { "requestId": "req_abc123" }
}
```

## Error Codes
| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request body or parameters |
| `UNAUTHORIZED` | 401 | Missing or invalid authentication |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource already exists |
| `UNPROCESSABLE_ENTITY` | 422 | Business logic error |
| `INTERNAL_ERROR` | 500 | Server error |
| `UPSTREAM_ERROR` | 502 | External service error |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily unavailable |

---

## A-G Evaluation Endpoints

### POST /api/jobs/:jobId/evaluations
Initiate a new A-G evaluation for a job.

**Request Body:**
```json
{
  "blocks": ["A", "B", "C", "D", "E", "F", "G"],
  "profileId": "profile_123",
  "options": {
    "cachePolicy": "prefer_cache",
    "modelPreference": "balanced",
    "timeoutMinutes": 10
  }
}
```

**Response (201 Created):**
```json
{
  "ok": true,
  "data": {
    "evaluationId": "eval_abc123",
    "jobId": "job_456",
    "status": "processing",
    "blocksRequested": ["A", "B", "C", "D", "E", "F", "G"],
    "blocksCompleted": [],
    "estimatedDurationSec": 45,
    "progressStreamUrl": "/api/jobs/job_456/evaluations/eval_abc123/progress"
  }
}
```

### GET /api/jobs/:jobId/evaluations/:evaluationId
Get evaluation results.

**Response (200 OK):**
```json
{
  "ok": true,
  "data": {
    "evaluationId": "eval_abc123",
    "jobId": "job_456",
    "status": "completed",
    "blocks": {
      "A": {
        "completed": true,
        "data": {
          "roleSummary": "Senior Software Engineer...",
          "idealCandidate": {
            "skills": ["React", "TypeScript", "Node.js"],
            "experience": ["5+ years", "team lead"],
            "traits": ["self-starter", "collaborative"]
          },
          "score": 85
        }
      },
      "B": { "completed": true, "data": { ... } },
      "C": { "completed": true, "data": { ... } },
      "D": { "completed": true, "data": { ... } },
      "E": { "completed": false, "data": null },
      "F": { "completed": false, "data": null },
      "G": { "completed": true, "data": { ... } }
    },
    "cost": {
      "totalTokensIn": 12500,
      "totalTokensOut": 3200,
      "estimatedCostUsd": 0.08
    },
    "startedAt": "2025-01-15T10:30:00Z",
    "completedAt": "2025-01-15T10:31:15Z"
  }
}
```

### POST /api/jobs/:jobId/evaluations/:evaluationId/blocks/:block
Run a single evaluation block.

**Path Parameters:**
- `block`: One of `A`, `B`, `C`, `D`, `E`, `F`, `G`

**Query Parameters:**
- `sync`: boolean (default: false) — Run synchronously with timeout
- `timeoutMs`: number (default: 5000) — Timeout for sync mode

**Response (200 OK):**
```json
{
  "ok": true,
  "data": {
    "block": "G",
    "completed": true,
    "data": {
      "legitimacyScore": 72,
      "redFlags": ["Generic job description", "No company benefits listed"],
      "confidence": "medium",
      "signals": {
        "postingAge": 45,
        "recencyScore": 0.6,
        "descriptionPatternScore": 0.7
      }
    }
  }
}
```

### GET /api/jobs/:jobId/evaluations/:evaluationId/progress
SSE stream of block completion events.

**Response Headers:**
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**Event Format:**
```
event: block-complete
data: {"block":"A","completed":true,"durationMs":8500}

event: block-complete
data: {"block":"B","completed":true,"durationMs":12000}

event: evaluation-complete
data: {"status":"completed","totalDurationMs":45000}
```

### GET /api/jobs/:jobId/evaluations/latest
Get the latest evaluation for a job.

**Response:** Same as GET /api/jobs/:jobId/evaluations/:evaluationId

---

## Story Bank Endpoints

### GET /api/stories
List all stories for the current tenant.

**Query Parameters:**
- `page`: number (default: 1)
- `limit`: number (default: 20)
- `search`: string (optional) — Search by title, content, or tags
- `tags`: string[] (optional) — Filter by tags
- `skills`: string[] (optional) — Filter by skills

**Response (200 OK):**
```json
{
  "ok": true,
  "data": {
    "stories": [
      {
        "id": "story_abc123",
        "title": "Led Migration to Microservices",
        "content": "When I joined Company X, the monolith was...",
        "tags": ["leadership", "architecture", "microservices"],
        "skills": ["system-design", "team-management", "kubernetes"],
        "version": 3,
        "createdAt": "2025-01-10T08:00:00Z",
        "updatedAt": "2025-01-12T14:30:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 45,
      "totalPages": 3
    }
  }
}
```

### POST /api/stories
Create a new story.

**Request Body:**
```json
{
  "title": "Led Migration to Microservices",
  "content": "When I joined Company X, the monolith was...",
  "tags": ["leadership", "architecture", "microservices"],
  "skills": ["system-design", "team-management", "kubernetes"]
}
```

**Response (201 Created):**
```json
{
  "ok": true,
  "data": {
    "id": "story_abc123",
    "title": "Led Migration to Microservices",
    "content": "When I joined Company X, the monolith was...",
    "tags": ["leadership", "architecture", "microservices"],
    "skills": ["system-design", "team-management", "kubernetes"],
    "version": 1,
    "createdAt": "2025-01-15T10:30:00Z",
    "updatedAt": "2025-01-15T10:30:00Z"
  }
}
```

### PUT /api/stories/:id
Update a story (creates new version).

**Request Body:** Same as POST

**Response (200 OK):** Same as POST with incremented version

### DELETE /api/stories/:id
Delete a story.

**Response (200 OK):**
```json
{
  "ok": true,
  "data": { "deleted": true }
}
```

### GET /api/stories/search
Search stories by content, tags, or skills.

**Query Parameters:**
- `q`: string (required) — Search query
- `tags`: string[] (optional)
- `skills`: string[] (optional)
- `limit`: number (default: 10)

**Response (200 OK):**
```json
{
  "ok": true,
  "data": {
    "stories": [
      {
        "id": "story_abc123",
        "title": "Led Migration to Microservices",
        "relevanceScore": 0.92,
        "matchedContent": "...the monolith was struggling with scale..."
      }
    ]
  }
}
```

---

## Interview Prep Endpoints

### POST /api/interview-prep
Generate an interview preparation pack.

**Request Body:**
```json
{
  "jobId": "job_456",
  "companyId": "company_789",
  "audience": "hiring-manager",
  "includeCompanyIntel": true,
  "storyIds": ["story_abc123", "story_def456"]
}
```

**Response (201 Created):**
```json
{
  "ok": true,
  "data": {
    "packId": "pack_abc123",
    "jobId": "job_456",
    "audience": "hiring-manager",
    "status": "generating",
    "estimatedDurationSec": 30
  }
}
```

### GET /api/interview-prep/:packId
Get a generated interview prep pack.

**Response (200 OK):**
```json
{
  "ok": true,
  "data": {
    "packId": "pack_abc123",
    "jobId": "job_456",
    "audience": "hiring-manager",
    "status": "completed",
    "companyIntel": {
      "companyName": "Acme Corp",
      "recentNews": ["Raised $50M Series C", "Launched new product"],
      "cultureNotes": ["Fast-paced", "Remote-first"],
      "interviewProcess": ["HR screen", "Technical round", "Culture fit"]
    },
    "questions": [
      {
        "category": "technical",
        "question": "How would you design a microservices architecture for our platform?",
        "suggestedApproach": "Start with domain boundaries...",
        "relevantStories": ["story_abc123"]
      }
    ],
    "talkingPoints": [
      "Emphasize experience with scaling systems",
      "Highlight team leadership background"
    ],
    "generatedAt": "2025-01-15T10:31:00Z"
  }
}
```

---

## Writing Style Endpoints

### POST /api/writing-style/calibrate
Calibrate writing style from samples.

**Request Body:**
```json
{
  "samples": [
    {
      "content": "I led the migration to microservices...",
      "context": "cover-letter"
    },
    {
      "content": "The system needed a complete overhaul...",
      "context": "technical-documentation"
    }
  ]
}
```

**Response (201 Created):**
```json
{
  "ok": true,
  "data": {
    "profileId": "style_abc123",
    "status": "calibrating",
    "estimatedDurationSec": 15
  }
}
```

### GET /api/writing-style/profile
Get the current writing style profile.

**Response (200 OK):**
```json
{
  "ok": true,
  "data": {
    "profileId": "style_abc123",
    "tone": "professional-but-approachable",
    "sentenceLength": "medium",
    "vocabulary": "technical-with-explanations",
    "structure": "problem-solution-result",
    "personalityTraits": ["confident", "collaborative", "detail-oriented"],
    "calibratedAt": "2025-01-15T10:30:00Z"
  }
}
```

---

## Legitimacy Endpoints

### GET /api/jobs/:jobId/legitimacy
Get legitimacy score for a job.

**Response (200 OK):**
```json
{
  "ok": true,
  "data": {
    "jobId": "job_456",
    "score": 72,
    "confidence": "medium",
    "redFlags": [
      "Generic job description",
      "No company benefits listed",
      "Salary range not provided"
    ],
    "signals": {
      "postingAge": 45,
      "recencyScore": 0.6,
      "descriptionPatternScore": 0.7,
      "companyVerificationScore": 0.8,
      "socialPresenceScore": 0.9
    },
    "analyzedAt": "2025-01-15T10:30:00Z"
  }
}
```

---

## Existing Endpoints (Unchanged)

All existing Express API routes remain unchanged:
- `/api/auth/*` — Authentication
- `/api/jobs/*` — Job CRUD, tailoring, emails
- `/api/pipeline/*` — Pipeline management
- `/api/settings/*` — User settings
- `/api/profile/*` — User profile
- `/api/ghostwriter/*` — Ghostwriter service
- `/api/design-resume/*` — Resume design
- `/api/visa-sponsors/*` — Visa sponsor matching
- `/api/watchlist/*` — Watchlist management
- `/api/stats-proxy/*` — Statistics
- `/api/extractor-health/*` — Extractor monitoring
- `/api/demo-mode/*` — Demo mode
- `/api/backup/*` — Backup management
- `/api/database/*` — Database operations
- `/api/manual-jobs/*` — Manual job entry
- `/api/onboarding/*` — Onboarding flow
- `/api/tracer-links/*` — Tracer link management
- `/api/workspaces/*` — Workspace management
- `/api/post-application-providers/*` — Post-application providers
- `/api/post-application-review/*` — Post-application review
- `/api/tenant-isolation/*` — Tenant isolation testing
