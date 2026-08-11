# SICAPS — Database Schema

> **Reference:** [PRD.md](./PRD.md) | [TECHNICAL_SPEC.md](./TECHNICAL_SPEC.md) | [AI_BOT_SPEC.md](./phase-1/AI_BOT_SPEC.md)  
> **Database:** PostgreSQL (Supabase)  
> **ORM:** Prisma  
> **Last updated:** June 23, 2026

---

## 1. Overview

This document is the **single source of truth** for SICAPS database design. Covers schema definition, indexing strategy, RLS policies, data retention, and migration roadmap.

### 1.1 Conventions

| Layer          | Convention                               | Example              |
| -------------- | ---------------------------------------- | -------------------- |
| Prisma model   | PascalCase                               | `ScreeningSession`   |
| Prisma field   | camelCase                                | `totalScore`         |
| Prisma enum    | SCREAMING_SNAKE                          | `IN_PROGRESS`        |
| DB table name  | snake_case (via `@@map`)                 | `screening_session`  |
| DB column name | snake_case (via `@map`)                  | `total_score`        |
| Primary key    | UUID v4                                  | `@default(uuid())`   |
| Timestamps     | `createdAt` + `updatedAt` (if mutable)   | `DateTime`           |
| Soft delete    | `deletedAt` nullable timestamp           | Only on root entity  |

### 1.2 Design Principles

- **JSON (JSONB) for flexible data** — extraction, scores, and category arrays stored as JSONB. Research done via export, not direct SQL queries on nested data.
- **Soft delete on root entity only** — `deletedAt` only on `ScreeningSession`. Child records follow parent; hard purge uses `ON DELETE CASCADE`.
- **Derived data that is queried is stored** — `totalScore` and `riskLevel` stored for indexing/filtering. `chatTheme` derived at runtime from `educationLevel`.
- **Locale at session level, not demographics** — language affects entire session, not just respondent profile.
- **Permanent data for research** — no auto-expiry. Privacy handled via anonymity.

---

## 2. Entity Relationship Diagram

```mermaid
erDiagram
    %% === MVP ===
    ScreeningSession ||--|| Demographics : "has (1:1)"
    ScreeningSession ||--o{ ChatMessage : "has (1:many)"
    ScreeningSession ||--o{ TurnExtraction : "has (1:many, success only)"
    ScreeningSession ||--o{ TurnLog : "has (1:many, all turns)"
    ScreeningSession ||--o{ EvaluationFeedback : "has (1:many)"

    ScreeningSession {
        uuid id PK
        string locale
        enum status
        int totalScore
        enum riskLevel
        datetime deletedAt
    }

    Demographics {
        uuid id PK
        uuid sessionId FK
        string name
        int age
        string gender
        string educationLevel
    }

    ChatMessage {
        uuid id PK
        uuid sessionId FK
        string role
        string content
        boolean isVoice
    }

    TurnExtraction {
        uuid id PK
        uuid sessionId FK
        int turnNumber
        json extraction
        json scores
    }

    TurnLog {
        uuid id PK
        uuid sessionId FK
        int turnNumber
        string rawResponse
        enum parseStatus
        string model
        int latencyMs
    }

    EvaluationFeedback {
        uuid id PK
        uuid sessionId FK
        int turnNumber
        boolean isAccurate
        enum evaluatorType
    }

    %% === Phase 2 ===
    User ||--o{ ScreeningSession : "owns"
    User ||--o{ DoctorReview : "writes (as doctor)"
    User ||--o{ Respondent : "manages (as cadre)"
    Respondent ||--o{ ScreeningSession : "linked to"
    DoctorReview ||--|| ScreeningSession : "reviews"
    ScreeningImage }o--|| ScreeningSession : "attached to"

    User {
        uuid id PK
        string supabaseId UK
        enum role
        enum approvalStatus
    }

    DoctorReview {
        uuid id PK
        uuid sessionId FK
        uuid doctorId FK
        enum confirmedRiskLevel
    }

    Respondent {
        uuid id PK
        uuid cadreId FK
        string name
    }

    ScreeningImage {
        uuid id PK
        uuid sessionId FK
        string storagePath
        boolean analyzed
    }
```

---

## 3. Enums

```prisma
enum Role {
  ADMIN
  DOCTOR
  CADRE
  USER
  ANONYMOUS
}

enum ApprovalStatus {
  PENDING
  APPROVED
  REJECTED
}

enum RiskLevel {
  LOW
  MODERATE
  HIGH
}

enum Perception {
  UNDERESTIMATE
  OVERESTIMATE
  BARRIER
  ADEQUATE
}

enum ScreeningStatus {
  IN_PROGRESS
  COMPLETED
  REVIEWED
}

enum EvaluatorType {
  DEVELOPER
  DOCTOR
  RESEARCHER
}

enum ParseStatus {
  SUCCESS
  PARTIAL
  FAILURE
}

enum ReviewAction {
  REFER_CLINIC
  EDUCATE
  OTHER
}
```

**DB mapping:** Prisma enums stored as PostgreSQL native enum types.

---

## 4. MVP Tables

### 4.1 ScreeningSession

Root entity for each screening session. **This definition only covers MVP fields and relations.**


```prisma
model ScreeningSession {
  id                  String          @id @default(uuid()) @map("id")

  // Session config
  locale              String          @default("id") @map("locale") // "id" | "en"
  mode                String          @default("ai") @map("mode")   // "ai" | "questionnaire"
  status              ScreeningStatus @default(IN_PROGRESS) @map("status")
  source              String          @default("production") @map("source") // "production" | "testing" | "playground"

  // Adaptive flow state
  categoriesCovered   Json            @default("[]") @map("categories_covered")
  // Type: string[] — example: ["intensitas", "waktu", "lokasi_tubuh"]

  // Final scoring (derived, stored for indexing)
  scores              Json?           @map("scores")
  // Type: { intensitas: number, waktu: number, lokasi_tubuh: number, kontak: number, lesi: number, faktor_risiko: number }
  totalScore          Int?            @map("total_score")
  riskLevel           RiskLevel?      @map("risk_level")
  perception          Perception?     @map("perception")

  // AI Output (4 parts)
  aiConclusion        String?         @map("ai_conclusion")
  aiPerceptionResponse String?        @map("ai_perception_response")
  aiRecommendation    String?         @map("ai_recommendation")
  aiSuggestion        String?         @map("ai_suggestion")

  // Sharing
  shareToken          String?         @unique @default(uuid()) @map("share_token")

  // Versioning (audit trail)
  promptVersion       String          @default("v1") @map("prompt_version")
  scoringVersion      String          @default("v1") @map("scoring_version")

  // Timestamps & soft delete
  createdAt           DateTime        @default(now()) @map("created_at")
  completedAt         DateTime?       @map("completed_at")
  updatedAt           DateTime        @updatedAt @map("updated_at")
  deletedAt           DateTime?       @map("deleted_at")

  // Relations (MVP)
  messages            ChatMessage[]
  extractions         TurnExtraction[]
  turnLogs            TurnLog[]
  evaluationFeedbacks EvaluationFeedback[]
  demographics        Demographics?

  @@index([status, riskLevel], map: "idx_session_status_risk")
  @@index([shareToken], map: "idx_session_share_token")
  @@index([createdAt(sort: Desc)], map: "idx_session_created_desc")
  @@index([riskLevel, createdAt(sort: Desc)], map: "idx_session_risk_created")
  @@map("screening_session")
}
```

**Notes:**

- `mode` — `"ai"` (default, LLM available) or `"questionnaire"` (degraded, LLM unavailable). Updated when degradation occurs mid-session.
- `source` — `"production"` (from main feature) or `"testing"` (from testing console). Used for CSV export filtering. Default "production" so existing data is unaffected.
- `categoriesCovered` — real-time tracking of filled categories. Updated each turn.
- `scores` — JSON object of scores per category (rich format: {raw, capped, status}). Only filled when screening COMPLETED.
- `totalScore` + `riskLevel` — denormalized from `scores` for indexing/filtering.
- `promptVersion` — system prompt version used during this session. For audit trail.
- `scoringVersion` — scoring engine/pattern table version used. For research reproducibility.
- `deletedAt` — soft delete. NULL = active, timestamp = deleted.
- `chatTheme` **not stored** — always derived from `demographics.educationLevel`.

**Fields added in Phase 2 (see §5):**

- `userId` — FK to User (MVP always null / anonymous)
- `isIncognito` — incognito mode toggle
- Relations to `User`, `DoctorReview`, `ScreeningImage`

---

### 4.2 Demographics

Respondent demographic data. 1:1 relation with ScreeningSession.

```prisma
model Demographics {
  id              String            @id @default(uuid()) @map("id")
  sessionId       String            @unique @map("session_id")

  // Fields (from pre-chat form)
  name            String?           @map("name")
  age             Int               @map("age")
  gender          String            @map("gender")        // "male" | "female"
  educationLevel  String            @map("education_level")
  // Values: "elementary" | "junior_high" | "senior_high" | "university"

  createdAt       DateTime          @default(now()) @map("created_at")

  // Relations
  session         ScreeningSession  @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@map("demographics")
}
```

**Notes:**

- `educationLevel` determines AI language tone: `elementary` → playful (casual, emoji), others → hybrid (polite, minimal emoji). Visual UI remains same for all.
- `name` optional — user may leave blank.
- `gender` stored as string (not enum) for international flexibility.
- No `language` field — locale stored in `ScreeningSession.locale`.


---

### 4.3 ChatMessage

Full chat transcript. Each bubble (user or bot) = 1 row.

```prisma
model ChatMessage {
  id          String           @id @default(uuid()) @map("id")
  sessionId   String           @map("session_id")

  role        String           @map("role")    // "assistant" | "user"
  content     String           @map("content")
  isVoice     Boolean          @default(false) @map("is_voice")

  createdAt   DateTime         @default(now()) @map("created_at")

  // Relations
  session     ScreeningSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([sessionId, createdAt], map: "idx_message_session_time")
  @@map("chat_message")
}
```

**Notes:**

- `isVoice` — true if input came from STT (voice), useful for research comparing voice vs text.
- Max ~14 messages per session (7 turns × 2). Very small volume.
- Ordering: `createdAt ASC` to display chat sequentially.

---

### 4.4 TurnExtraction

Extraction data that is **schema-valid** — safe for scoring engine. Only created when LLM response passes full Zod schema validation (`parseStatus = SUCCESS`).

```prisma
model TurnExtraction {
  id          String           @id @default(uuid()) @map("id")
  sessionId   String           @map("session_id")
  turnNumber  Int              @map("turn_number")

  // Validated extraction output (JSONB) — guaranteed complete 6 categories
  extraction  Json             @map("extraction")
  // Type: {
  //   intensitas: [{ keyword: string, confidence: "high"|"medium"|"low" }],
  //   waktu: [...],
  //   lokasi_tubuh: [...],
  //   kontak: [...],
  //   lesi: [...],
  //   faktor_risiko: [...]
  // }

  // Backend matching scores (JSONB)
  scores      Json             @map("scores")
  // Type: { intensitas: CategoryScore, waktu: CategoryScore, ... }

  createdAt   DateTime         @default(now()) @map("created_at")

  // Relations
  session     ScreeningSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@unique([sessionId, turnNumber], map: "uq_extraction_session_turn")
  @@map("turn_extraction")
}
```

**Notes:**

- `@@unique([sessionId, turnNumber])` — prevents duplicate turns in 1 session.
- **Only created on parse SUCCESS** — scoring engine safe to read all records without defensive checks.
- `extraction` — guaranteed to have all 6 categories as arrays (may be empty but always present).
- `scores` — snapshot of scores per category from this turn (not cumulative).

---

### 4.5 TurnLog

Audit trail for **all turns** (success, partial, failure). Stores raw LLM response and metadata. For observability and prompt evaluation — NOT for scoring.

```prisma
model TurnLog {
  id            String           @id @default(uuid())
  sessionId     String           @map("session_id")
  turnNumber    Int              @map("turn_number")

  // User message that triggered this LLM call
  userMessage   String           @map("user_message")  @db.Text

  // Raw LLM response (full JSON string, regardless of validity)
  rawResponse   String           @map("raw_response")  @db.Text

  // Parse result
  parseStatus   ParseStatus      @map("parse_status")  // SUCCESS | PARTIAL | FAILURE
  parseError    String?          @map("parse_error")   // Error message if parse failed

  // System prompt used for this turn (stored for prompt version comparison)
  systemMessage String           @map("system_message") @db.Text

  // LLM call metadata
  model         String                                  // e.g., "llama-3.1-8b-instant"
  promptVersion String           @map("prompt_version") // e.g., "v1"
  latencyMs     Int              @map("latency_ms")
  tokenUsage    Json?            @map("token_usage")   // { input: number, output: number }
  retryCount    Int              @default(0) @map("retry_count")

  // Playground-specific metadata (null for production/testing turns)
  metadata      Json?            @map("metadata")
  // Type (when source='playground'): {
  //   source: "playground",
  //   provider: string,
  //   temperature: number,
  //   topP: number,
  //   maxTokens: number,
  //   customSystemPrompt: boolean,
  //   mode: "single-shot" | "multi-turn" | "compare"
  // }

  createdAt     DateTime         @default(now()) @map("created_at")

  // Relations
  session       ScreeningSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@unique([sessionId, turnNumber], map: "uq_turnlog_session_turn")
  @@index([parseStatus], map: "idx_turnlog_parse_status")
  @@index([model], map: "idx_turnlog_model")
  @@map("turn_logs")
}
```

**Notes:**

- **Always created** — every turn (success/partial/failure) has 1 TurnLog record.
- `userMessage` — user message that triggered this LLM call. Also stored here for easy export without JOIN to ChatMessage.
- `rawResponse` — full JSON string returned by LLM. May be invalid JSON on failure case.
- `parseStatus` — determines if this turn also has a `TurnExtraction` record (only SUCCESS).
- `parseError` — error message when parse failed (null if success).
- `systemMessage` — full system prompt used. Stored for comparing performance across prompt versions.
- `onDelete` — currently uses default Restrict (not Cascade). Will add Cascade in corrective migration.
- Scoring engine **NEVER reads** this table — only test page and export.
- **Planned indexes** (not yet migrated): `@@unique([sessionId, turnNumber])`, `@@index([parseStatus])`, `@@index([model])`. Will add when data volume increases.


---

### 4.6 EvaluationFeedback

Per-turn accuracy feedback from developer/doctor/researcher. For building gold dataset.

```prisma
model EvaluationFeedback {
  id            String        @id @default(uuid())
  sessionId     String        @map("session_id")
  turnNumber    Int           @map("turn_number")

  evaluatorType EvaluatorType @map("evaluator_type")  // required, no default
  isAccurate    Boolean       @map("is_accurate")
  notes         String?       @db.Text                // reason why not accurate
  promptVersion String        @map("prompt_version")  // prompt version at evaluation time

  createdAt     DateTime      @default(now()) @map("created_at")
  updatedAt     DateTime      @updatedAt @map("updated_at")

  // Relations
  session       ScreeningSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@unique([sessionId, turnNumber, evaluatorType])
  @@index([promptVersion], map: "idx_feedback_prompt_version")
  @@index([evaluatorType, isAccurate], map: "idx_feedback_evaluator_accuracy")
  @@map("evaluation_feedbacks")
}
```

**Notes:**

- `@@unique([sessionId, turnNumber, evaluatorType])` — one evaluator can only give 1 feedback per turn. Upsert to update.
- `evaluatorType` — **required with no default**. Caller must explicitly provide evaluator type.
- `updatedAt` — auto-updated when feedback is upserted.
- `promptVersion` — saved from session when feedback is given, for grouping in export.
- One turn can have multiple feedbacks (developer + doctor) — inter-rater agreement.
- `notes` — free text, optional. Useful for noting "should have extracted X but missed" or "hallucinated keyword Y".
- `onDelete` — currently uses default Restrict (not Cascade). Will add Cascade in corrective migration.
- **Planned indexes** (not yet migrated): `@@index([promptVersion])`, `@@index([evaluatorType, isAccurate])`. Will add when data volume increases.

---

## 5. Phase 2 Tables (Planned)

> **Status:** Not yet implemented. Definitions below are initial designs that may change when Phase 2 begins.

### 5.0 Alterations to ScreeningSession (Phase 2)

The following fields are added to `ScreeningSession` in Phase 2:

```prisma
// Additional fields in ScreeningSession (Phase 2)
  userId              String?         @map("user_id") // FK to User, null = anonymous
  isIncognito         Boolean         @default(false) @map("is_incognito")

// Additional relations
  user                User?           @relation(fields: [userId], references: [id])
  review              DoctorReview?
  images              ScreeningImage[]

// Additional index
  @@index([userId], map: "idx_session_user_id")
```

### 5.1 User

```prisma
model User {
  id              String         @id @default(uuid()) @map("id")
  supabaseId      String         @unique @map("supabase_id")
  email           String?        @unique @map("email")
  name            String?        @map("name")
  role            Role           @default(USER) @map("role")
  approvalStatus  ApprovalStatus @default(PENDING) @map("approval_status")

  createdAt       DateTime       @default(now()) @map("created_at")
  updatedAt       DateTime       @updatedAt @map("updated_at")
  deletedAt       DateTime?      @map("deleted_at")

  // Relations
  sessions        ScreeningSession[]
  reviews         DoctorReview[]
  respondents     Respondent[]

  @@index([role, approvalStatus], map: "idx_user_role_approval")
  @@map("user")
}
```

### 5.2 DoctorReview

```prisma
model DoctorReview {
  id                  String           @id @default(uuid()) @map("id")
  sessionId           String           @unique @map("session_id")
  doctorId            String           @map("doctor_id")

  confirmedRiskLevel  RiskLevel?       @map("confirmed_risk_level")
  action              ReviewAction?    @map("action")
  notes               String?          @map("notes")
  overrideSuggestion  String?          @map("override_suggestion")

  createdAt           DateTime         @default(now()) @map("created_at")

  // Relations
  session             ScreeningSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  doctor              User             @relation(fields: [doctorId], references: [id])

  @@index([doctorId], map: "idx_review_doctor")
  @@map("doctor_review")
}
```

### 5.3 Respondent

Santri/participant data managed by cadre.

```prisma
model Respondent {
  id              String    @id @default(uuid()) @map("id")
  cadreId         String    @map("cadre_id")

  name            String    @map("name")
  age             Int?      @map("age")
  gender          String?   @map("gender")
  notes           String?   @map("notes")

  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")
  deletedAt       DateTime? @map("deleted_at")

  // Relations
  cadre           User      @relation(fields: [cadreId], references: [id])
  sessions        ScreeningSession[]

  @@index([cadreId], map: "idx_respondent_cadre")
  @@map("respondent")
}
```


### 5.4 ScreeningImage

Skin photo upload for CV model analysis.

```prisma
model ScreeningImage {
  id              String           @id @default(uuid()) @map("id")
  sessionId       String           @map("session_id")

  storagePath     String           @map("storage_path")
  fileName        String           @map("file_name")
  mimeType        String           @map("mime_type")  // "image/jpeg" | "image/png" | "image/webp"
  fileSize        Int              @map("file_size")  // bytes

  // Analysis result
  analyzed        Boolean          @default(false) @map("analyzed")
  detectedLesions Boolean?         @map("detected_lesions")
  lesionTypes     Json?            @map("lesion_types")  // LesionType[]
  confidence      Float?           @map("confidence")    // 0-100
  conclusion      String?          @map("conclusion")    // "supports_scabies" | "does_not_support" | "inconclusive"
  rawResult       Json?            @map("raw_result")    // full model response

  consentGiven    Boolean          @default(false) @map("consent_given")
  createdAt       DateTime         @default(now()) @map("created_at")

  // Relations
  session         ScreeningSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([sessionId], map: "idx_image_session")
  @@map("screening_image")
}
```

### 5.5 CadreLocation (Planned — Phase 2)

Pondok location profile attached to cadre.

```prisma
model CadreLocation {
  id              String    @id @default(uuid()) @map("id")
  cadreId         String    @unique @map("cadre_id")

  provinceId      String    @map("province_id")
  provinceName    String    @map("province_name")
  regencyId       String    @map("regency_id")
  regencyName     String    @map("regency_name")
  districtId      String?   @map("district_id")
  districtName    String?   @map("district_name")
  villageId       String?   @map("village_id")
  villageName     String?   @map("village_name")

  institutionName String?   @map("institution_name")  // Pondok/institution name
  residenceDuration String? @map("residence_duration") // "<6mo" | "6-12mo" | "1-2yr" | ">2yr"
  roomOccupants   Int?      @map("room_occupants")

  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  // Relations
  cadre           User      @relation(fields: [cadreId], references: [id])

  @@map("cadre_location")
}
```

---

## 6. Indexing Strategy

### 6.1 MVP Indexes

| Table                  | Index                                       | Type          | Status      | Reason                                     |
| ---------------------- | ------------------------------------------- | ------------- | ----------- | ------------------------------------------ |
| `screening_session`    | `(status, risk_level)`                      | btree         | ✅ Migrated | Doctor queue filtering                     |
| `screening_session`    | `(share_token)`                             | btree, unique | ✅ Migrated | Public result lookup                       |
| `screening_session`    | `(created_at DESC)`                         | btree         | ✅ Migrated | Recent sorting                             |
| `screening_session`    | `(risk_level, created_at DESC)`             | btree         | ✅ Migrated | Doctor queue: "score ≥ MODERATE, recent"   |
| `chat_message`         | `(session_id, created_at)`                  | btree         | ✅ Migrated | Sequential transcript                      |
| `turn_extraction`      | `(session_id, turn_number)`                 | btree, unique | ✅ Migrated | Prevent duplicate + lookup                 |
| `turn_logs`            | `(session_id, turn_number)`                 | btree, unique | ✅ Migrated | Prevent duplicate + lookup                 |
| `turn_logs`            | `(parse_status)`                            | btree         | ✅ Migrated | Filter by parse result                     |
| `turn_logs`            | `(model)`                                   | btree         | ✅ Migrated | Filter by LLM model                        |
| `evaluation_feedbacks` | `(session_id, turn_number, evaluator_type)` | btree, unique | ✅ Migrated | Prevent duplicate per evaluator            |
| `evaluation_feedbacks` | `(prompt_version)`                          | btree         | ✅ Migrated | Group by prompt version for comparison     |
| `evaluation_feedbacks` | `(evaluator_type, is_accurate)`             | btree         | ✅ Migrated | Accuracy stats per evaluator               |
| `demographics`         | `(session_id)`                              | btree, unique | ✅ Migrated | 1:1 lookup (implicit from `@unique`)       |

### 6.2 Phase 2 Indexes

| Table               | Index                     | Reason                                        |
| ------------------- | ------------------------- | --------------------------------------------- |
| `screening_session` | `(user_id)`               | FK lookup (nullable in MVP, populated Phase 2)|
| `user`              | `(role, approval_status)` | Filter pending approvals                      |
| `doctor_review`     | `(doctor_id)`             | List reviews per doctor                       |
| `respondent`        | `(cadre_id)`              | List respondents per cadre                    |
| `screening_image`   | `(session_id)`            | Images per session                            |

### 6.3 Indexes Intentionally NOT Added

| Field                      | Reason                                          |
| -------------------------- | ----------------------------------------------- |
| `demographics.age`         | Small volume, full scan fast enough             |
| `demographics.gender`      | Low cardinality (2 values), index not effective |
| `chat_message.content`     | No chat search feature                          |
| `screening_session.locale` | Only 2 values, rarely filtered alone            |


---

## 7. Row Level Security (RLS) Policies

### 7.1 Principles

- MVP: all scoring/chat operations go through **API routes (service role)**. Client only has direct-access for minimal operations.
- Phase 2: add per-role policies.

### 7.2 MVP Policies

```sql
-- ==================== screening_session ====================

-- Anyone can start a screening (INSERT via anon key)
CREATE POLICY "anon_insert_session"
  ON screening_session FOR INSERT
  TO anon
  WITH CHECK (true);

-- Public can view result via shareToken
CREATE POLICY "public_view_by_token"
  ON screening_session FOR SELECT
  TO anon
  USING (share_token = current_setting('request.headers')::json->>'x-share-token');

-- Service role full access (API routes)
CREATE POLICY "service_full_access"
  ON screening_session FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ==================== demographics ====================

-- Anyone can insert demographics (paired with session start)
CREATE POLICY "anon_insert_demographics"
  ON demographics FOR INSERT
  TO anon
  WITH CHECK (true);

-- Only service role can read
CREATE POLICY "service_read_demographics"
  ON demographics FOR SELECT
  TO service_role
  USING (true);

-- ==================== chat_message ====================

-- Service role only (all operations go through API)
CREATE POLICY "service_only_messages"
  ON chat_message FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ==================== turn_extraction ====================

-- Service role only
CREATE POLICY "service_only_extraction"
  ON turn_extraction FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ==================== turn_log ====================

-- Service role only (observability data)
CREATE POLICY "service_only_turn_log"
  ON turn_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ==================== evaluation_feedback ====================

-- Service role only (feedback submitted via internal API)
CREATE POLICY "service_only_feedback"
  ON evaluation_feedback FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

### 7.3 Phase 2 Policies (Planned)

| Table               | Role               | Access                                                                   |
| ------------------- | ------------------ | ------------------------------------------------------------------------ |
| `screening_session` | Authenticated user | SELECT own sessions (`user_id = auth.uid()`)                             |
| `screening_session` | Doctor (approved)  | SELECT sessions with `risk_level >= MODERATE` AND `is_incognito = false` |
| `screening_session` | Cadre (approved)   | SELECT sessions linked to own respondents                                |
| `screening_session` | Admin              | SELECT all                                                               |
| `doctor_review`     | Doctor             | INSERT/UPDATE own reviews                                                |
| `respondent`        | Cadre              | CRUD own respondents (`cadre_id = auth.uid()`)                           |
| `screening_image`   | Doctor             | SELECT images for sessions in review queue                               |

---

## 8. Data Retention & Privacy

### 8.1 Retention Policy

| Data                     | Retention                  | Reason                                   |
| ------------------------ | -------------------------- | ---------------------------------------- |
| Anonymous session        | Permanent                  | Research data — core of the study        |
| Logged-in user session   | Permanent                  | User can request soft delete via account |
| Incognito session        | Permanent (without `user_id`) | Research, but not in account history  |
| Chat messages            | Follows parent session     | Cascade soft/hard delete                 |
| TurnExtraction           | Follows parent session     | Research audit trail                     |
| Shareable link           | No expiration              | As long as session exists, link active   |
| Uploaded images (Phase 2)| Permanent                  | User can request deletion                |

### 8.2 Privacy by Design

- **MVP fully anonymous** — no strong identity fields (email, phone). `name` optional and can be anything.
- **No IP logging** at application level.
- **Medical data** handled as research data, not formal medical records (not bound to RM/rekam medis).
- **Consent** — for image upload (Phase 2), consent popup required before upload.
- **Right to delete** — user can request data deletion via soft delete. Hard purge scheduled periodically by admin.

### 8.3 Soft Delete Implementation

```typescript
// Prisma middleware for automatic filtering
prisma.$use(async (params, next) => {
  // Automatically filter soft-deleted sessions
  if (params.model === 'ScreeningSession') {
    if (params.action === 'findMany' || params.action === 'findFirst') {
      params.args.where = {
        ...params.args.where,
        deletedAt: null,
      };
    }
  }
  return next(params);
});

// Soft delete operation
async function softDeleteSession(sessionId: string) {
  return prisma.screeningSession.update({
    where: { id: sessionId },
    data: { deletedAt: new Date() },
  });
}

// Hard purge (admin scheduled job)
async function purgeDeletedSessions(olderThanDays: number = 30) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);

  // CASCADE will delete children automatically
  return prisma.screeningSession.deleteMany({
    where: {
      deletedAt: { not: null, lt: cutoff },
    },
  });
}
```


---

## 9. JSON Field Schemas

Documentation of JSONB field structures for consistency.

### 9.1 `ScreeningSession.categoriesCovered`

```typescript
type CategoriesCovered = string[];
// Example: ["intensitas", "waktu", "lokasi_tubuh"]
// Valid values: "intensitas" | "waktu" | "lokasi_tubuh" | "kontak" | "lesi" | "faktor_risiko"
```

### 9.2 `ScreeningSession.scores`

```typescript
interface CategoryScore {
  raw: number; // before floor (can be negative if negative keyword)
  capped: number; // after floor 0
  status: 'assessed' | 'not_assessed'; // not_assessed = category not asked yet (force-close)
}

interface Scores {
  intensitas: CategoryScore;
  waktu: CategoryScore;
  lokasi_tubuh: CategoryScore;
  kontak: CategoryScore;
  lesi: CategoryScore;
  faktor_risiko: CategoryScore;
}

// Example:
// {
//   "intensitas": { "raw": 2, "capped": 2, "status": "assessed" },
//   "waktu": { "raw": 2, "capped": 2, "status": "assessed" },
//   "lokasi_tubuh": { "raw": 2, "capped": 2, "status": "assessed" },
//   "kontak": { "raw": -2, "capped": 0, "status": "assessed" },
//   "lesi": { "raw": 0, "capped": 0, "status": "not_assessed" },
//   "faktor_risiko": { "raw": 4, "capped": 4, "status": "assessed" }
// }
```

> **Note:** API response returns flat numbers (only `capped` values) for frontend simplicity. This rich format is only persisted in database for audit trail and research.

### 9.3 `TurnExtraction.extraction`

```typescript
interface Extraction {
  intensitas: ExtractedKeyword[];
  waktu: ExtractedKeyword[];
  lokasi_tubuh: ExtractedKeyword[];
  kontak: ExtractedKeyword[];
  lesi: ExtractedKeyword[];
  faktor_risiko: ExtractedKeyword[];
}

interface ExtractedKeyword {
  keyword: string;
  confidence: 'high' | 'medium' | 'low';
}

// Example:
// {
//   "intensitas": [{ "keyword": "gatal hebat", "confidence": "high" }],
//   "waktu": [{ "keyword": "malam hari", "confidence": "medium" }],
//   "lokasi_tubuh": [],
//   "kontak": [{ "keyword": "teman sekamar", "confidence": "low" }],
//   "lesi": [],
//   "faktor_risiko": []
// }
```

### 9.4 `TurnExtraction.scores`

```typescript
interface TurnScores {
  intensitas: CategoryScore;
  waktu: CategoryScore;
  lokasi_tubuh: CategoryScore;
  kontak: CategoryScore;
  lesi: CategoryScore;
  faktor_risiko: CategoryScore;
}
// Rich format per turn — includes raw, capped, status, matchedPatterns.
// Backend sums all capped scores to get final total.
```

### 9.5 `TurnLog.tokensUsed`

```typescript
interface TokensUsed {
  input: number; // prompt tokens
  output: number; // completion tokens
}
// Null if provider doesn't return usage data.
```

### 9.6 `TurnLog.rawResponse`

```typescript
// String — full JSON returned by LLM (may be invalid JSON on failure case)
// Example (success):
// '{"reply":"Terima kasih...","extraction":{"intensitas":[...],...},"categories_covered":[...],...}'
// Example (partial):
// '{"reply":"Baik, saya mengerti..."}'
// Example (failure):
// 'Sorry, I cannot help with that. <invalid>'
```

---

## 10. Migration Roadmap

### 10.1 MVP (Phase 1)

```bash
# Initial migration — create all MVP tables
npx prisma migrate dev --name init_mvp

# Tables created:
# - screening_session
# - demographics
# - chat_message
# - turn_extraction

# Observability tables (llm-hardening spec)
npx prisma migrate dev --name add_observability

# Tables created:
# - turn_log
# - evaluation_feedback
# Enums added:
# - EvaluatorType (DEVELOPER, DOCTOR, RESEARCHER)
# - ParseStatus (SUCCESS, PARTIAL, FAILURE)
```

**Seeding:** Not required. Data created organically from screening sessions.

### 10.2 Phase 2 — Auth & Roles

```bash
npx prisma migrate dev --name add_auth_roles

# Tables created:
# - user
# - doctor_review
# - respondent
# - cadre_location
# - screening_image

# Alterations:
# - screening_session: user_id FK → user.id (nullable, existing rows stay null)
# - screening_session: add respondent_id FK (nullable)
```

**Data migration:** All MVP sessions remain anonymous (`user_id = null`). No data migration needed.

### 10.3 Phase 3 — Enhancement

```bash
npx prisma migrate dev --name add_analytics

# Possible additions:
# - Materialized views for statistics
# - Normalized keyword table (if JSONB query becomes bottleneck)
# - Notification queue table
```


---

## 11. Supabase Storage (Non-DB)

For files stored in Supabase Storage (not PostgreSQL):

| Bucket             | Access        | Content         | Phase   |
| ------------------ | ------------- | --------------- | ------- |
| `screening-images` | Private (RLS) | User skin photos| Phase 2 |

**Path format:** `{sessionId}/{timestamp}-{index}.{ext}`  
**Constraint:** Max 5 files/session, max 10MB/file, formats JPEG/PNG/WebP.

---

## 12. Useful JSONB Queries (Reference)

Although primary research is via export, here are example queries that can be run directly:

```sql
-- Total sessions per risk level
SELECT risk_level, COUNT(*)
FROM screening_session
WHERE deleted_at IS NULL AND status = 'COMPLETED'
GROUP BY risk_level;

-- Average score per category
SELECT
  AVG((scores->>'intensitas')::int) as avg_intensitas,
  AVG((scores->>'waktu')::int) as avg_waktu,
  AVG((scores->>'lokasi_tubuh')::int) as avg_lokasi,
  AVG((scores->>'kontak')::int) as avg_kontak,
  AVG((scores->>'lesi')::int) as avg_lesi,
  AVG((scores->>'faktor_risiko')::int) as avg_faktor
FROM screening_session
WHERE deleted_at IS NULL AND status = 'COMPLETED';

-- Sessions per month
SELECT
  DATE_TRUNC('month', created_at) as month,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE risk_level = 'HIGH') as high_risk
FROM screening_session
WHERE deleted_at IS NULL AND status = 'COMPLETED'
GROUP BY month
ORDER BY month DESC;

-- Export full session data (for research)
SELECT
  ss.id, ss.total_score, ss.risk_level, ss.perception, ss.locale,
  ss.scores, ss.created_at, ss.completed_at,
  d.age, d.gender, d.education_level
FROM screening_session ss
JOIN demographics d ON d.session_id = ss.id
WHERE ss.deleted_at IS NULL AND ss.status = 'COMPLETED'
ORDER BY ss.created_at DESC;

-- Parse success rate per model (prompt evaluation)
SELECT
  model,
  COUNT(*) as total_turns,
  COUNT(*) FILTER (WHERE parse_status = 'SUCCESS') as success,
  COUNT(*) FILTER (WHERE parse_status = 'PARTIAL') as partial,
  COUNT(*) FILTER (WHERE parse_status = 'FAILURE') as failure,
  ROUND(100.0 * COUNT(*) FILTER (WHERE parse_status = 'SUCCESS') / COUNT(*), 1) as success_rate_pct
FROM turn_log
GROUP BY model;

-- Accuracy rate per prompt version (from feedback)
SELECT
  ef.prompt_version,
  COUNT(*) as total_evaluated,
  COUNT(*) FILTER (WHERE ef.is_accurate = true) as accurate,
  ROUND(100.0 * COUNT(*) FILTER (WHERE ef.is_accurate = true) / COUNT(*), 1) as accuracy_pct
FROM evaluation_feedback ef
GROUP BY ef.prompt_version
ORDER BY ef.prompt_version;

-- Average latency per model
SELECT
  model,
  ROUND(AVG(latency_ms)) as avg_latency_ms,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms)) as p95_latency_ms
FROM turn_log
GROUP BY model;
```

---

## 13. Prisma Full Schema (MVP)

Complete file for `prisma/schema.prisma` (MVP only):

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ==================== ENUMS ====================

enum RiskLevel {
  LOW
  MODERATE
  HIGH
}

enum Perception {
  UNDERESTIMATE
  OVERESTIMATE
  BARRIER
  ADEQUATE
}

enum ScreeningStatus {
  IN_PROGRESS
  COMPLETED
  REVIEWED
}

// ==================== SCREENING SESSION ====================

model ScreeningSession {
  id                   String          @id @default(uuid()) @map("id")
  locale               String          @default("id") @map("locale")
  mode                 String          @default("ai") @map("mode") // "ai" | "questionnaire"
  status               ScreeningStatus @default(IN_PROGRESS) @map("status")
  categoriesCovered    Json            @default("[]") @map("categories_covered")
  scores               Json?           @map("scores")
  totalScore           Int?            @map("total_score")
  riskLevel            RiskLevel?      @map("risk_level")
  perception           Perception?     @map("perception")
  aiConclusion         String?         @map("ai_conclusion")
  aiPerceptionResponse String?         @map("ai_perception_response")
  aiRecommendation     String?         @map("ai_recommendation")
  aiSuggestion         String?         @map("ai_suggestion")
  shareToken           String?         @unique @default(uuid()) @map("share_token")
  promptVersion        String          @default("v1") @map("prompt_version")
  scoringVersion       String          @default("v1") @map("scoring_version")
  createdAt            DateTime        @default(now()) @map("created_at")
  completedAt          DateTime?       @map("completed_at")
  updatedAt            DateTime        @updatedAt @map("updated_at")
  deletedAt            DateTime?       @map("deleted_at")

  messages             ChatMessage[]
  extractions          TurnExtraction[]
  demographics         Demographics?

  @@index([status, riskLevel], map: "idx_session_status_risk")
  @@index([shareToken], map: "idx_session_share_token")
  @@index([createdAt(sort: Desc)], map: "idx_session_created_desc")
  @@index([riskLevel, createdAt(sort: Desc)], map: "idx_session_risk_created")
  @@map("screening_session")
}

// ==================== DEMOGRAPHICS ====================

model Demographics {
  id             String           @id @default(uuid()) @map("id")
  sessionId      String           @unique @map("session_id")
  name           String?          @map("name")
  age            Int              @map("age")
  gender         String           @map("gender")
  educationLevel String           @map("education_level")
  createdAt      DateTime         @default(now()) @map("created_at")

  session        ScreeningSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@map("demographics")
}

// ==================== CHAT MESSAGES ====================

model ChatMessage {
  id        String           @id @default(uuid()) @map("id")
  sessionId String           @map("session_id")
  role      String           @map("role")
  content   String           @map("content")
  isVoice   Boolean          @default(false) @map("is_voice")
  createdAt DateTime         @default(now()) @map("created_at")

  session   ScreeningSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([sessionId, createdAt], map: "idx_message_session_time")
  @@map("chat_message")
}

// ==================== TURN EXTRACTION ====================

model TurnExtraction {
  id          String           @id @default(uuid()) @map("id")
  sessionId   String           @map("session_id")
  turnNumber  Int              @map("turn_number")
  extraction  Json             @map("extraction")
  scores      Json             @map("scores")
  llmMetadata Json?            @map("llm_metadata")
  createdAt   DateTime         @default(now()) @map("created_at")

  session     ScreeningSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@unique([sessionId, turnNumber], map: "uq_extraction_session_turn")
  @@map("turn_extraction")
}
```
