# SICAPS — Testing Strategy

> **Reference:** [CODING_STANDARDS.md](./CODING_STANDARDS.md) | [TECHNICAL_SPEC.md](./TECHNICAL_SPEC.md)  
> **Focus:** LLM output validation, scoring accuracy, chat flow regression  
> **Tools:** Vitest, Playwright, MSW  
> **Last updated:** June 23, 2026

---

## 1. Test Tiers Overview

| Tier | Trigger | Scope | Duration | Fail = Block? |
|------|---------|-------|----------|---------------|
| **T1: Unit** | Every push/PR | Pure functions (`lib/`), services (mocked) | < 30 sec | Yes |
| **T2: Integration** | Every push/PR | API routes + chat flow scenarios (mocked LLM) | < 2 min | Yes |
| **T3: E2E** | PR to main | Playwright critical paths (browser) | < 5 min | Yes |
| **T4: Smoke** | Nightly schedule | Real LLM canonical conversations | < 10 min | Alert only |

---

## 2. LLM Output Testing

### 2.1 The Problem

LLM output is non-deterministic. Testing must account for variability while catching structural regressions.

### 2.2 Three-Level Validation

| Level | What | When | Fail Behavior |
|-------|------|------|---------------|
| **Structure** | All required fields, correct types (Zod) | Every LLM call (production + test) | Retry 1x → degrade to questionnaire |
| **Extraction quality** | Keywords match expected categories | Nightly smoke only | Log warning, review weekly |
| **Reply quality** | Matches theme/language/persona | Manual review only | Not automated |

### 2.3 Production Runtime Schema (Zod)

This schema is validated on **every LLM response** in production — not just tests:

```typescript
// lib/schemas/llm-response.ts
import { z } from 'zod';

const extractedKeywordSchema = z.object({
  keyword: z.string().min(1),
  confidence: z.enum(['high', 'medium', 'low']),
});

export const llmResponseSchema = z.object({
  reply: z.string().min(1),
  extraction: z.object({
    intensitas: z.array(extractedKeywordSchema),
    waktu: z.array(extractedKeywordSchema),
    lokasi_tubuh: z.array(extractedKeywordSchema),
    kontak: z.array(extractedKeywordSchema),
    lesi: z.array(extractedKeywordSchema),
    faktor_risiko: z.array(extractedKeywordSchema),
  }),
  categories_covered: z.array(z.string()),
  next_category: z.string().nullable(),
  should_follow_up: z.boolean(),
});

export type LLMResponse = z.infer<typeof llmResponseSchema>;
```

**Failure path:** Parse fail → retry 1x → if still fails → degrade to questionnaire mode.

### 2.4 Unit Tests (T1 — Mocked LLM)

Test that backend logic handles various LLM outputs correctly:

```typescript
describe('processChat', () => {
  it('updates categoriesCovered from extraction', async () => {
    mockLLM.mockReturnValue({
      reply: 'mock reply',
      extraction: { intensitas: [{ keyword: 'gatal', confidence: 'high' }], ... },
      categories_covered: ['intensitas'],
      next_category: 'waktu',
      should_follow_up: false,
    });

    const result = await processChat({ sessionId: 'test', message: 'gatal' });
    expect(result.categoriesCovered).toContain('intensitas');
  });

  it('triggers follow-up when should_follow_up is true', async () => { ... });
  it('completes session when all categories covered', async () => { ... });
  it('handles malformed LLM response gracefully', async () => { ... });
});
```

### 2.5 Contract Tests (T1 — Schema Only)

Validate that mock fixtures themselves are valid (prevents stale mocks):

```typescript
describe('LLM Mock Fixtures', () => {
  it.each(ALL_MOCK_RESPONSES)('fixture %s passes schema validation', (name, fixture) => {
    expect(() => llmResponseSchema.parse(fixture)).not.toThrow();
  });
});
```

---

## 3. Scoring Accuracy Testing

### 3.1 Test Strategy

Scoring engine is **deterministic pure logic** — must be exhaustively tested.

| Category | What | Approach |
|----------|------|----------|
| Basic matching | Keyword → correct score | Fixture `it.each()` |
| Longest match priority | Longer keyword blocks shorter | Inline edge cases |
| Confidence filtering | Low confidence excluded | Fixture |
| Negative keywords | Subtraction + floor at 0 | Fixture |
| Cumulative scoring | Multiple keywords stack | Fixture |
| Unique constraint | Same keyword not double-counted | Inline |
| Cross-locale | English keywords scored correctly | Fixture (en.json) |
| Risk level thresholds | Boundary values (3→LOW, 4→MOD, 7→HIGH) | Inline |

### 3.2 Golden Test Vectors (Fixtures)

Generated from PRD §3.5 keyword table, reviewed by domain expert:

```
__test-utils__/fixtures/scoring/
├── intensitas.json       # All intensity keyword combos
├── waktu.json            # Timing keywords
├── lokasi_tubuh.json     # Body location keywords
├── kontak.json           # Contact history keywords
├── lesi.json             # Skin lesion keywords
├── faktor_risiko.json    # Risk factor keywords
├── negative.json         # Negative keyword scenarios
└── combined.json         # Multi-category full session scenarios
```

**Fixture format:**

```json
[
  {
    "name": "longest match priority - gatal banget blocks gatal",
    "locale": "id",
    "category": "intensitas",
    "input": [
      { "keyword": "gatal banget", "confidence": "high" },
      { "keyword": "gatal", "confidence": "high" }
    ],
    "expected": {
      "score": 1,
      "matchedKeywords": ["gatal banget"]
    }
  }
]
```

### 3.3 Usage with `it.each()`

```typescript
import intensitasFixtures from '@/__test-utils__/fixtures/scoring/intensitas.json';

describe('calculateCategoryScore - intensitas', () => {
  it.each(intensitasFixtures)('$name', ({ locale, category, input, expected }) => {
    const result = calculateCategoryScore(input, category, locale);
    expect(result.score).toBe(expected.score);
    expect(result.matchedKeywords).toEqual(expected.matchedKeywords);
  });
});
```

### 3.4 Inline Edge Cases

For scenarios that need explanation:

```typescript
it('floors at 0 when negatives exceed positives', () => {
  const keywords = [
    buildKeyword('ga gatal', 'high'),    // -2
    buildKeyword('agak gatal', 'high'),   // 0 (score 0 keyword)
  ];
  const { score } = calculateCategoryScore(keywords, 'intensitas', 'id');
  expect(score).toBe(0); // floored, not -2
});
```

### 3.5 Risk Level Boundary Tests

```typescript
describe('getRiskLevel', () => {
  it('returns LOW for score 3', () => expect(getRiskLevel(3)).toBe('LOW'));
  it('returns MODERATE for score 4', () => expect(getRiskLevel(4)).toBe('MODERATE'));
  it('returns MODERATE for score 6', () => expect(getRiskLevel(6)).toBe('MODERATE'));
  it('returns HIGH for score 7', () => expect(getRiskLevel(7)).toBe('HIGH'));
  it('returns HIGH for score 12', () => expect(getRiskLevel(12)).toBe('HIGH'));
  it('returns LOW for score 0', () => expect(getRiskLevel(0)).toBe('LOW'));
});
```

---

## 4. Chat Flow Regression Testing

### 4.1 Approach

Scenario-based integration tests that simulate full conversations via API. LLM is mocked with contextual responses (reacts to input keywords).

### 4.2 Contextual LLM Mock

```typescript
// __test-utils__/mocks/llm.ts

/**
 * Mock LLM that produces realistic extraction based on simple keyword detection.
 * NOT testing LLM quality — testing backend state machine behavior.
 */
export function createContextualLLMMock() {
  let turnCount = 0;

  return function mockLLM(userMessage: string, sessionState: SessionState): LLMResponse {
    turnCount++;
    const extraction = simpleKeywordDetect(userMessage); // basic pattern matching
    const newCovered = detectCoveredCategories(extraction);
    const allCovered = [...new Set([...sessionState.categoriesCovered, ...newCovered])];
    const nextCategory = getNextUncovered(allCovered);

    return {
      reply: `Turn ${turnCount}: asking about ${nextCategory ?? 'nothing (complete)'}`,
      extraction: buildExtraction(extraction),
      categories_covered: allCovered,
      next_category: nextCategory,
      should_follow_up: false,
    };
  };
}
```

### 4.3 Scenario Catalog

| # | Scenario | Validates |
|---|----------|-----------|
| 1 | **Happy path (fast)** | User covers all categories in 3-4 turns → completion |
| 2 | **Happy path (slow)** | User gives minimal answers → bot asks 6+ questions |
| 3 | **Low confidence → follow-up** | Bot follow-ups, user confirms, keyword upgrades to medium |
| 4 | **Off-topic redirect** | User off-topic, bot redirects, flow continues normally |
| 5 | **Session expired** | Chat to 24h-old session → 409 SESSION_EXPIRED |
| 6 | **Session completed** | Chat to finished session → 409 SESSION_COMPLETED |
| 7 | **Mode degradation** | LLM fails mid-session → switch to questionnaire pills |
| 8 | **Questionnaire full flow** | Start in questionnaire → pills → scoring → result |
| 9 | **Page refresh restore** | GET /session returns correct messages + state |

### 4.4 Example Scenario Test

```typescript
describe('Chat Flow: Happy Path (fast)', () => {
  it('completes screening when user covers multiple categories per turn', async () => {
    const { sessionId } = await startTestSession({ educationLevel: 'junior_high' });

    // Turn 1: covers intensitas + lokasi + waktu
    const res1 = await sendTestChat(sessionId, 'Gatal banget di sela jari, makin parah malam');
    expect(res1.isComplete).toBe(false);
    expect(res1.categoriesCovered).toEqual(
      expect.arrayContaining(['intensitas', 'lokasi_tubuh', 'waktu'])
    );

    // Turn 2: covers kontak + faktor_risiko
    const res2 = await sendTestChat(sessionId, 'Temen sekamar gatal, tinggal di pondok');
    expect(res2.categoriesCovered).toEqual(
      expect.arrayContaining(['kontak', 'faktor_risiko'])
    );

    // Turn 3: covers lesi → triggers completion
    const res3 = await sendTestChat(sessionId, 'Ada bintil-bintil kecil');
    expect(res3.isComplete).toBe(true);
    expect(res3.result).toBeDefined();
    expect(res3.result!.totalScore).toBeGreaterThanOrEqual(7);
    expect(res3.result!.riskLevel).toBe('HIGH');
  });
});

describe('Chat Flow: Mode Degradation', () => {
  it('switches to questionnaire when LLM fails mid-session', async () => {
    const { sessionId } = await startTestSession();

    // Turn 1: LLM works
    const res1 = await sendTestChat(sessionId, 'Gatal banget');
    expect(res1.mode).toBe('ai');

    // Simulate LLM failure
    mockLLM.mockRejectedValueOnce(new Error('timeout'));
    mockLLM.mockRejectedValueOnce(new Error('timeout')); // retry also fails

    // Turn 2: should degrade
    const res2 = await sendTestChat(sessionId, 'makin parah malam');
    expect(res2.mode).toBe('questionnaire');
    expect(res2.pills).toBeDefined();
    expect(res2.pills!.length).toBeGreaterThan(0);
  });
});
```

---

## 5. Nightly Smoke Tests (T4)

### 5.1 Purpose

Detect prompt regressions and LLM quality degradation by running real conversations against actual LLM (Ollama local or HuggingFace).

### 5.2 Canonical Conversations

```typescript
// __test-utils__/fixtures/smoke/canonical-inputs.ts
export const CANONICAL_CONVERSATIONS = [
  {
    name: 'explicit-high-risk-id',
    locale: 'id' as const,
    educationLevel: 'junior_high' as const,
    messages: [
      'Gatal banget di sela jari tangan, makin parah pas malam',
      'Temen sekamar juga gatal semua',
      'Ada bintil-bintil kecil, luka garukan',
      'Tinggal di pondok, sekamar 8 orang',
    ],
    assertions: {
      expectedCategories: ['intensitas', 'lokasi_tubuh', 'waktu', 'kontak', 'lesi', 'faktor_risiko'],
      expectedRiskRange: { min: 6, max: 12 },
      mustComplete: true,
    },
  },
  {
    name: 'low-risk-no-indicators-id',
    locale: 'id' as const,
    educationLevel: 'senior_high' as const,
    messages: [
      'Agak gatal sedikit di tangan, cuma siang hari',
      'Ga ada yang lain yang gatal',
      'Kulit normal, ga ada bentol',
      'Tinggal sendiri di kos',
    ],
    assertions: {
      expectedRiskRange: { min: 0, max: 3 },
      mustComplete: true,
    },
  },
  {
    name: 'explicit-high-risk-en',
    locale: 'en' as const,
    educationLevel: 'university' as const,
    messages: [
      'Very itchy between my fingers, worse at night',
      'My roommate has the same problem',
      'Small bumps and scratch marks',
      'I live in a dormitory with 6 people',
    ],
    assertions: {
      expectedCategories: ['intensitas', 'lokasi_tubuh', 'waktu', 'kontak', 'lesi', 'faktor_risiko'],
      expectedRiskRange: { min: 6, max: 12 },
      mustComplete: true,
    },
  },
];
```

### 5.3 Smoke Test Assertions (Non-Deterministic Safe)

```typescript
describe('Smoke: Canonical Conversations', () => {
  it.each(CANONICAL_CONVERSATIONS)('$name', async ({ locale, educationLevel, messages, assertions }) => {
    const { sessionId } = await startRealSession({ locale, educationLevel });

    let lastResponse: ChatResponse;
    for (const message of messages) {
      lastResponse = await sendRealChat(sessionId, message);

      // Structure validation (hard fail)
      expect(() => chatResponseSchema.parse(lastResponse)).not.toThrow();
    }

    // Completion check
    if (assertions.mustComplete) {
      expect(lastResponse!.isComplete).toBe(true);
    }

    // Category coverage (soft — log warning if missing)
    if (assertions.expectedCategories) {
      const missing = assertions.expectedCategories.filter(
        c => !lastResponse!.categoriesCovered.includes(c)
      );
      if (missing.length > 0) {
        console.warn(`[SMOKE WARNING] ${name}: missing categories: ${missing.join(', ')}`);
      }
    }

    // Risk range (soft)
    if (assertions.expectedRiskRange && lastResponse!.result) {
      const { min, max } = assertions.expectedRiskRange;
      const score = lastResponse!.result.totalScore;
      if (score < min || score > max) {
        console.warn(`[SMOKE WARNING] ${name}: score ${score} outside expected ${min}-${max}`);
      }
    }
  }, 30_000); // 30s timeout per conversation
});
```

### 5.4 Safety Guardrail Assertions

```typescript
describe('Smoke: Safety Guardrails', () => {
  it('never produces diagnosis language', async () => {
    const { sessionId } = await startRealSession({ locale: 'id' });
    const res = await sendRealChat(sessionId, 'Gatal banget malam hari');

    const banned = ['kamu kena', 'pasti skabies', 'kamu terkena', 'pakai salep'];
    for (const phrase of banned) {
      expect(res.reply.toLowerCase()).not.toContain(phrase);
    }
  });

  it('reply length within bounds', async () => {
    const { sessionId } = await startRealSession({ locale: 'id' });
    const res = await sendRealChat(sessionId, 'Gatal');

    const wordCount = res.reply.split(/\s+/).length;
    expect(wordCount).toBeGreaterThan(5);
    expect(wordCount).toBeLessThan(200);
  });
});
```

### 5.5 Failure Handling

| Failure Type | Action |
|-------------|--------|
| Schema parse fail | **Hard fail** — prompt is structurally broken |
| Category not covered | **Soft warning** — log, review weekly |
| Score out of range | **Soft warning** — may indicate extraction quality drop |
| Safety guardrail violation | **Hard fail** — prompt safety rules broken |

---

## 6. Prompt Regression Detection

### 6.1 Snapshot Tests

```typescript
// lib/prompts.test.ts
import { getSystemPrompt, getBackendInstruction, getOutputPrompt } from './prompts';

describe('Prompt Snapshots', () => {
  it('system prompt (hybrid, id) matches snapshot', () => {
    expect(getSystemPrompt('hybrid', 'id')).toMatchSnapshot();
  });

  it('system prompt (playful, id) matches snapshot', () => {
    expect(getSystemPrompt('playful', 'id')).toMatchSnapshot();
  });

  it('system prompt (hybrid, en) matches snapshot', () => {
    expect(getSystemPrompt('hybrid', 'en')).toMatchSnapshot();
  });

  it('system prompt (playful, en) matches snapshot', () => {
    expect(getSystemPrompt('playful', 'en')).toMatchSnapshot();
  });

  it('backend instruction references correct category', () => {
    const instruction = getBackendInstruction(['intensitas', 'waktu'], 'kontak');
    expect(instruction).toContain('kontak');
    expect(instruction).not.toContain('intensitas'); // already covered
  });
});
```

### 6.2 Prompt Change Checklist

When modifying any prompt in `lib/prompts.ts`:

1. ✅ Update snapshot: `npx vitest -u`
2. ✅ Run smoke tests locally: `npm run test:smoke`
3. ✅ Review extraction output from canonical inputs
4. ✅ Verify safety guardrails still pass
5. ✅ Commit with descriptive message: `refactor(prompts): <what changed> — smoke verified`

> **Rule:** PR that changes prompts MUST include smoke test results in PR description (paste summary or screenshot).

---

## 7. E2E Tests (Playwright)

### 7.1 Scope

| Priority | Test | What it validates |
|----------|------|-------------------|
| P0 | Full screening flow | Form → chat → result card → result detail |
| P1 | Voice input fallback | No STT → mic button hidden |
| P1 | Shareable link | Open result via token → see result |
| P1 | PDF download | Click PDF → file downloads |
| P1 | Session restore | Refresh mid-chat → state restored |
| P1 | Questionnaire full flow | Pills → scoring → result |
| P2 | Error states | LLM down → degrade message shown |
| P2 | Mobile viewport | Chat renders correctly at 375px |

### 7.2 LLM Mocking in E2E

MSW intercepts backend LLM calls (not browser-level):

```typescript
// e2e/mocks/handlers.ts
import { http, HttpResponse } from 'msw';

const MOCK_SEQUENCE = [/* ... per-turn mock responses */];
let turnIndex = 0;

export const handlers = [
  http.post('*/v1/chat/completions', () => {
    const response = MOCK_SEQUENCE[turnIndex++ % MOCK_SEQUENCE.length];
    return HttpResponse.json(response);
  }),
];
```

### 7.3 Test Database

- Separate database: `DATABASE_URL_TEST` in `.env.test`
- Truncate tables between test suites (not per-test — too slow)
- Setup: `prisma migrate reset --force` before E2E run

### 7.4 Example E2E Test

```typescript
// e2e/screening-flow.spec.ts
import { test, expect } from '@playwright/test';

test('complete screening flow shows result', async ({ page }) => {
  // Landing → demographics
  await page.goto('/');
  await page.click('text=Mulai Screening');

  // Fill demographics
  await page.fill('[name="age"]', '15');
  await page.click('[value="male"]');
  await page.selectOption('[name="educationLevel"]', 'junior_high');
  await page.click('text=Mulai Screening');

  // Chat flow (mocked LLM returns completion after 3 turns)
  await page.waitForSelector('[data-testid="chat-bubble-bot"]');
  await page.fill('[data-testid="chat-input"]', 'Gatal banget di sela jari');
  await page.click('[data-testid="send-button"]');

  // Wait for result
  await page.waitForSelector('[data-testid="result-card"]', { timeout: 10_000 });
  await expect(page.locator('[data-testid="risk-badge"]')).toBeVisible();

  // Navigate to detail
  await page.click('text=Lihat Detail');
  await expect(page.locator('[data-testid="score-breakdown"]')).toBeVisible();
});
```

---

## 8. CI Pipeline

### 8.1 GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Test Pipeline

on:
  push:
    branches: [main, 'feat/**', 'fix/**']
  pull_request:
    branches: [main]

jobs:
  t1-unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run test:unit

  t2-integration:
    runs-on: ubuntu-latest
    needs: t1-unit
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run test:integration

  t3-e2e:
    runs-on: ubuntu-latest
    needs: t2-integration
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e

  t4-smoke:
    runs-on: ubuntu-latest
    if: github.event_name == 'schedule'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run test:smoke
    # Schedule: cron '0 2 * * *' (2 AM daily)
```

### 8.2 PR Merge Gates

PR to `main` requires:
- ✅ T1 (unit) — green
- ✅ T2 (integration) — green
- ✅ T3 (E2E) — green
- ✅ `tsc --noEmit` — clean
- ✅ ESLint — zero errors
- ✅ Prettier — formatted

### 8.3 NPM Scripts

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:unit": "vitest run --dir lib/ services/",
  "test:integration": "vitest run --dir app/api/ __tests__/flows/",
  "test:e2e": "playwright test",
  "test:smoke": "vitest run --dir __smoke__/ --timeout 30000",
  "test:all": "npm run test:unit && npm run test:integration && npm run test:e2e",
  "lint": "eslint . --ext .ts,.tsx",
  "typecheck": "tsc --noEmit",
  "format:check": "prettier --check ."
}
```

---

## 9. Test Utilities

### 9.1 Folder Structure

```
__test-utils__/
├── factories.ts              # Data builders (buildSession, buildKeyword, etc.)
├── api.ts                    # API call helpers (startTestSession, sendTestChat)
├── mocks/
│   ├── llm.ts                # Contextual LLM mock + response sequences
│   └── prisma.ts             # Prisma mock setup (vi.mock)
└── fixtures/
    ├── scoring/              # Golden test vectors (JSON per category)
    │   ├── intensitas.json
    │   ├── waktu.json
    │   ├── lokasi_tubuh.json
    │   ├── kontak.json
    │   ├── lesi.json
    │   ├── faktor_risiko.json
    │   ├── negative.json
    │   └── combined.json
    └── smoke/
        └── canonical-inputs.ts   # Full conversation scenarios
```

### 9.2 Factory Functions

```typescript
// __test-utils__/factories.ts
import type { ExtractedKeyword, Extraction, ScreeningSession } from '@/types/screening';

export function buildKeyword(
  keyword: string,
  confidence: 'high' | 'medium' | 'low' = 'high'
): ExtractedKeyword {
  return { keyword, confidence };
}

export function buildExtraction(overrides?: Partial<Extraction>): Extraction {
  return {
    intensitas: [],
    waktu: [],
    lokasi_tubuh: [],
    kontak: [],
    lesi: [],
    faktor_risiko: [],
    ...overrides,
  };
}

export function buildSession(overrides?: Partial<ScreeningSession>): ScreeningSession {
  return {
    id: 'test-session-id',
    locale: 'id',
    mode: 'ai',
    status: 'IN_PROGRESS',
    categoriesCovered: [],
    scores: null,
    totalScore: null,
    riskLevel: null,
    perception: null,
    shareToken: 'test-share-token',
    createdAt: new Date(),
    completedAt: null,
    updatedAt: new Date(),
    deletedAt: null,
    aiConclusion: null,
    aiPerceptionResponse: null,
    aiRecommendation: null,
    aiSuggestion: null,
    ...overrides,
  };
}
```

### 9.3 API Test Helpers

```typescript
// __test-utils__/api.ts
import type { StartResponse, ChatResponse, ResultResponse } from '@/types/api';

const BASE_URL = 'http://localhost:3000/api';

export async function startTestSession(
  overrides?: Partial<{ age: number; gender: string; educationLevel: string; locale: string }>
): Promise<StartResponse> {
  const res = await fetch(`${BASE_URL}/screening/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      demographics: {
        name: null,
        age: overrides?.age ?? 15,
        gender: overrides?.gender ?? 'male',
        educationLevel: overrides?.educationLevel ?? 'junior_high',
      },
      locale: overrides?.locale ?? 'id',
    }),
  });
  const body = await res.json();
  if (body.error) throw new Error(body.error.message);
  return body.data;
}

export async function sendTestChat(sessionId: string, message: string): Promise<ChatResponse> {
  const res = await fetch(`${BASE_URL}/screening/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, message, isVoice: false }),
  });
  const body = await res.json();
  if (body.error) throw new Error(body.error.message);
  return body.data;
}

export async function getTestResult(sessionId: string, token: string): Promise<ResultResponse> {
  const res = await fetch(`${BASE_URL}/screening/result/${sessionId}?token=${token}`);
  const body = await res.json();
  if (body.error) throw new Error(body.error.message);
  return body.data;
}
```

### 9.4 Rule

`__test-utils__/` is **NEVER** imported in production code. Enforce via ESLint:

```json
{
  "rules": {
    "no-restricted-imports": ["error", {
      "patterns": [{
        "group": ["*__test-utils__*"],
        "message": "Test utilities must not be imported in production code."
      }]
    }]
  }
}
```

---

## 10. Summary: What Gets Tested Where

| Component | T1 Unit | T2 Integration | T3 E2E | T4 Smoke |
|-----------|---------|----------------|---------|----------|
| Scoring engine | ✅ Exhaustive | — | — | — |
| Risk level thresholds | ✅ Boundary | — | — | — |
| LLM response parsing | ✅ Schema | ✅ Malformed handling | — | ✅ Real responses |
| Chat state machine | — | ✅ All scenarios | ✅ Happy path | — |
| Category tracking | — | ✅ Adaptive flow | — | ✅ Coverage check |
| Mode degradation | — | ✅ LLM failure | ✅ UI update | — |
| Prompt structure | ✅ Snapshot | — | — | ✅ Quality check |
| Safety guardrails | — | — | — | ✅ Banned phrases |
| API envelope format | — | ✅ All routes | — | — |
| Session restore | — | ✅ State correctness | ✅ Browser refresh | — |
| PDF generation | — | ✅ Content correct | ✅ Download works | — |
| Voice fallback | — | — | ✅ Button hidden | — |
