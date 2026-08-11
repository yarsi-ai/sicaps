# SICAPS — Coding Standards

> **Scope:** Rules for all developers and AI agents working on this codebase.  
> **Stack:** Next.js 16 (App Router), TypeScript, Tailwind CSS, Prisma, Supabase  
> **Last updated:** 23 Juni 2026

---

## 1. Language

| Layer                              | Language                       | Note                                                         |
| ---------------------------------- | ------------------------------ | ------------------------------------------------------------ |
| Code (variables, functions, types) | English                        | Industry standard                                            |
| Domain-specific nouns              | Indonesian (as-is)             | "cadre", "respondent" OK. "pondok", "santri" no translation. |
| Comments                           | English                        | Consistency with code                                        |
| Commit messages                    | English                        | Conventional Commits format                                  |
| Translation keys                   | English keys, bilingual values | `landing.startButton`                                        |

---

## 2. Naming Conventions

| Element            | Case                      | Example                                          |
| ------------------ | ------------------------- | ------------------------------------------------ |
| React components   | PascalCase                | `ChatBubble`, `DemographicsForm`                 |
| Component files    | PascalCase (match export) | `ChatBubble.tsx`                                 |
| Hooks              | camelCase, `use` prefix   | `useScreeningSession.ts`                         |
| Utility functions  | camelCase                 | `calculateRiskLevel`                             |
| Utility files      | camelCase                 | `scoring.ts`, `keywords.ts`                      |
| Constants          | SCREAMING_SNAKE           | `MAX_MESSAGE_LENGTH`                             |
| Types / Interfaces | PascalCase, no `I` prefix | `ScreeningResult`, `ExtractedKeyword`            |
| Enums (TypeScript) | PascalCase name + values  | `enum RiskLevel { High, Moderate, Low }`         |
| Env variables      | SCREAMING_SNAKE           | `LLM_BASE_URL`                                   |
| API route folders  | kebab-case                | `screening/`, `start/`                           |
| Database (Prisma)  | See DATABASE_SCHEMA.md    | PascalCase model, camelCase field, snake_case DB |
| Branches           | `type/short-description`  | `feat/chat-voice-mode`                           |

---

## 3. Architecture — 3-Layer Pattern

```
Route Handler (app/api/)  →  Service (services/)  →  Lib (lib/)
    HTTP glue                  Orchestration           Pure logic
```

### 3.1 Route Handler (`app/api/**/route.ts`)

- Parse request, validate with Zod, return HTTP response
- Max ~30 lines per handler body
- NO direct Prisma imports
- NO business logic — delegate to services
- Single try/catch wrapping per handler

```typescript
export async function POST(req: NextRequest) {
  try {
    await withRateLimit(req, CONFIG.rateLimit.chat);
    const input = chatSchema.parse(await req.json());
    const result = await screeningService.processChat(input);
    return apiResponse(result);
  } catch (err) {
    return apiError(err);
  }
}
```

### 3.2 Service (`services/*.service.ts`)

- Business orchestration: coordinate DB, external APIs, lib functions
- MAY import Prisma, external clients, lib functions
- MAY throw AppError subclasses
- Named file pattern: `services/<domain>.service.ts`

```typescript
// services/screening.service.ts
export async function processChat(input: ChatInput): Promise<ChatResponse> {
  const session = await getActiveSession(input.sessionId);
  const llmResult = await callLLM(session, input.message);
  const scores = calculateAllScores(llmResult.extraction, session.locale);
  await saveTurnExtraction(session.id, llmResult, scores);
  return buildChatResponse(session, llmResult, scores);
}
```

### 3.3 Lib (`lib/`)

- Pure logic, utilities, stateless helpers
- **MUST NOT** import Prisma, services, or Next.js-specific modules
- **MUST NOT** perform I/O (no DB, no fetch, no file system)
- Fully testable without mocks

```typescript
// lib/scoring.ts — pure function
export function calculateAllScores(
  extraction: CategoryExtraction,
  locale: Locale = 'id'
): Record<string, number> { ... }
```

---

## 4. Folder Structure

```
sicaps/
├── app/
│   ├── (public)/screening/chat/
│   │   ├── page.tsx                  # Route entry (default export OK)
│   │   ├── _components/              # Private to this route
│   │   │   └── TypingIndicator.tsx
│   │   └── _hooks/                   # Private to this route
│   │       └── useChatScroll.ts
│   └── api/screening/chat/
│       ├── route.ts                  # HTTP handler
│       └── schema.ts                 # Zod schema (colocated)
├── components/                       # Shared (used by 2+ pages)
│   ├── chat/
│   ├── forms/
│   └── ui/                           # Reusable UI primitives (Tailwind + Radix)
├── services/                         # Business orchestration
│   ├── screening.service.ts
│   └── pdf.service.ts
├── lib/                              # Pure logic, NO I/O
│   ├── scoring.ts
│   ├── keywords/
│   │   ├── id.ts
│   │   ├── en.ts
│   │   └── index.ts
│   ├── llm.ts                        # LLM client config
│   ├── prompts.ts
│   ├── env.ts                        # Env validation (Zod)
│   ├── config.ts                     # App constants
│   ├── errors.ts                     # AppError classes
│   ├── sanitize.ts                   # Input sanitization
│   └── api/
│       └── response.ts              # API envelope helpers
├── stores/                           # Zustand stores
│   └── screening.ts
├── types/                            # Shared TypeScript types
│   ├── api.ts
│   ├── screening.ts
│   └── index.ts
└── messages/                         # i18n (next-intl)
    ├── id.json
    └── en.json
```

### Rules

1. **`_components/` and `_hooks/`** (underscore prefix) = private to that route. If used in 2+ places → move to shared `components/` or `hooks/`.
2. **Barrel files** (`index.ts`) — one level deep only. No nested re-exports.
3. **Zod schemas** colocated with route handler (`schema.ts` next to `route.ts`).
4. **Test files** colocated with source: `scoring.test.ts` next to `scoring.ts`.

---

## 5. TypeScript Rules

### 5.1 Strictness

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true
  }
}
```

### 5.2 Type Rules

| Rule            | Guideline                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------ |
| `any`           | **BANNED.** Use `unknown` + type narrowing or Zod parsing. Exception: 3rd-party lib forcing it.  |
| `as` assertions | **Avoid.** Use type guards or Zod. Exception: test files for partial mocks.                      |
| Non-null `!`    | **Banned in production.** Allowed in test files.                                                 |
| Return types    | **Explicit** for exported functions. Inferred OK for internal helpers.                           |
| Union vs Enum   | **Union preferred** for string sets. Enum only for Prisma (DB mapping).                          |
| Nullish `??`    | OK for **display defaults** (UI). For business logic, null = error → throw or handle explicitly. |

---

## 6. React Component Patterns

### 6.1 File Structure

```typescript
// 1. Imports (external → internal → types)
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/types/screening';

// 2. Props interface
interface ChatBubbleProps {
  message: ChatMessage;
  theme: 'playful' | 'hybrid';
  onLongPress?: () => void;
}

// 3. Named export (NOT default)
export function ChatBubble({ message, theme, onLongPress }: ChatBubbleProps) {
  return ( ... );
}
```

### 6.2 Rules

| Rule              | Guideline                                                                              |
| ----------------- | -------------------------------------------------------------------------------------- |
| Export style      | **Named exports only.** Exception: `page.tsx`, `layout.tsx` (Next.js requires default) |
| Props             | Explicit interface, inline in same file. If shared → `types/`                          |
| Component size    | Max ~150 lines → extract sub-components                                                |
| Data fetching     | At page-level or route handler. Components do NOT fetch.                               |
| State             | Local `useState` first. Context/Zustand only if shared across tree.                    |
| Props drilling    | Max 2 levels. Beyond → Context or Zustand.                                             |
| No prop spreading | `{...props}` only for native element forwarding. Explicit props for custom components. |

### 6.3 Import Order

```typescript
// 1. React / Next.js
import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// 2. External packages
import { z } from 'zod';

// 3. Internal (absolute @/ paths)
import { calculateRiskLevel } from '@/lib/scoring';
import { Button } from '@/components/ui/Button';

// 4. Relative (same feature)
import { TypingIndicator } from './_components/TypingIndicator';

// 5. Types (last, with `type` keyword)
import type { ScreeningResult } from '@/types/screening';
```

---

## 7. State Management

### 7.1 Hierarchy

| Level           | Tool          | Use Case                              |
| --------------- | ------------- | ------------------------------------- |
| Component-local | `useState`    | Form inputs, toggles, loading states  |
| Feature-shared  | React Context | Theme, locale (small, rarely changes) |
| App-global      | Zustand       | Screening session state, voice mode   |

### 7.2 Rules

- **No React Query in MVP.** Simple `fetch` + loading state. Phase 2: add TanStack Query for dashboards (list/pagination/refetch).
- **Zustand stores** in `stores/` folder. Max 2-3 stores for MVP.
- **Server state** fetched in Server Components or route handlers, passed as props.

---

## 8. Error Handling

### 8.1 Custom Error Classes

```typescript
// lib/errors.ts
export class AppError extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ValidationError extends AppError { ... }
export class NotFoundError extends AppError { ... }
export class LlmError extends AppError { ... }
export class RateLimitError extends AppError { ... }
```

### 8.2 Rules

| Rule                | Guideline                                                               |
| ------------------- | ----------------------------------------------------------------------- |
| Throw, don't return | Business logic throws AppError. Route handler catches.                  |
| Never swallow       | No empty `catch {}`. At minimum, log.                                   |
| Generic to client   | Unexpected errors → generic message to user, full detail to server log. |
| Validate everything | All external input (API, env, LLM output) validated with Zod.           |

---

## 9. Testing

### 9.1 Location & Naming

- **Colocated:** `scoring.test.ts` next to `scoring.ts`
- **describe:** function/module name
- **it:** behavior statement, starts with verb. No "should" prefix.

```typescript
describe('calculateCategoryScore', () => {
  it('returns 0 when no keywords match', () => { ... });
  it('applies longest match priority', () => { ... });
});
```

### 9.2 What MUST Be Tested

| Category           | Requirement                                       |
| ------------------ | ------------------------------------------------- |
| `lib/` functions   | Every exported function                           |
| `services/`        | Every public method (mock Prisma + external APIs) |
| API routes         | ≥1 happy path + ≥1 error case per endpoint        |
| Zod schemas        | Edge cases (boundary values, invalid types)       |
| LLM output parsing | Malformed responses, missing fields               |

### 9.3 What NOT To Test (MVP)

- Radix primitives (tested upstream — Dialog, Select, Toast)
- Pure visual components tanpa logic (Button styling, Card layout)
- React component rendering (UI volatile, iterate fast)
- Tailwind classes
- Static pages

### 9.4 Mocking Strategy

- **Pragmatic:** Use `vi.mock()` for Prisma and external APIs
- **DI:** For functions with ≥3 external dependencies, consider injectable parameters
- **MSW:** For integration tests that mock HTTP (LLM API)

---

## 10. Environment & Config

### 10.1 Env Validation

```typescript
// lib/env.ts — Zod-validated, fail-fast at startup
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  LLM_BASE_URL: z.string().url(),
  LLM_API_KEY: z.string().min(1),
  LLM_MODEL: z.string().min(1),
  // ... all required env vars
});

export const env = envSchema.parse(process.env);
```

### 10.2 Config Constants

```typescript
// lib/config.ts — no magic numbers
export const CONFIG = {
  screening: {
    maxMessageLength: 2000,
    sessionTimeoutHours: 24,
    maxTurns: 10,
  },
  llm: {
    timeoutMs: 12_000,
    maxRetries: 1,
  },
  rateLimit: {
    start: { limit: 5, window: '1m' },
    chat: { limit: 10, window: '1m' },
  },
} as const;
```

### 10.3 Rules

1. Access env via `env.VAR_NAME` (from `lib/env.ts`), never `process.env` directly.
2. `NEXT_PUBLIC_` prefix ONLY for vars safe to expose to browser.
3. `.env.example` must stay up-to-date with all required vars.
4. No magic numbers in logic — extract to `CONFIG`.

---

## 11. Security

### 11.1 Input & Output

| Rule          | Guideline                                                    |
| ------------- | ------------------------------------------------------------ |
| User input    | Sanitize (strip HTML/scripts) before DB or LLM               |
| LLM output    | Treat as untrusted. Sanitize before rendering.               |
| SQL injection | Not a concern (Prisma parameterized). NEVER use raw queries. |

### 11.2 Secrets & Logging

| Rule            | Guideline                                                              |
| --------------- | ---------------------------------------------------------------------- |
| API keys        | Server-side only (`lib/env.ts`). NEVER `NEXT_PUBLIC_`.                 |
| Logs            | Log sessionId + error code. NEVER log full request body (health data). |
| ShareToken      | Timing-safe comparison. Treat like a password.                         |
| Error responses | Generic to client. Full detail to server logs only.                    |

---

## 12. Git Conventions

### 12.1 Commit Messages (Conventional Commits)

```
<type>(<scope>): <subject>

feat(chat): add voice mode toggle
fix(scoring): handle negative score floor correctly
refactor(api): extract validation to schema files
test(scoring): add edge cases for longest match priority
```

| Type       | Usage               |
| ---------- | ------------------- |
| `feat`     | New feature         |
| `fix`      | Bug fix             |
| `refactor` | No behavior change  |
| `docs`     | Documentation       |
| `test`     | Tests               |
| `chore`    | Build, deps, config |
| `style`    | Formatting only     |

### 12.2 Pre-commit Hooks (Husky + lint-staged)

```json
{
  "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
  "*.{json,md}": ["prettier --write"]
}
```

### 12.3 Linting

| Tool       | Config                                                               |
| ---------- | -------------------------------------------------------------------- |
| ESLint     | `next/core-web-vitals` + `@typescript-eslint/no-explicit-any: error` |
| Prettier   | `semi: true`, `singleQuote: true`, `printWidth: 100`                 |
| TypeScript | `strict: true`                                                       |

---

## 13. Code Comments & Documentation

### 13.1 When to Comment

| Scenario                | Action                                     |
| ----------------------- | ------------------------------------------ |
| What code does          | DON'T. Name things clearly instead.        |
| Why a decision was made | DO. Business context, tradeoffs.           |
| Complex algorithm       | DO. Scoring logic, prompt construction.    |
| Regex / magic values    | DO. Explain what it matches.               |
| TODO / HACK             | DO. Format: `// TODO(#issue): description` |

### 13.2 JSDoc

- **Required:** All exported functions in `lib/` and `services/`
- **Optional:** React components (props interface is self-documenting)
- `@param`/`@returns` not required if TypeScript types are clear

```typescript
/**
 * Calculate cumulative score for a single category from LLM extraction.
 * Filters by confidence, applies longest-match priority, floors at 0.
 */
export function calculateCategoryScore(...): { score: number; matchedKeywords: string[] } { ... }
```

---

## 14. Phase 2 Upgrades

When Phase 2 begins, the following additions/changes are expected:

| Area          | Change                                                                       |
| ------------- | ---------------------------------------------------------------------------- |
| Data fetching | Add TanStack Query (React Query) for dashboard pages (list/pagination/cache) |
| Service layer | Add `services/auth.service.ts`, `services/review.service.ts`                 |
| Middleware    | Add auth middleware (Supabase session validation)                            |
| Testing       | Add component tests for dashboard (more stable UI than chat)                 |
| State         | Add auth store (Zustand) for current user/role                               |
